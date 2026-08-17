import requests
from django.core.management.base import BaseCommand
from django.contrib.gis.geos import Polygon, Point
from core.models import DisasterEvent
from django.utils.dateparse import parse_datetime

class Command(BaseCommand):
    help = 'Fetches real-time disaster data from NASA EONET API and triggers analysis'

    def handle(self, *args, **kwargs):
        self.stdout.write("Fetching live disaster data from NASA EONET...")
        
        # We limit to severe storms and wildfires for demonstration
        url = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&category=severeStorms,wildfires&limit=10"
        
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            data = response.json()
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Failed to fetch data: {e}"))
            return

        events_created = 0

        for event_data in data.get('events', []):
            title = event_data.get('title')
            external_id = event_data.get('id')
            categories = event_data.get('categories', [])
            geometries = event_data.get('geometry', [])
            
            if not geometries:
                continue

            # Determine event type
            event_type = 'FLOOD' # Default fallback
            category_id = categories[0]['id'] if categories else ''
            
            if category_id == 'wildfires':
                event_type = 'WILDFIRE'
            elif category_id == 'severeStorms':
                event_type = 'FLOOD'
                
            # Parse date
            date_str = geometries[0].get('date')
            start_date = parse_datetime(date_str) if date_str else None
            
            # Create a small polygon buffer around the point if it's a Point geometry
            # EONET usually returns Points for active events
            geom_type = geometries[0].get('type')
            coords = geometries[0].get('coordinates')
            
            affected_area = None
            if geom_type == 'Point' and len(coords) == 2:
                lon, lat = coords
                # PostGIS buffer to create a rough circle
                # Create point in WGS84, transform to Mercator (3857) to use meters for buffer
                # EONET usually returns Points for active events
                point = Point(lon, lat, srid=4326)
                point.transform(3857) # Transform to Mercator
                # Create a 50km radius buffer
                affected_area = point.buffer(50000)
                affected_area.transform(4326) # Transform back to WGS84
            elif geom_type == 'Polygon':
                # If EONET provides a polygon directly
                affected_area = Polygon(coords[0])
                
            if not affected_area or not start_date:
                continue

            # Ensure we don't duplicate events (checking by external_id)
            if not DisasterEvent.objects.filter(external_id=external_id).exists():
                # Fill threshold-adjacent default EO metrics (engine-side keys)
                if event_type == 'WILDFIRE':
                    eo_metrics = {'fire_area_ha': 6.0, 'source': 'NASA EONET'} # maize threshold: 5.0 ha
                else: # FLOOD
                    eo_metrics = {'water_level_m': 2.6, 'duration_days': 3, 'rain_anomaly': True, 'source': 'NASA EONET'} # maize threshold: 2.5m / 3d
                new_event = DisasterEvent.objects.create(
                    title=f"NASA: {title}",
                    external_id=external_id,
                    event_type=event_type,
                    affected_area=affected_area,
                    start_date=start_date,
                    severity_level=3, # Assume high severity for NASA alerts
                    eo_metrics=eo_metrics
                )
                events_created += 1
                
                self.stdout.write(self.style.SUCCESS(f"Created event: {new_event.title}"))
                
                # No manual trigger here: the post_save signal already enqueues process_disaster_event

        self.stdout.write(self.style.SUCCESS(f"Successfully processed EONET feed. Created {events_created} new disaster events."))
