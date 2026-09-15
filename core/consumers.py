import asyncio
from contextlib import suppress
import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.conf import settings


class AlertConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.group_name = 'alerts_group'
        self._sent_alert_ids = set()
        self._last_alert_id = await self._latest_alert_id()
        self._poll_task = None

        # Join alerts group
        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name
        )

        await self.accept()
        
        await self.send(text_data=json.dumps({
            'message': 'Connected to Alert WebSocket'
        }))

        poll_interval = float(getattr(settings, 'ALERT_DB_POLL_INTERVAL', 0) or 0)
        if poll_interval > 0:
            self._poll_task = asyncio.create_task(
                self._poll_alerts(poll_interval)
            )

    async def disconnect(self, close_code):
        if self._poll_task:
            self._poll_task.cancel()
            with suppress(asyncio.CancelledError):
                await self._poll_task

        # Leave alerts group
        await self.channel_layer.group_discard(
            self.group_name,
            self.channel_name
        )

    # Receive message from room group
    async def send_alert(self, event):
        message = event['message']
        await self._deliver_alert(message.get('data', {}))

    async def _deliver_alert(self, alert):
        alert_id = alert.get('id')
        if alert_id in self._sent_alert_ids:
            return

        # Group broadcasts and database polling can both observe the same row;
        # the set stays bounded because it only guards a short dedupe window.
        if len(self._sent_alert_ids) > 1000:
            self._sent_alert_ids.clear()
        self._sent_alert_ids.add(alert_id)

        await self.send(text_data=json.dumps({
            'message': {
                'type': 'NEW_ALERT',
                'data': alert,
            }
        }))

    async def _poll_alerts(self, interval):
        while True:
            await asyncio.sleep(interval)
            try:
                alerts = await self._alerts_after(self._last_alert_id)
            except Exception as poll_error:
                # A transient database error must not kill the polling task.
                print(f"Alert database poll failed: {poll_error}")
                continue

            for alert in alerts:
                self._last_alert_id = max(self._last_alert_id, alert['id'])
                await self._deliver_alert(alert)

    @database_sync_to_async
    def _latest_alert_id(self):
        from .models import RiskAlert

        return (
            RiskAlert.objects.order_by('-id')
            .values_list('id', flat=True)
            .first()
            or 0
        )

    @database_sync_to_async
    def _alerts_after(self, alert_id):
        from .models import RiskAlert

        rows = (
            RiskAlert.objects.filter(id__gt=alert_id)
            .order_by('id')
            .values(
                'id',
                'farm__name',
                'event__title',
                'status',
                'confidence',
            )[:50]
        )
        return [
            {
                'id': row['id'],
                'farm_name': row['farm__name'],
                'event_title': row['event__title'],
                'status': row['status'],
                'confidence': float(row['confidence']),
            }
            for row in rows
        ]
