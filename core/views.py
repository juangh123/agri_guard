import datetime
import json
import os

from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes, throttle_classes
from rest_framework.renderers import JSONRenderer, StaticHTMLRenderer
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework_simplejwt.tokens import RefreshToken
from django.conf import settings
from django.contrib.auth.models import User
from django.contrib.gis.geos import GEOSGeometry, Polygon
from django.db import IntegrityError, connection, transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from django.http import HttpResponse

from .gnss_evidence import build_report, render_html
from .gnss_logs import (
    MAX_LOG_BYTES,
    GnssLogError,
    accuracy_from_evidence,
    build_boundary_from_log,
    captured_at_from_evidence,
)
from .gnss_validation import GnssValidationError, validate_farm_polygon, validate_gnss_accuracy
from .models import Farm, DisasterEvent, GnssCaptureLog, RiskAlert, Claim
from .serializers import FarmSerializer, DisasterEventSerializer, RiskAlertSerializer, ClaimSerializer
from .throttles import GnssParseRateThrottle, RegisterRateThrottle

class FarmViewSet(viewsets.ModelViewSet):
    queryset = Farm.objects.all()
    serializer_class = FarmSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

    # The demo map stays publicly readable, but every write and per-farm action
    # (test_sms / test_wallet / update / delete) must stay inside the caller's
    # own farms. Without this, any authenticated account could mutate or probe
    # another farmer's contact and payout details.
    PUBLIC_ACTIONS = {'list', 'retrieve', 'risk_status', 'gnss_evidence', 'gnss_evidence_html'}

    def get_queryset(self):
        queryset = Farm.objects.all().order_by('id')
        if self.action in self.PUBLIC_ACTIONS:
            return queryset
        user = self.request.user
        if not user.is_authenticated:
            return queryset.none()
        return queryset.filter(owner=user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user, gnss_source='browser')

    # -- GNSS evidence ------------------------------------------------------
    # Public like the map (no owner, phone or wallet in it); see core/gnss_evidence.py.
    @action(detail=True, methods=['get'], url_path='gnss-evidence', renderer_classes=[JSONRenderer])
    def gnss_evidence(self, request, pk=None):
        return Response(build_report(self.get_object()))

    @action(detail=True, methods=['get'], url_path='gnss-evidence/html', renderer_classes=[StaticHTMLRenderer])
    def gnss_evidence_html(self, request, pk=None):
        farm = self.get_object()
        # Relative, so it stays correct behind the proxy whatever host/scheme it forwards.
        json_url = request.path.rsplit('html', 1)[0]
        response = Response(render_html(build_report(farm), json_url))
        response['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:"
        return response

    # The raw receiver log can carry when the farmer was on the plot; owner only.
    @action(detail=True, methods=['get'], url_path='gnss-log', permission_classes=[IsAuthenticated])
    def gnss_log(self, request, pk=None):
        farm = self.get_object()
        log = GnssCaptureLog.objects.filter(farm=farm).first()
        if log is None:
            return Response({'error': 'This farm has no stored receiver log.'}, status=status.HTTP_404_NOT_FOUND)
        filename = (log.filename or f'farm-{farm.id}.{log.format}').replace('"', '')
        response = HttpResponse(log.content, content_type='text/plain; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response['X-Content-SHA256'] = log.sha256
        return response


    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def integration_status(self, request):
        """
        Return integration status and the current user's farms for the Settings page.
        """
        farms = Farm.objects.filter(owner=request.user).order_by('id')

        sms_configured = bool(
            settings.LIVE_SMS_ENABLED
            and settings.TWILIO_ACCOUNT_SID
            and settings.TWILIO_AUTH_TOKEN
            and settings.TWILIO_PHONE_NUMBER
        )
        web3_rpc = os.getenv('WEB3_PROVIDER_URI') or os.getenv('WEB3_RPC_URL')
        web3_private_key = os.getenv('WEB3_PRIVATE_KEY') or os.getenv('ORACLE_PRIVATE_KEY')
        web3_contract = os.getenv('SMART_CONTRACT_ADDRESS')
        web3_configured = bool(
            settings.LIVE_SETTLEMENT_ENABLED
            and web3_rpc
            and web3_private_key
            and web3_contract
        )

        return Response({
            'sms': {
                'configured': sms_configured,
                'live_enabled': settings.LIVE_SMS_ENABLED,
                'provider': 'Twilio',
                'from_number': settings.TWILIO_PHONE_NUMBER or '',
                'mode': 'live' if sms_configured else 'mock',
            },
            'web3': {
                'configured': web3_configured,
                'live_enabled': settings.LIVE_SETTLEMENT_ENABLED,
                'rpc_present': bool(web3_rpc),
                'private_key_present': bool(web3_private_key),
                'contract_present': bool(web3_contract),
                'mode': 'live' if web3_configured else 'mock',
            },
            'farms': [
                {
                    'id': farm.id,
                    'name': farm.name,
                    'phone_number': farm.phone_number,
                    'wallet_address': farm.wallet_address or '',
                    'crop_type': farm.crop_type,
                }
                for farm in farms
            ],
        })

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def test_sms(self, request, pk=None):
        """
        Send a test SMS using Twilio when configured, otherwise use the mock path.
        No secrets are returned to the browser.
        """
        farm = self.get_object()
        phone_number = str(request.data.get('phone_number') or farm.phone_number).strip()
        if not phone_number:
            return Response({'ok': False, 'error': 'No phone number configured.'}, status=400)

        message = str(request.data.get('message') or f'AgriGuard test SMS for {farm.name}').strip()
        if not message:
            message = f'AgriGuard test SMS for {farm.name}'

        from .tasks import send_sms_alert
        try:
            sms_result = send_sms_alert(phone_number, message)
            return Response({
                'ok': True,
                'mode': sms_result.get('mode', 'mock'),
                'to': phone_number,
                'provider': sms_result.get('provider'),
                'sid': sms_result.get('sid'),
                'detail': sms_result.get('detail'),
            })
        except Exception as exc:
            return Response({'ok': False, 'error': str(exc)}, status=500)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def test_wallet(self, request, pk=None):
        """
        Validate wallet/Web3 configuration without moving funds.
        """
        farm = self.get_object()
        wallet_address = str(request.data.get('wallet_address') or farm.wallet_address or '').strip()
        if not wallet_address:
            return Response({'ok': False, 'error': 'No wallet address configured.'}, status=400)

        web3_rpc = os.getenv('WEB3_PROVIDER_URI') or os.getenv('WEB3_RPC_URL')
        web3_private_key = os.getenv('WEB3_PRIVATE_KEY') or os.getenv('ORACLE_PRIVATE_KEY')
        web3_contract = os.getenv('SMART_CONTRACT_ADDRESS')

        if not (
            settings.LIVE_SETTLEMENT_ENABLED
            and web3_rpc
            and web3_private_key
            and web3_contract
        ):
            return Response({
                'ok': True,
                'mode': 'mock',
                'wallet_address': wallet_address,
                'detail': 'Wallet address accepted. Set LIVE_SETTLEMENT_ENABLED=True plus WEB3_PROVIDER_URI, WEB3_PRIVATE_KEY and SMART_CONTRACT_ADDRESS for on-chain settlement.',
            })

        from core.services.blockchain_service import BlockchainService
        try:
            service = BlockchainService()
            oracle_address = service.w3.eth.account.from_key(web3_private_key).address
            if not service.w3.is_address(wallet_address):
                return Response({
                    'ok': False,
                    'mode': 'live_configured',
                    'error': 'Wallet address is not a valid Ethereum address.',
                }, status=400)
            return Response({
                'ok': service.w3.is_connected(),
                'mode': 'live',
                'wallet_address': wallet_address,
                'oracle_address': oracle_address,
                'contract_address': web3_contract,
                'rpc_connected': service.w3.is_connected(),
            })
        except Exception as exc:
            return Response({'ok': False, 'mode': 'live_configured', 'error': str(exc)}, status=500)

    @action(detail=True, methods=['get'])
    def risk_status(self, request, pk=None):
        farm = self.get_object()
        alerts = farm.alerts.all()
        highest_risk = "SAFE"
        if alerts.filter(status='DISASTER').exists():
            highest_risk = "DISASTER"
        elif alerts.filter(status='WARNING').exists():
            highest_risk = "WARNING"

        return Response({
            "farm_name": farm.name,
            "active_alerts": alerts.count(),
            "highest_risk": highest_risk
        })

class DisasterEventViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = DisasterEvent.objects.all()
    serializer_class = DisasterEventSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    
    @action(detail=True, methods=['post'])
    def trigger_analysis(self, request, pk=None):
        """
        Manually trigger the spatial analysis and engine logic for a specific event.
        Used for demo purposes.
        """
        from .tasks import process_disaster_event
        event = self.get_object()
        # call synchronously for demo immediate response
        result = process_disaster_event(event.id, is_simulation=True)
        return Response({"status": "Analysis triggered", "details": result})

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def simulate(self, request):
        """
        Create a demo disaster event over an existing farm and run the full pipeline.
        This is the endpoint behind the dashboard's 'Simulate Disaster' button.
        """
        disaster_type = str(request.data.get('event_type', 'FLOOD')).upper()
        allowed_types = ('FLOOD', 'WILDFIRE', 'DROUGHT', 'HEATWAVE')
        if disaster_type not in allowed_types:
            return Response(
                {"error": f"Unsupported event_type. Use one of: {', '.join(allowed_types)}"},
                status=400,
            )

        farm_id = request.data.get('farm_id')
        farm = Farm.objects.filter(id=farm_id).first() if farm_id else Farm.objects.first()
        if not farm:
            return Response(
                {"error": "No farm found. Register a farm first, then simulate a disaster."},
                status=400,
            )

        # Build an affected area slightly larger than the selected farm's envelope.
        extent = farm.geofence.extent
        affected_area = Polygon.from_bbox(
            (
                extent[0] - 0.05,
                extent[1] - 0.05,
                extent[2] + 0.05,
                extent[3] + 0.05,
            )
        )
        affected_area.srid = 4326

        metrics_by_type = {
            'FLOOD': {
                'water_level_m': 3.5,
                'duration_days': 4,
                'rain_anomaly': True,
                'simulation': True,
                'source': 'GEOGLOWS 2.0 ECMWF Streamflow (demo)',
            },
            'WILDFIRE': {
                'fire_area_ha': 12.0,
                'simulation': True,
                'source': 'VIIRS Thermal Hotspots (demo)',
            },
            'DROUGHT': {
                'ndwi': -0.25,
                'simulation': True,
                'source': 'NDWI Satellite Index (demo)',
            },
            'HEATWAVE': {
                'temperature_anomaly_c': 3.1,
                'duration_days': 4,
                'simulation': True,
                'source': 'Temperature Anomaly Index (demo)',
            },
        }

        event = DisasterEvent(
            title=f"[SIMULATED] {disaster_type.title()} Scenario - {timezone.now().strftime('%H:%M:%S')}",
            event_type=disaster_type,
            severity_level=3,
            affected_area=affected_area,
            start_date=timezone.now(),
            eo_metrics=metrics_by_type[disaster_type],
        )
        # The post_save signal would run the pipeline without simulation metrics;
        # this endpoint drives it explicitly below so the event is processed once.
        event._skip_auto_trigger = True
        event.save()

        from .tasks import process_disaster_event
        try:
            result = process_disaster_event(event.id, is_simulation=True)
        except Exception as exc:
            return Response(
                {"error": "Simulation created the event but pipeline execution failed.", "event_id": event.id, "detail": str(exc)},
                status=500,
            )

        return Response({
            "status": "simulated",
            "event_id": event.id,
            "farm_id": farm.id,
            "affected_farms": Farm.objects.filter(geofence__intersects=affected_area).count(),
            "alerts_created": RiskAlert.objects.filter(event=event).count(),
            "claims_created": Claim.objects.filter(alert__event=event).count(),
            "details": result,
        })

class RiskAlertViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = RiskAlert.objects.all()
    serializer_class = RiskAlertSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

class ClaimViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Claim.objects.all().order_by('-triggered_at')
    serializer_class = ClaimSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    lookup_field = 'claim_no'
    
    @action(detail=True, methods=['get'])
    def timeline(self, request, claim_no=None):
        claim = self.get_object()
        serializer = self.get_serializer(claim)
        return Response(serializer.data.get('timeline', []))

def geometry_supplied(data):
    return data.get('geometry') not in (None, '', {})


def unpack_gnss_log(value):
    """Validate the ``gnss_log`` request object; return (content, format, filename)."""
    if not isinstance(value, dict):
        raise GnssLogError('gnss_log must be an object: {"content": "...", "format": "auto|nmea|gpx", "filename": "..."}.')
    content = value.get('content')
    if not isinstance(content, str):
        raise GnssLogError('gnss_log.content must be the text of the NMEA or GPX file.')
    if len(content) > MAX_LOG_BYTES:
        raise GnssLogError(f'The receiver log is larger than {MAX_LOG_BYTES} bytes.')
    log_format = str(value.get('format') or 'auto').strip().lower()
    filename = str(value.get('filename') or '').strip()
    # Only the base name, so a stored filename can never carry a path.
    filename = filename.replace('\\', '/').rsplit('/', 1)[-1][:120]
    return content, log_format, filename


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([GnssParseRateThrottle])
def gnss_parse_log(request):
    """Preview: build a boundary from a receiver log without storing anything.

    The registration page shows this to the farmer before they sign up; the
    sign-up request then sends the same log and the server parses it again.
    """
    if not isinstance(request.data, dict):
        return Response({'error': 'Request body must be a JSON object.'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        content, log_format, filename = unpack_gnss_log(request.data)
        polygon, evidence = build_boundary_from_log(content, log_format, filename)
    except GnssValidationError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response({
        'geometry': json.loads(polygon.geojson),
        'evidence': evidence,
        'accuracy_m': accuracy_from_evidence(evidence),
    })


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([RegisterRateThrottle])
def farmer_register(request):
    """
    Public farmer onboarding endpoint.

    Creates a Django user and a GNSS polygon farm in one request, then returns
    JWT tokens so the newly onboarded farmer is logged in immediately.

    Everything in the body is untrusted: the boundary and GNSS metadata are
    validated by ``core.gnss_validation``. With ``gnss_log`` (raw NMEA/GPX) the
    server builds the boundary and accuracy itself (``core.gnss_logs``) and
    stores the log. The user and farm are created in
    one transaction so a rejected farm never leaves an orphaned account behind.
    """
    if not isinstance(request.data, dict):
        return Response({'error': 'Request body must be a JSON object.'}, status=status.HTTP_400_BAD_REQUEST)

    username = str(request.data.get('username', '')).strip()
    password = str(request.data.get('password', ''))
    farm_name = str(request.data.get('farm_name', '')).strip()
    phone_number = str(request.data.get('phone_number', '')).strip()
    geometry = request.data.get('geometry')
    wallet_address = request.data.get('wallet_address') or None
    if wallet_address is not None:
        wallet_address = str(wallet_address).strip() or None
    gnss_device_id = str(request.data.get('gnss_device_id', '')).strip()
    gnss_captured_raw = request.data.get('gnss_captured_at')
    gnss_log = request.data.get('gnss_log')
    capture_method = str(request.data.get('gnss_capture_method', '')).strip()

    if gnss_log is not None:
        # The server builds the boundary, accuracy and capture time from the log
        # itself; whatever the client claims about them is ignored.
        if geometry_supplied(request.data):
            return Response(
                {'error': 'Send either geometry or gnss_log, not both: with a receiver log the server builds the boundary.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            log_content, log_format, log_filename = unpack_gnss_log(gnss_log)
            geofence, evidence = build_boundary_from_log(log_content, log_format, log_filename)
        except GnssValidationError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        gnss_accuracy_m = accuracy_from_evidence(evidence)
        gnss_captured_at = captured_at_from_evidence(evidence)
        gnss_source = evidence['source']
        if not gnss_device_id:
            gnss_device_id = f"receiver log: {log_filename or evidence['format'].upper()}"[:100]
    else:
        evidence = {}
        gnss_source = {'walk': 'browser_walk', 'quick': 'browser_quick'}.get(capture_method, 'browser')
        try:
            gnss_accuracy_m = validate_gnss_accuracy(request.data.get('gnss_accuracy_m'))
        except GnssValidationError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        gnss_captured_at = parse_datetime(str(gnss_captured_raw)) if gnss_captured_raw else None
        if gnss_captured_raw and not gnss_captured_at:
            return Response({'error': 'gnss_captured_at must be an ISO 8601 datetime.'}, status=status.HTTP_400_BAD_REQUEST)

    if not username or not password:
        return Response({'error': 'Username and password are required.'}, status=status.HTTP_400_BAD_REQUEST)
    if not farm_name or not phone_number or not (geometry or gnss_log is not None):
        return Response({'error': 'farm_name, phone_number, and geometry (or gnss_log) are required.'}, status=status.HTTP_400_BAD_REQUEST)

    # Reject over-long values up front: the database would raise on them and
    # the request would end as a 500 instead of a clear 400.
    for label, value, limit in (
        ('username', username, 150),
        ('farm_name', farm_name, 255),
        ('phone_number', phone_number, 20),
        ('gnss_device_id', gnss_device_id, 100),
        ('wallet_address', wallet_address or '', 42),
    ):
        if len(value) > limit:
            return Response(
                {'error': f'{label} must be at most {limit} characters.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

    if User.objects.filter(username__iexact=username).exists():
        return Response({'error': 'Username is already taken.'}, status=status.HTTP_400_BAD_REQUEST)

    if gnss_log is None:
        try:
            geofence = GEOSGeometry(json.dumps(geometry))
            if geofence.srid is None:
                geofence.srid = 4326
            geofence.transform(4326)
            validate_farm_polygon(geofence)
        except GnssValidationError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({'error': f'Invalid farm geometry: {exc}'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        with transaction.atomic():
            user = User.objects.create_user(username=username, password=password)
            farm = Farm.objects.create(
                owner=user,
                name=farm_name,
                phone_number=phone_number,
                wallet_address=wallet_address,
                geofence=geofence,
                gnss_device_id=gnss_device_id,
                gnss_accuracy_m=gnss_accuracy_m,
                gnss_captured_at=gnss_captured_at,
                gnss_source=gnss_source,
                gnss_evidence=evidence,
            )
            if gnss_log is not None:
                GnssCaptureLog.objects.create(
                    farm=farm,
                    format=evidence['format'],
                    filename=evidence['filename'],
                    sha256=evidence['log_sha256'],
                    size_bytes=evidence['log_bytes'],
                    content=log_content,
                )
    except IntegrityError:
        # Two simultaneous sign-ups can pass the exists() check above together.
        return Response({'error': 'Username is already taken.'}, status=status.HTTP_400_BAD_REQUEST)

    refresh = RefreshToken.for_user(user)
    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'farm_id': farm.id,
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def chat_assistant(request):
    """
    RAG Assistant endpoint. Takes user question, adds context about farms and alerts,
    and returns OpenAI response.
    """
    user_message = request.data.get('message', '')
    if not user_message:
        return Response({"error": "Message is required"}, status=400)
    if len(user_message) > 500:
        return Response({"error": "Message is too long (max 500 characters)"}, status=400)

    from core.services.llm_service import ask_agri_guard_ai

    # 1. Build Context (Retrieval step - simple DB query for MVP, scoped to current user)
    farms = Farm.objects.filter(owner=request.user)
    alerts = RiskAlert.objects.filter(farm__owner=request.user, status__in=['WARNING', 'DISASTER'])
    claims = Claim.objects.filter(farm__owner=request.user)
    
    context = "System Context: You are AgriGuard AI, helping African farmers and insurers.\n"
    context += f"Total registered farms: {farms.count()}.\n"
    context += f"Active risk alerts: {alerts.count()}.\n"
    context += f"Total processed claims: {claims.count()}.\n"
    
    if alerts.exists():
        context += "Recent Alerts:\n"
        for alert in alerts[:3]:
            context += f"- {alert.farm.name} facing {alert.event.get_event_type_display()} ({alert.status}). Confidence: {alert.confidence}%\n"

    # 2. Generation (Call LLM via Service)
    try:
        reply = ask_agri_guard_ai(context, user_message)
        return Response({"reply": reply})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return Response({"error": "AI assistant is temporarily unavailable. Please try again later."}, status=503)


@api_view(['GET'])
@permission_classes([AllowAny])
def health(request):
    """
    Unauthenticated deployment probe.

    The public demo has twice failed in ways that looked like "empty data" from
    the browser: a vanished database and a container that exited before Daphne
    started. Both produced a UI full of zeros with no explanation, so this
    endpoint reports reachability, engine, persistence mode and row counts, and
    answers 503 while the database is unusable.
    """
    engine = connection.settings_dict.get('ENGINE', '')
    persistence_mode = os.getenv('AGRIGUARD_PERSISTENCE_MODE', '').strip().lower()
    if persistence_mode not in {'persistent', 'ephemeral'}:
        # Older containers did not export the mode; infer it from the engine.
        persistence_mode = 'ephemeral' if 'sqlite' in engine else 'persistent'

    degraded_reason = os.getenv('AGRIGUARD_DEGRADED_REASON', '').strip() or None
    started_at_raw = os.getenv('AGRIGUARD_STARTED_AT', '').strip()
    started_at = parse_datetime(started_at_raw.replace('Z', '+00:00')) if started_at_raw else None
    if started_at is not None and timezone.is_naive(started_at):
        started_at = timezone.make_aware(started_at, datetime.timezone.utc)
    uptime_seconds = (
        max(0, int((timezone.now() - started_at).total_seconds()))
        if started_at is not None
        else None
    )

    payload = {
        'status': 'ok',
        'persistence_mode': persistence_mode,
        'degraded': persistence_mode == 'ephemeral',
        'degraded_reason': degraded_reason,
        'started_at': started_at.isoformat() if started_at is not None else None,
        'uptime_seconds': uptime_seconds,
        'database': {
            'engine': engine.rsplit('.', 1)[-1] or 'unknown',
            'reachable': False,
            'error': None,
        },
        'migrations': {'applied': None, 'latest': None},
        'data': {'farms': None, 'claims': None, 'alerts': None},
        'environment': os.getenv('VERCEL_ENV') or ('production' if not settings.DEBUG else 'local'),
        'release': (os.getenv('VERCEL_GIT_COMMIT_SHA') or '')[:7] or None,
        'time': timezone.now().isoformat(),
    }

    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
        payload['database']['reachable'] = True
    except Exception as exc:  # noqa: BLE001 - surfaced verbatim to operators
        payload['status'] = 'degraded'
        payload['database']['error'] = str(exc).strip()[:500]
        return Response(payload, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT app, name FROM django_migrations ORDER BY applied DESC, id DESC LIMIT 1')
            latest = cursor.fetchone()
            cursor.execute('SELECT COUNT(*) FROM django_migrations')
            payload['migrations'] = {
                'applied': cursor.fetchone()[0],
                'latest': f'{latest[0]}.{latest[1]}' if latest else None,
            }
    except Exception as exc:  # noqa: BLE001 - migrations may not exist yet
        payload['migrations']['error'] = str(exc).strip()[:200]

    try:
        payload['data'] = {
            'farms': Farm.objects.count(),
            'claims': Claim.objects.count(),
            'alerts': RiskAlert.objects.count(),
        }
    except Exception as exc:  # noqa: BLE001 - tables may not exist yet
        payload['data']['error'] = str(exc).strip()[:200]
        payload['status'] = 'degraded'

    return Response(payload)
