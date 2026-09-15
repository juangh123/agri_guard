from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import DisasterEvent
from .tasks import process_disaster_event

@receiver(post_save, sender=DisasterEvent)
def trigger_analysis_on_new_event(sender, instance, created, **kwargs):
    """
    当新的 DisasterEvent 被创建时，自动触发 Celery 任务进行空间分析。

    调用方如果已经自己驱动管线（例如 /api/events/simulate/ 需要注入仿真指标并
    同步拿结果），可以设置 instance._skip_auto_trigger = True 来跳过这里的自动
    触发，避免同一个事件被重复处理两遍。
    """
    if not created:
        return
    if getattr(instance, '_skip_auto_trigger', False):
        return

    print(f"New DisasterEvent detected: {instance.id}. Triggering analysis task...")
    process_disaster_event.delay(instance.id)
