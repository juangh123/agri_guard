import datetime as dt
from decimal import Decimal

from django.contrib.auth.models import User
from django.contrib.gis.geos import Polygon
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from core.engine import ParametricClaimEngine
from core.models import Claim, ClaimTimeline, DisasterEvent, Farm, RiskAlert
from core.tasks import compute_evidence_hash


# ---------------------------------------------------------------------------
# Demo farms
#
# Each boundary follows a real field edge visible in Esri World Imagery, so the
# polygon lines up with the satellite basemap when a judge zooms in. The plots
# sit in Kenya's Rift Valley farm belt and are sized like smallholdings
# (roughly 1-3 ha), not like the 11 km demo squares the seed used to create.
#
# The GNSS capture metadata is a labeled simulation: the device id starts with
# "demo-sim" so nobody mistakes it for a field survey. Real registrations take
# accuracy and capture time from the device (see frontend Register.jsx).
# ---------------------------------------------------------------------------
DEMO_GNSS_DEVICE = 'demo-sim: dual-frequency handset profile (Galileo E1/E5a + GPS L1/L5)'

DEMO_FARMS = [
    {
        'name': 'Mwangi Farm',
        'owner': 'farmer',
        'crop_type': 'maize',
        'locality': 'Kitale, Trans Nzoia County',
        'phone_number': '+254700000001',
        'wallet_address': '0x1111111111111111111111111111111111111111',
        'boundary': [
            (34.966371, 1.058661), (34.967465, 1.058704),
            (34.967508, 1.056623), (34.966414, 1.056537),
        ],
        'gnss_accuracy_m': 1.8,
        'gnss_captured_at': '2026-03-09T06:48:00+00:00',
    },
    {
        'name': 'Achieng Farm',
        'owner': 'farmer',
        'crop_type': 'wheat',
        'locality': 'Njoro, Nakuru County',
        'phone_number': '+254700000002',
        'wallet_address': '0x2222222222222222222222222222222222222222',
        'boundary': [
            (35.891862, -0.357579), (35.893385, -0.357955),
            (35.893042, -0.358834), (35.891690, -0.358512),
        ],
        'gnss_accuracy_m': 2.1,
        'gnss_captured_at': '2026-03-11T07:15:00+00:00',
    },
    {
        'name': 'Nafula Farm',
        'owner': 'demo',
        'crop_type': 'livestock',
        'locality': 'Uasin Gishu County',
        'phone_number': '+254700000003',
        'wallet_address': '0x3333333333333333333333333333333333333333',
        'boundary': [
            (35.191290, 0.712473), (35.192277, 0.712645), (35.192299, 0.711057),
            (35.191998, 0.711357), (35.191677, 0.711668), (35.191344, 0.711979),
        ],
        'gnss_accuracy_m': 2.4,
        'gnss_captured_at': '2026-03-12T08:02:00+00:00',
    },
]

# Deterministic demo history, keyed by claim number so it stays idempotent across
# restarts and reseeds. (claim_no, farm name, event external id, days ago)
DEMO_CLAIMS = [
    ('CLM-2026-8109', 'Mwangi Farm', 'DEMO-EONET-DROUGHT-01', 88),
    ('CLM-2026-1498', 'Achieng Farm', 'DEMO-EONET-DROUGHT-01', 81),
    ('CLM-2026-5916', 'Nafula Farm', 'DEMO-EONET-HEATWAVE-01', 74),
    ('CLM-2026-2247', 'Mwangi Farm', 'DEMO-EONET-FLOOD-01', 62),
    ('CLM-2026-9034', 'Achieng Farm', 'DEMO-EONET-FLOOD-01', 55),
    ('CLM-2026-4412', 'Nafula Farm', 'DEMO-EONET-DROUGHT-01', 41),
    ('CLM-2026-6680', 'Mwangi Farm', 'DEMO-EONET-WILDFIRE-01', 27),
    ('CLM-2026-1173', 'Achieng Farm', 'DEMO-EONET-HEATWAVE-01', 12),
    ('CLM-2026-7725', 'Nafula Farm', 'DEMO-EONET-FLOOD-01', 5),
]

