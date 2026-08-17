from django.contrib.auth.models import User
from django.contrib.gis.geos import Polygon
from django.core.management.base import BaseCommand
from core.models import Farm


class Command(BaseCommand):
    help = 'Idempotently seed demo users and farms for the AgriGuard demo'

    def handle(self, *args, **options):
        # Demo login accounts for the frontend.
        demo_admin, admin_created = User.objects.get_or_create(
            username='demo',
            defaults={'is_staff': True, 'is_superuser': True, 'email': 'demo@agriguard.africa'},
        )
        demo_admin.set_password('demo123')
        demo_admin.is_staff = True
        demo_admin.is_superuser = True
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
        for farm_data in farms:
            farm, created = Farm.objects.get_or_create(
                name=farm_data['name'],
                defaults=farm_data,
            )
            if created:
                created_count += 1

        self.stdout.write(self.style.SUCCESS(
            f'Demo data ready. Created {created_count} new farm(s). '
            'Login with demo/demo123 or farmer/farmer123.'
        ))
