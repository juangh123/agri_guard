from django.contrib import admin
from django.contrib.gis.admin import GISModelAdmin
from .models import Farm, DisasterEvent, RiskAlert, Claim, ClaimTimeline

@admin.register(Farm)
class FarmAdmin(GISModelAdmin):
    list_display = ('name', 'owner', 'crop_type', 'phone_number', 'created_at')
    # 使用 OpenStreetMap 作为底图显示在 Django Admin 中
    gis_widget_kwargs = {
        'attrs': {
            'default_lon': 36.8219, # 默认经度 (例如肯尼亚内罗毕)
            'default_lat': -1.2921, # 默认纬度
            'default_zoom': 6,
        }
    }

@admin.register(DisasterEvent)
class DisasterEventAdmin(GISModelAdmin):
    list_display = ('title', 'event_type', 'start_date', 'severity_level')
    gis_widget_kwargs = {
         'attrs': {
            'default_lon': 36.8219,
            'default_lat': -1.2921,
            'default_zoom': 5,
        }
    }

@admin.register(RiskAlert)
class RiskAlertAdmin(admin.ModelAdmin):
    list_display = ('farm', 'event', 'status', 'confidence', 'created_at')
    list_filter = ('status', 'event__event_type')

class ClaimTimelineInline(admin.TabularInline):
    model = ClaimTimeline
    extra = 1

@admin.register(Claim)
class ClaimAdmin(admin.ModelAdmin):
    list_display = ('claim_no', 'farm', 'status', 'payout_amount', 'triggered_at')
    list_filter = ('status',)
    readonly_fields = ('claim_no', 'tx_hash', 'evidence_hash')
    search_fields = ('claim_no', 'farm__name')
    inlines = [ClaimTimelineInline]