# (external id, title, type, severity, days ago, footprint margin in degrees, metrics)
# Metric keys are the ones the rule engine reads, so every seeded claim can be
# reproduced by ParametricClaimEngine. All values are labeled simulations.
DEMO_EVENTS = [
    ('DEMO-EONET-DROUGHT-01', 'Rift Valley drought watch', 'DROUGHT', 3, 92, 0.25,
     {'ndwi': -0.34, 'rainfall_deficit_pct': 42.0, 'consecutive_dry_days': 21,
      'simulation': True, 'source': 'Labeled demo NDWI composite'}),
    ('DEMO-EONET-HEATWAVE-01', 'Rift Valley highlands heat anomaly', 'HEATWAVE', 2, 76, 0.20,
     {'temperature_anomaly_c': 2.6, 'duration_days': 4,
      'simulation': True, 'source': 'Labeled demo temperature anomaly'}),
    ('DEMO-EONET-FLOOD-01', 'Long-rains flood surge, Rift Valley', 'FLOOD', 3, 63, 0.15,
     {'water_level_m': 4.8, 'duration_days': 5, 'rain_anomaly': True, 'streamflow_percentile': 96.0,
      'simulation': True, 'source': 'Labeled demo streamflow (GEOGLOWS-style)'}),
    ('DEMO-EONET-WILDFIRE-01', 'Trans Nzoia grassland fire perimeter', 'WILDFIRE', 2, 28, 0.02,
     {'fire_area_ha': 218.5, 'confidence_pct': 78.0,
      'simulation': True, 'source': 'Labeled demo VIIRS-style burn area'}),
]

# Milliseconds after detection for each recorded step. These mirror a measured
# /api/events/simulate/ run, where the whole pipeline finishes in about 4 ms.
TIMELINE_OFFSETS = (
    ('DETECTED', 0),
    ('VERIFIED', 1.3),
    ('TRIGGERED', 2.1),
    ('NOTIFIED', 3.5),
    ('PENDING', 4.4),
)

BASE_RATE = Decimal('25.00')
AREA_MIN_HA = Decimal('0.50')
AREA_CAP_HA = Decimal('5.00')


def boundary_polygon(boundary):
    ring = list(boundary) + [boundary[0]]
    return Polygon(ring, srid=4326)


def area_ha(polygon):
    """Geodesic-ish area in hectares (same projection the payout engine uses)."""
    return polygon.transform(3857, clone=True).area / 10000


def footprint(boundaries, margin):
    lons = [lon for boundary in boundaries for lon, _lat in boundary]
    lats = [lat for boundary in boundaries for _lon, lat in boundary]
    return Polygon.from_bbox((
        min(lons) - margin, min(lats) - margin,
        max(lons) + margin, max(lats) + margin,
    ))


