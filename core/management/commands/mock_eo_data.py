from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.utils import timezone
from core.models import DisasterEvent, Farm
from core.tasks import process_disaster_event
from django.contrib.gis.geos import Polygon
from datetime import datetime

class Command(BaseCommand):
    help = 'Injects mock GEOGLOWS Flood or VIIRS Wildfire data and triggers the engine'

    def add_arguments(self, parser):
        parser.add_argument('--type', type=str, choices=['FLOOD', 'WILDFIRE'], default='FLOOD', help='Type of disaster to mock')
        
    def handle(self, *args, **options):
        disaster_type = options['type']
        
        # Ensure we have at least one mock farm
        farm = Farm.objects.first()
        if not farm:
            self.stdout.write(self.style.WARNING("No farms exist. Creating a mock farm 'Demo Farm' first..."))
            # Ensure a demo owner exists for the mock farm
            demo_owner, _ = User.objects.get_or_create(username='demo_farmer')
            # create a poly for a farm
            bbox = Polygon.from_bbox((30.0, -2.0, 30.1, -1.9))
            farm = Farm.objects.create(
                owner=demo_owner,
                name="Demo Farm",
                crop_type="maize",
                phone_number="+1234567890",
                geofence=bbox
            )
            
        self.stdout.write(self.style.SUCCESS(f"Mocking {disaster_type} event over farm: {farm.name}"))
        
        # Create a disaster area that intersects with the farm
        # We make it slightly larger than the farm's bbox
        disaster_area = Polygon.from_bbox((29.9, -2.1, 30.2, -1.8))
        
        if disaster_type == 'FLOOD':
            metrics = {
                'water_level_m': 3.5, # Exceeds 2.5m threshold
                'duration_days': 4, # Exceeds 3 days threshold
                'rain_anomaly': True,
                'source': 'GEOGLOWS 2.0 ECMWF Streamflow'
            }
            title = f"GEOGLOWS Flood Alert - {datetime.now().strftime('%H:%M:%S')}"
        else: # WILDFIRE
            metrics = {
                'fire_area_ha': 12.0, # Exceeds 5.0 ha threshold
                'source': 'VIIRS Thermal Hotspots'
            }
            title = f"VIIRS Wildfire Detected - {datetime.now().strftime('%H:%M:%S')}"
            
        event = DisasterEvent.objects.create(
            title=title,
            event_type=disaster_type,
            severity_level=3, # High
            affected_area=disaster_area,
            start_date=timezone.now(),
            eo_metrics=metrics
        )
        
        self.stdout.write(self.style.SUCCESS(f"Created DisasterEvent ID: {event.id}. Triggering task..."))
        
        # 与任务签名保持一致：异步触发并标记为仿真（is_simulation=True 时任务会补齐缺失的默认 EO 指标）
        process_disaster_event.delay(event.id, is_simulation=True)
        
        self.stdout.write(self.style.SUCCESS("Task queued successfully!"))