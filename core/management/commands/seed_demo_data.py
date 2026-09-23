from django.contrib.auth.models import User
from django.contrib.gis.geos import Polygon
from django.core.management.base import BaseCommand
from django.utils import timezone

import datetime as dt
import hashlib

from core.models import Claim, ClaimTimeline, DisasterEvent, Farm, RiskAlert


# Deterministic demo history. The dashboard screenshots in docs/ were captured
# against a database that already held claims, so a fresh deployment used to
# render an empty chart. These rows are keyed by claim number and stay
# idempotent across restarts and reseeds.
# (claim_no, farm name, event external id, payout, days ago)
DEMO_CLAIMS = [
    ('CLM-2026-8109', 'Mwangi Farm', 'DEMO-EONET-DROUGHT-01', '356.00', 88),
    ('CLM-2026-1498', 'Achieng Farm', 'DEMO-EONET-DROUGHT-01', '371.00', 81),
    ('CLM-2026-5916', 'Nafula Farm', 'DEMO-EONET-HEATWAVE-01', '338.00', 74),
    ('CLM-2026-2247', 'Mwangi Farm', 'DEMO-EONET-FLOOD-01', '420.00', 62),
    ('CLM-2026-9034', 'Achieng Farm', 'DEMO-EONET-FLOOD-01', '385.00', 55),
    ('CLM-2026-4412', 'Nafula Farm', 'DEMO-EONET-DROUGHT-01', '410.00', 41),
    ('CLM-2026-6680', 'Mwangi Farm', 'DEMO-EONET-WILDFIRE-01', '395.00', 27),
    ('CLM-2026-1173', 'Achieng Farm', 'DEMO-EONET-HEATWAVE-01', '405.00', 12),
    ('CLM-2026-7725', 'Nafula Farm', 'DEMO-EONET-FLOOD-01', '410.00', 5),
]

# (external id, title, type, severity, days ago, metrics)
DEMO_EVENTS = [
    ('DEMO-EONET-DROUGHT-01', 'Rift Valley drought watch', 'DROUGHT', 3, 92,
     {'ndwi_anomaly': -0.31, 'rainfall_deficit_pct': 42.0, 'consecutive_dry_days': 21}),
    ('DEMO-EONET-HEATWAVE-01', 'Central highlands heat anomaly', 'HEATWAVE', 2, 76,
     {'temperature_anomaly_c': 2.4, 'consecutive_hot_days': 3}),
    ('DEMO-EONET-FLOOD-01', 'Tana basin flood surge', 'FLOOD', 3, 63,
     {'water_level_m': 4.8, 'streamflow_percentile': 96.0}),
    ('DEMO-EONET-WILDFIRE-01', 'Laikipia wildfire perimeter', 'WILDFIRE', 2, 28,
     {'fire_area_ha': 218.5, 'confidence_pct': 78.0}),
]

FARM_AREAS = {
    'Mwangi Farm': ((36.78, -1.32), (36.92, -1.18)),
    'Achieng Farm': ((34.73, -0.12), (34.87, 0.02)),
    'Nafula Farm': ((35.25, 0.48), (35.39, 0.62)),
}