class Command(BaseCommand):
    help = 'Idempotently seed (and repair) the AgriGuard demo users, farms, events and claims'

    @transaction.atomic
    def handle(self, *args, **options):
        # One transaction: a failed repair leaves the previous demo data intact.
        self._stats = {'farms': 0, 'farms_updated': 0, 'events': 0, 'alerts': 0, 'claims': 0}
        users = self._seed_users()
        farms = self._seed_farms(users)
        events = self._seed_events()
        stats = self._seed_claims(farms, events)

        self.stdout.write(self.style.SUCCESS(
            f"Demo data ready. Farms {stats['farms']} created / {stats['farms_updated']} repaired, "
            f"events {stats['events']} created, alerts {stats['alerts']} created, "
            f"claims {stats['claims']} created. Login with demo/demo123 or farmer/farmer123."
        ))

    # -- users ----------------------------------------------------------------
    def _seed_users(self):
        # The credentials are public in the README and frontend bundle. Keep this
        # account unprivileged so it can drive the demo without exposing Django admin.
        demo_admin, _ = User.objects.get_or_create(
            username='demo',
            defaults={'email': 'demo@agriguard.africa'},
        )
        demo_admin.set_password('demo123')
        demo_admin.is_staff = False
        demo_admin.is_superuser = False
        demo_admin.save()

        demo_farmer, _ = User.objects.get_or_create(
            username='farmer',
            defaults={'email': 'farmer@agriguard.africa'},
        )
        demo_farmer.set_password('farmer123')
        demo_farmer.save()
        return {'demo': demo_admin, 'farmer': demo_farmer}

    # -- farms ----------------------------------------------------------------
    def _seed_farms(self, users):
        farms = {}
        for spec in DEMO_FARMS:
            wanted = {
                'crop_type': spec['crop_type'],
                'geofence': boundary_polygon(spec['boundary']),
                'gnss_device_id': DEMO_GNSS_DEVICE,
                'gnss_accuracy_m': spec['gnss_accuracy_m'],
                'gnss_captured_at': parse_datetime(spec['gnss_captured_at']),
            }
            farm = Farm.objects.filter(
                name=spec['name'], owner__username__in=('demo', 'farmer'),
            ).order_by('id').first()
            if farm is None:
                farm = Farm.objects.create(
                    owner=users[spec['owner']],
                    name=spec['name'],
                    phone_number=spec['phone_number'],
                    wallet_address=spec['wallet_address'],
                    **wanted,
                )
                self._stats['farms'] += 1
            elif self._farm_needs_repair(farm, wanted):
                # Earlier seeds stored 11 km squares over city centres with no GNSS
                # metadata. Repair only the demo-owned farm so user data is untouched.
                for field, value in wanted.items():
                    setattr(farm, field, value)
                farm.save(update_fields=list(wanted))
                self._stats['farms_updated'] += 1
            farms[spec['name']] = farm
        return farms

    @staticmethod
    def _farm_needs_repair(farm, wanted):
        if farm.crop_type != wanted['crop_type']:
            return True
        if farm.gnss_device_id != wanted['gnss_device_id']:
            return True
        if farm.gnss_accuracy_m != wanted['gnss_accuracy_m']:
            return True
        if farm.gnss_captured_at != wanted['gnss_captured_at']:
            return True
        return not farm.geofence.equals_exact(wanted['geofence'], tolerance=1e-7)

    # -- events ---------------------------------------------------------------
    def _seed_events(self):
        boundaries = {spec['name']: spec['boundary'] for spec in DEMO_FARMS}
        affected = {}
        for _claim_no, farm_name, external_id, _days in DEMO_CLAIMS:
            affected.setdefault(external_id, []).append(boundaries[farm_name])

        now = timezone.now()
        events = {}
        for external_id, title, event_type, severity, days_ago, margin, metrics in DEMO_EVENTS:
            area = footprint(affected[external_id], margin)
            area.srid = 4326
            event = DisasterEvent.objects.filter(external_id=external_id).first()
            if event is None:
                event = DisasterEvent(
                    external_id=external_id,
                    start_date=now - dt.timedelta(days=days_ago),
                )
                self._stats['events'] += 1
            event.title = title
            event.event_type = event_type
            event.severity_level = severity
            event.affected_area = area
            event.eo_metrics = metrics
            # The post_save hook would run the live analysis pipeline and mint
            # extra random claims on top of the deterministic ones below.
            event._skip_auto_trigger = True
            event.save()
            events[external_id] = event
        return events

    # -- alerts, claims, timelines -------------------------------------------
    def _seed_claims(self, farms, events):
        engine = ParametricClaimEngine()
        now = timezone.now()

        for claim_no, farm_name, external_id, days_ago in DEMO_CLAIMS:
            farm = farms[farm_name]
            event = events[external_id]
            trigger = engine.evaluate_farm_status(farm, event)
            if not trigger['claim_triggered']:
                raise RuntimeError(
                    f'Demo claim {claim_no} is not reproducible: the rule engine did not '
                    f'trigger {event.event_type} for {farm.name} ({trigger["reason"]}).'
                )
            confidence_pct = min(max(trigger['confidence_score'] * 100, 0), 100)
            payout = Decimal(engine.calculate_payout(farm, event, trigger)).quantize(Decimal('0.01'))

            alert, alert_created = RiskAlert.objects.get_or_create(farm=farm, event=event)
            if alert_created:
                self._stats['alerts'] += 1
            # Only the three most recent hazards count as active, which is what the
            # dashboard's "High Risk Zones" KPI reports; older ones are already notified.
            alert.status = 'DISASTER' if days_ago <= 30 else 'SENT'
            alert.confidence = Decimal(str(confidence_pct))
            alert.ai_damage_report = (
                f'Deterministic demo assessment for {farm.name}: {trigger["reason"]}'
            )
            alert.save(update_fields=['status', 'confidence', 'ai_damage_report'])

            triggered_at = now - dt.timedelta(days=days_ago)
            claim = Claim.objects.filter(claim_no=claim_no).first()
            if claim is None:
                claim = Claim(claim_no=claim_no, status='PENDING')
                self._stats['claims'] += 1
            if claim.status == 'PAID' or claim.tx_hash:
                # Never rewrite a claim that recorded a real settlement.
                continue
            claim.farm = farm
            claim.alert = alert
            claim.status = 'PENDING'
            claim.payout_amount = payout
            claim.evidence_hash = compute_evidence_hash(farm, event, confidence_pct)
            claim.save()
            # triggered_at is auto_now_add, so backdate it explicitly. Spreading the
            # claims over three months is what gives the dashboard its bars.
            Claim.objects.filter(pk=claim.pk).update(triggered_at=triggered_at)

            self._sync_timeline(claim, farm, event, trigger, confidence_pct, payout, triggered_at)

        return self._stats

    def _sync_timeline(self, claim, farm, event, trigger, confidence_pct, payout, triggered_at):
        details = self._timeline_details(farm, event, confidence_pct, payout)
        existing = {}
        for row in ClaimTimeline.objects.filter(claim=claim).order_by('created_at', 'id'):
            existing.setdefault(row.status, row)

        for step, offset in TIMELINE_OFFSETS:
            at = triggered_at + dt.timedelta(milliseconds=offset)
            row = existing.get(step)
            if row is None:
                row = ClaimTimeline.objects.create(claim=claim, status=step, detail=details[step])
            elif row.detail != details[step]:
                row.detail = details[step]
                row.save(update_fields=['detail'])
            # created_at is auto_now_add; anchor every step to the claim's trigger time.
            ClaimTimeline.objects.filter(pk=row.pk).update(created_at=at)

    @staticmethod
    def _timeline_details(farm, event, confidence_pct, payout):
        polygon_area = Decimal(str(area_ha(farm.geofence)))
        insured_area = min(max(polygon_area, AREA_MIN_HA), AREA_CAP_HA)
        confidence = Decimal(str(confidence_pct)) / Decimal('100')
        partial = ' x 50% partial' if event.severity_level < 3 else ''
        peril = event.get_event_type_display()
        accuracy = f'±{farm.gnss_accuracy_m:g} m' if farm.gnss_accuracy_m is not None else 'accuracy unset'
        return {
            'DETECTED': (
                f"[SIMULATED] {peril} footprint '{event.title}' intersects the GNSS boundary "
                f'of {farm.name} (PostGIS ST_Intersects).'
            ),
            'VERIFIED': (
                f'[SIMULATED] Labeled demo EO metrics checked against {farm.crop_type} thresholds; '
                f'confidence {confidence_pct:.0f}% is not claim-grade. '
                f'GNSS boundary {polygon_area:.2f} ha, {accuracy}.'
            ),
            'TRIGGERED': (
                f'Parametric rule met: ${payout} = ${BASE_RATE}/ha x {insured_area:.2f} ha '
                f'x severity {event.severity_level} x {confidence:.2f}{partial}.'
            ),
            'NOTIFIED': 'Farmer SMS queued through the labeled mock sender (Twilio not enabled).',
            'PENDING': (
                'Settlement PENDING: on-chain payouts are not configured, so no funds moved '
                'and no TxHash exists.'
            ),
        }
