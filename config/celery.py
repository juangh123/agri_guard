import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('agri_guard')

app.config_from_object('django.conf:settings', namespace='CELERY')

app.autodiscover_tasks()

app.conf.beat_schedule = {
    'fetch-nasa-eonet-every-6-hours': {
        'task': 'core.tasks.fetch_nasa_data_task',
        'schedule': crontab(minute=0, hour='*/6'), # Every 6 hours as per pitch and docs
    },
}
