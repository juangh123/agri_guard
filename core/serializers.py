from rest_framework_gis.serializers import GeoFeatureModelSerializer
from rest_framework import serializers
from .models import Farm, DisasterEvent, RiskAlert, Claim, ClaimTimeline

class FarmSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = Farm
        geo_field = "geofence"
        fields = [
            'id', 'name', 'owner', 'crop_type', 'phone_number', 'wallet_address',
            'gnss_device_id', 'gnss_accuracy_m', 'gnss_captured_at', 'created_at'
        ]
        read_only_fields = ['owner']

class DisasterEventSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = DisasterEvent
        geo_field = "affected_area"
        fields = ['id', 'title', 'external_id', 'event_type', 'start_date', 'end_date', 'severity_level', 'eo_metrics']

class RiskAlertSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source='farm.name', read_only=True)
    event_type = serializers.CharField(source='event.event_type', read_only=True)
    event_title = serializers.CharField(source='event.title', read_only=True)

    class Meta:
        model = RiskAlert
        fields = '__all__'
        
class ClaimTimelineSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClaimTimeline
        fields = ['id', 'status', 'detail', 'created_at']

class ClaimSerializer(serializers.ModelSerializer):
    timeline = ClaimTimelineSerializer(many=True, read_only=True)
    farm_name = serializers.CharField(source='farm.name', read_only=True)
    event_type = serializers.CharField(source='alert.event.get_event_type_display', read_only=True)

    class Meta:
        model = Claim
        fields = [
            'id', 'claim_no', 'farm', 'farm_name', 'alert', 'event_type', 
            'status', 'payout_amount', 'evidence_hash', 'evidence_url', 
            'tx_hash', 'triggered_at', 'paid_at', 'timeline'
        ]
