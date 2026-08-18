import json
import os

from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework_simplejwt.tokens import RefreshToken
from django.conf import settings
from django.contrib.auth.models import User
from django.contrib.gis.geos import GEOSGeometry, Polygon
from django.utils import timezone

from .models import Farm, DisasterEvent, RiskAlert, Claim
from .serializers import FarmSerializer, DisasterEventSerializer, RiskAlertSerializer, ClaimSerializer

class FarmViewSet(viewsets.ModelViewSet):
    queryset = Farm.objects.all()
    serializer_class = FarmSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def settings(self, request):
        """
        Return integration status and the current user's farms for the Settings page.
        """
        farms = Farm.objects.filter(owner=request.user).order_by('id')

        sms_configured = bool(
            settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_PHONE_NUMBER
        )
        web3_rpc = os.getenv('WEB3_PROVIDER_URI') or os.getenv('WEB3_RPC_URL')
        web3_private_key = os.getenv('WEB3_PRIVATE_KEY') or os.getenv('ORACLE_PRIVATE_KEY')
        web3_contract = os.getenv('SMART_CONTRACT_ADDRESS')
        web3_configured = bool(web3_rpc and web3_private_key and web3_contract)

        return Response({
            'sms': {
                'configured': sms_configured,
                'provider': 'Twilio',
                'from_number': settings.TWILIO_PHONE_NUMBER or '',
                'mode': 'live' if sms_configured else 'mock',
            },
            'web3': {
                'configured': web3_configured,
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
        message = str(request.data.get('message') or f'AgriGuard test SMS for {farm.name}').strip()
        if not message:
            message = f'AgriGuard test SMS for {farm.name}'

        from .tasks import send_sms_alert
        try:
            send_sms_alert(farm.phone_number, message)
            return Response({
                'ok': True,
                'mode': 'live' if (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_PHONE_NUMBER) else 'mock',
                'to': farm.phone_number,
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

        if not (web3_rpc and web3_private_key and web3_contract):
            return Response({
                'ok': True,
                'mode': 'mock',
                'wallet_address': wallet_address,
                'detail': 'Wallet address accepted. Set WEB3_PROVIDER_URI, WEB3_PRIVATE_KEY and SMART_CONTRACT_ADDRESS for on-chain settlement.',
            })

        from core.services.blockchain_service import BlockchainService
        try:
            service = BlockchainService()
            oracle_address = service.w3.eth.account.from_key(web3_private_key).address
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

class DisasterEventViewSet(viewsets.ModelViewSet):
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
        allowed_types = ('FLOOD', 'WILDFIRE', 'DROUGHT')
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
                'source': 'GEOGLOWS 2.0 ECMWF Streamflow (demo)',
            },
            'WILDFIRE': {
                'fire_area_ha': 12.0,
                'source': 'VIIRS Thermal Hotspots (demo)',
            },
            'DROUGHT': {
                'ndwi': -0.25,
                'source': 'NDWI Satellite Index (demo)',
            },
        }

        event = DisasterEvent.objects.create(
            title=f"{disaster_type.title()} Demo Event - {timezone.now().strftime('%H:%M:%S')}",
            event_type=disaster_type,
            severity_level=3,
            affected_area=affected_area,
            start_date=timezone.now(),
            eo_metrics=metrics_by_type[disaster_type],
        )

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

class RiskAlertViewSet(viewsets.ModelViewSet):
    queryset = RiskAlert.objects.all()
    serializer_class = RiskAlertSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

class ClaimViewSet(viewsets.ModelViewSet):
    queryset = Claim.objects.all().order_by('-triggered_at')
    serializer_class = ClaimSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    lookup_field = 'claim_no'
    
    @action(detail=True, methods=['get'])
    def timeline(self, request, claim_no=None):
        claim = self.get_object()
        serializer = self.get_serializer(claim)
        return Response(serializer.data.get('timeline', []))

@api_view(['POST'])
@permission_classes([AllowAny])
def farmer_register(request):
    """
    Public farmer onboarding endpoint.

    Creates a Django user and a GNSS polygon farm in one request, then returns
    JWT tokens so the newly onboarded farmer is logged in immediately.
    """
    username = str(request.data.get('username', '')).strip()
    password = str(request.data.get('password', ''))
    farm_name = str(request.data.get('farm_name', '')).strip()
    phone_number = str(request.data.get('phone_number', '')).strip()
    geometry = request.data.get('geometry')
    wallet_address = request.data.get('wallet_address') or None

    if not username or not password:
        return Response({'error': 'Username and password are required.'}, status=status.HTTP_400_BAD_REQUEST)
    if not farm_name or not phone_number or not geometry:
        return Response({'error': 'farm_name, phone_number, and geometry are required.'}, status=status.HTTP_400_BAD_REQUEST)
    if User.objects.filter(username__iexact=username).exists():
        return Response({'error': 'Username is already taken.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        geofence = GEOSGeometry(json.dumps(geometry))
        if geofence.srid is None:
            geofence.srid = 4326
        geofence.transform(4326)
        if geofence.geom_type != 'Polygon':
            return Response({'error': 'The supplied farm geometry must be a Polygon.'}, status=status.HTTP_400_BAD_REQUEST)
        if not geofence.valid:
            return Response({'error': 'The supplied farm geometry is invalid.'}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as exc:
        return Response({'error': f'Invalid farm geometry: {exc}'}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.create_user(username=username, password=password)
    farm = Farm.objects.create(
        owner=user,
        name=farm_name,
        phone_number=phone_number,
        wallet_address=wallet_address,
        geofence=geofence,
    )

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