class Command(BaseCommand):
    help = 'Idempotently seed demo users and farms for the AgriGuard demo'

    def handle(self, *args, **options):
        # The credentials are public in the README and frontend bundle. Keep this
        # account unprivileged so it can drive the demo without exposing Django admin.
        demo_admin, admin_created = User.objects.get_or_create(
            username='demo',
            defaults={'email': 'demo@agriguard.africa'},
        )
        demo_admin.set_password('demo123')
        demo_admin.is_staff = False
        demo_admin.is_superuser = False
        demo_admin.save()

        demo_farmer, farmer_created = User.objects.get_or_create(
            username='farmer',
            defaults={'email': 'farmer@agriguard.africa'},
        )
        demo_farmer.set_password('farmer123')
        demo_farmer.save()

        farms = [
            {
                'owner': demo_farmer,
                'name': 'Mwangi Farm',
                'crop_type': 'maize',
                'phone_number': '+254700000001',
                'wallet_address': '0x1111111111111111111111111111111111111111',
                'geofence': Polygon(
                    ((36.80, -1.30), (36.80, -1.20), (36.90, -1.20), (36.90, -1.30), (36.80, -1.30)),
                    srid=4326,
                ),
            },
            {
                'owner': demo_farmer,
                'name': 'Achieng Farm',
                'crop_type': 'wheat',
                'phone_number': '+254700000002',
                'wallet_address': '0x2222222222222222222222222222222222222222',
                'geofence': Polygon(
                    ((34.75, -0.10), (34.75, 0.00), (34.85, 0.00), (34.85, -0.10), (34.75, -0.10)),
                    srid=4326,
                ),
            },
            {
                'owner': demo_admin,
                'name': 'Nafula Farm',
                'crop_type': 'livestock',
                'phone_number': '+254700000003',
                'wallet_address': '0x3333333333333333333333333333333333333333',
                'geofence': Polygon(
                    ((35.27, 0.50), (35.27, 0.60), (35.37, 0.60), (35.37, 0.50), (35.27, 0.50)),
                    srid=4326,
                ),
            },
        ]

        created_count = 0
        farms_by_name = {}
        for farm_data in farms:
            farm, created = Farm.objects.get_or_create(
                name=farm_data['name'],
                defaults=farm_data,
            )
            farms_by_name[farm.name] = farm
            if created:
                created_count += 1

        now = timezone.now()

        # Which farms each event has to cover, derived from the demo claims.
        affected_by_event = {}
        for _claim_no, farm_name, external_id, _payout, _days in DEMO_CLAIMS:
            affected_by_event.setdefault(external_id, set()).add(farm_name)

        events_by_external_id = {}
        events_created = 0
        for external_id, title, event_type, severity, days_ago, metrics in DEMO_EVENTS:
            names = affected_by_event.get(external_id, set())
            longitudes = [FARM_AREAS[name][corner][0] for name in names for corner in (0, 1)]
            latitudes = [FARM_AREAS[name][corner][1] for name in names for corner in (0, 1)]
            if not longitudes or not latitudes:
                continue
            area = Polygon(
                (
                    (min(longitudes), min(latitudes)),
                    (min(longitudes), max(latitudes)),
                    (max(longitudes), max(latitudes)),
                    (max(longitudes), min(latitudes)),
                    (min(longitudes), min(latitudes)),
                ),
                srid=4326,
            )
            event = DisasterEvent.objects.filter(external_id=external_id).first()
            if event is None:
                event = DisasterEvent(
                    external_id=external_id,
                    title=title,
                    event_type=event_type,
                    affected_area=area,
                    start_date=now - dt.timedelta(days=days_ago),
                    severity_level=severity,
                    eo_metrics=metrics,
                )
                # The post_save hook would run the live analysis pipeline and mint
                # extra random claims on top of the deterministic ones below.
                event._skip_auto_trigger = True
                event.save()
                events_created += 1
            events_by_external_id[external_id] = event

        # A cold deployment used to render an empty claims chart because only the
        # farms were seeded. Rebuilding the same nine claims keeps the dashboard
        # consistent with docs/screenshots on every restart.
        alerts_created = 0
        claims_created = 0
        for claim_no, farm_name, external_id, payout, days_ago in DEMO_CLAIMS:
            farm = farms_by_name.get(farm_name)
            event = events_by_external_id.get(external_id)
            if farm is None or event is None:
                continue

            alert, alert_created = RiskAlert.objects.get_or_create(
                farm=farm,
                event=event,
                defaults={
                    # Only the three most recent hazards count as active, which is
                    # what the dashboard's "High Risk Zones" KPI reports; the older
                    # ones are marked as already notified.
                    'status': 'DISASTER' if days_ago <= 30 else 'SENT',
                    'confidence': 92.5 if days_ago <= 30 else 81.0,
                    'ai_damage_report': (
                        f'Deterministic demo assessment for {farm.name}: '
                        f'{event.get_event_type_display()} indicators exceed the parametric threshold.'
                    ),
                },
            )
            if alert_created:
                alerts_created += 1

            claim, claim_created = Claim.objects.get_or_create(
                claim_no=claim_no,
                defaults={
                    'farm': farm,
                    'alert': alert,
                    'status': 'PENDING',
                    'payout_amount': payout,
                    'evidence_hash': hashlib.sha256(
                        f'{claim_no}:{external_id}'.encode('utf-8')
                    ).hexdigest(),
                },
            )
            if claim_created:
                claims_created += 1

            # triggered_at is auto_now_add, so backdate it explicitly. Spreading
            # the claims over three months is what gives the dashboard its bars.
            Claim.objects.filter(pk=claim.pk).update(triggered_at=now - dt.timedelta(days=days_ago))

            if not ClaimTimeline.objects.filter(claim=claim).exists():
                ClaimTimeline.objects.bulk_create([
                    ClaimTimeline(
                        claim=claim,
                        status='DETECTED',
                        detail=f'{event.get_event_type_display()} detected near {farm.name} from multi-source EO data.',
                    ),
                    ClaimTimeline(
                        claim=claim,
                        status='VERIFIED',
                        detail='GNSS boundary, VIIRS thermal and GEOGLOWS water signals cross-checked.',
                    ),
                    ClaimTimeline(
                        claim=claim,
                        status='TRIGGERED',
                        detail=f'Parametric threshold exceeded; payout of ${payout} computed.',
                    ),
                    ClaimTimeline(
                        claim=claim,
                        status='PENDING',
                        detail='Settlement stays PENDING until live payouts are explicitly enabled.',
                    ),
                ])

        self.stdout.write(self.style.SUCCESS(
            f'Demo data ready. Created {created_count} farm(s), {events_created} event(s), '
            f'{alerts_created} alert(s), {claims_created} claim(s). '
            'Login with demo/demo123 or farmer/farmer123.'
        ))
