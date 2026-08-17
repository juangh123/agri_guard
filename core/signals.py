from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import DisasterEvent
from .tasks import process_disaster_event

@receiver(post_save, sender=DisasterEvent)
def trigger_analysis_on_new_event(sender, instance, created, **kwargs):
    """
    当新的 DisasterEvent 被创建时，自动触发 Celery 任务进行空间分析。
    """
    if created:
        print(f"New DisasterEvent detected: {instance.id}. Triggering analysis task...")
        process_disaster_event.delay(instance.id)
