import hashlib
from django.contrib.gis.db import models
from django.contrib.auth.models import User
from django.core.validators import MaxValueValidator, MinValueValidator
from django.utils.crypto import get_random_string

class Farm(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='farms')
    name = models.CharField(max_length=255)
    
    # GNSS Geofencing boundaries (New addition for parametric insurance)
    geofence = models.PolygonField(srid=4326, help_text="GNSS Geofencing boundaries (Polygon)")
    gnss_device_id = models.CharField(max_length=100, blank=True, default='', help_text="Device or receiver used to capture the GNSS boundary")
    gnss_accuracy_m = models.FloatField(null=True, blank=True, validators=[MinValueValidator(0.0)], help_text="Estimated horizontal accuracy in metres")
    gnss_captured_at = models.DateTimeField(null=True, blank=True, help_text="Timestamp when the GNSS boundary was captured")

    # Where the boundary and its accuracy came from. Only receiver_* sources have
    # an accuracy the server computed itself (from the stored receiver log); for
    # browser_* the accuracy is what the browser reported about itself.
    GNSS_SOURCE_CHOICES = (
        ('', 'Not recorded'),
        ('browser_walk', 'Browser: walked corners'),
        ('browser_quick', 'Browser: single fix placeholder'),
        ('browser', 'Browser / API client'),
        ('receiver_nmea', 'Receiver log: NMEA 0183'),
        ('receiver_gpx', 'Receiver log: GPX'),
        ('demo_sim', 'Labelled demo simulation'),
    )
    gnss_source = models.CharField(max_length=20, choices=GNSS_SOURCE_CHOICES, blank=True, default='')
    gnss_evidence = models.JSONField(default=dict, blank=True, help_text="Server-computed summary of the receiver log (core.gnss_logs)")
    
    CROP_CHOICES = (
        ('maize', 'Maize (Corn)'),
        ('wheat', 'Wheat'),
        ('livestock', 'Livestock'),
    )
    crop_type = models.CharField(max_length=50, choices=CROP_CHOICES, default='maize')
    
    phone_number = models.CharField(max_length=20, help_text="用于接收短信预警")
    wallet_address = models.CharField(max_length=42, null=True, blank=True, help_text="Web3 Wallet Address for payouts")
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"{self.name} ({self.owner.username})"

class DisasterEvent(models.Model):
    EVENT_TYPES = (
        ('FLOOD', 'Flood'),
        ('DROUGHT', 'Drought'),
        ('HEATWAVE', 'Heatwave'),
        ('WILDFIRE', 'Wildfire'),  # Added for VIIRS
    )
    
    title = models.CharField(max_length=255)
    external_id = models.CharField(max_length=255, null=True, blank=True, unique=True, help_text="External ID from APIs like NASA EONET")
    event_type = models.CharField(max_length=50, choices=EVENT_TYPES)
    # 存储受影响区域的多边形范围
    affected_area = models.PolygonField(srid=4326)
    start_date = models.DateTimeField()
    end_date = models.DateTimeField(null=True, blank=True)
    severity_level = models.IntegerField(default=1, validators=[MinValueValidator(1), MaxValueValidator(3)], help_text="1: Low, 2: Medium, 3: High")
    
    # Store dynamic EO metrics specific to the disaster
    eo_metrics = models.JSONField(default=dict, blank=True, help_text="Store specific EO data (e.g. {'water_level_m': 3.2} or {'fire_area_ha': 12.5})")
    
    def __str__(self):
        return f"[{self.event_type}] {self.title}"

class RiskAlert(models.Model):
    STATUS_CHOICES = (
        ('PENDING', 'Pending SMS'),
        ('SENT', 'SMS Sent'),
        ('WARNING', 'Warning'),
        ('DISASTER', 'Disaster'),
    )
    
    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name='alerts')
    event = models.ForeignKey(DisasterEvent, on_delete=models.CASCADE)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    
    # Parametric Confidence
    confidence = models.DecimalField(max_digits=5, decimal_places=2, default=0.0, help_text="置信度 0-100")
    
    # AI Damage Estimation
    ai_damage_report = models.TextField(null=True, blank=True, help_text="AI generated damage estimation report")
    
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Alert for {self.farm.name} - {self.event.title}"

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['farm', 'event'], name='unique_alert_per_farm_event')
        ]


# 3. 新增 Claim 模型
class Claim(models.Model):
    CLAIM_STATUS = (
        ('DETECTED', '检测到灾害'),
        ('VERIFIED', '多源验证通过'),
        ('TRIGGERED', '理赔生成'),
        ('NOTIFIED', '已通知'),
        ('PENDING', '待支付'),
        ('PAID', '已支付'),
        ('REJECTED', '已拒绝'),
    )
    claim_no = models.CharField(max_length=30, unique=True)
    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name='claims')
    alert = models.ForeignKey(RiskAlert, on_delete=models.CASCADE)
    status = models.CharField(max_length=15, choices=CLAIM_STATUS, default='DETECTED')
    payout_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    evidence_hash = models.CharField(max_length=64, blank=True) # SHA-256
    evidence_url = models.TextField(null=True, blank=True)
    tx_hash = models.CharField(max_length=66, null=True, blank=True) # 智能合约哈希
    triggered_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        # The claims list is always served newest first.
        indexes = [
            models.Index(fields=['-triggered_at', '-id'], name='claim_triggered_at_desc'),
        ]

    def save(self, *args, **kwargs):
        if not self.claim_no:
            self.claim_no = self._generate_claim_no()
        super().save(*args, **kwargs)

    @classmethod
    def _generate_claim_no(cls):
        """Return an unused number like CLM-2026-0847.

        Four random digits collide often once a year has ~100 claims, which
        would make the unique constraint reject a legitimate payout. Check
        before using a number, and widen to 8 digits if the short space is
        crowded.
        """
        import datetime
        year = datetime.datetime.now().year
        for length, attempts in ((4, 10), (8, 10)):
            for _ in range(attempts):
                digits = get_random_string(length=length, allowed_chars='0123456789')
                candidate = f"CLM-{year}-{digits}"
                if not cls.objects.filter(claim_no=candidate).exists():
                    return candidate
        raise RuntimeError('Could not allocate a unique claim number')
        
    def __str__(self):
        return self.claim_no

# 4. 新增 ClaimTimeline 模型
class ClaimTimeline(models.Model):
    claim = models.ForeignKey(Claim, on_delete=models.CASCADE, related_name='timeline')
    status = models.CharField(max_length=15)
    detail = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']

    def __str__(self):
        return f"{self.claim.claim_no} - {self.status}"


class GnssCaptureLog(models.Model):
    """The exact receiver log a farm boundary was built from.

    Kept so anyone with access can re-run ``core.gnss_logs`` on it and get the
    same polygon and evidence; ``sha256`` is published in the evidence report.
    """
    FORMAT_CHOICES = (('nmea', 'NMEA 0183'), ('gpx', 'GPX'))

    farm = models.OneToOneField(Farm, on_delete=models.CASCADE, related_name='gnss_log')
    format = models.CharField(max_length=8, choices=FORMAT_CHOICES)
    filename = models.CharField(max_length=120, blank=True, default='')
    sha256 = models.CharField(max_length=64)
    size_bytes = models.PositiveIntegerField()
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.farm.name} {self.format} {self.sha256[:12]}"
