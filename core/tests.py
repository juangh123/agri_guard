"""
AgriGuard 最小测试套件（W7）。

覆盖范围与审查发现的对应关系：
- EngineEvaluationTests   —— 对应审查 P0-1（eo_metrics 键名统一为
  water_level_m / duration_days / fire_area_ha 后的引擎阈值判定回归）。
- FarmApiPermissionTests  —— 对应审查 P0-3（FarmViewSet 权限被 AllowAny
  覆盖、匿名可写）与 P0-2（perform_create 注入 owner，注册不再 IntegrityError）。
- ProcessDisasterEventContractTests —— 对应审查 P0-1（tasks↔engine 接口漂移：
  evaluate_farm_status(farm, event) 与 process_payout(farm, event, trigger_results)
  新签名的端到端契约）及 P1 幂等问题（unique_alert_per_farm_event 唯一约束，
  重复处理不重复创建告警/理赔）。
- PayoutIntegrityTests    —— 对应审查 P0-4（资金诚信：Web3 未配置/失败时
  Claim 记 PENDING、tx_hash=None，不再伪造已赔付）。

注意：测试数据库需要 PostGIS（CI 中由 postgis/postgis 服务提供，并在
template1 中启用 postgis 扩展，供 Django 创建测试库继承）。
"""
import os
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

from django.contrib.auth.models import User
from django.contrib.gis.geos import GEOSGeometry, Polygon
from django.core.management import call_command
from django.urls import re_path
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from asgiref.sync import async_to_sync
from channels.db import database_sync_to_async
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from rest_framework import status
from rest_framework.test import APIClient

from . import consumers
from .management.commands import seed_demo_data
from .engine import ParametricClaimEngine
from .models import Claim, ClaimTimeline, DisasterEvent, Farm, RiskAlert
from .services.blockchain_service import BlockchainConfigError, BlockchainService
from .services.llm_service import ask_agri_guard_ai
from .tasks import process_disaster_event, send_sms_alert

# 内存在内存中的 channel layer，避免测试依赖真实 Redis
IN_MEMORY_CHANNELS = {
    'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}
}
ALERT_WS_APPLICATION = URLRouter([
    re_path(r'ws/alerts/$', consumers.AlertConsumer.as_asgi()),
])

# 一个简单有效的农场多边形（SRID 4326）
FARM_GEOFENCE = Polygon(
    ((36.80, -1.30), (36.80, -1.20), (36.90, -1.20), (36.90, -1.30), (36.80, -1.30)),
    srid=4326,
)
# 与农场多边形相交的灾害区域
EVENT_AREA = Polygon(
    ((36.85, -1.25), (36.85, -1.15), (36.95, -1.15), (36.95, -1.25), (36.85, -1.25)),
    srid=4326,
)


def make_user(username='farmer1', password='testpass123'):
    return User.objects.create_user(username=username, password=password)


def make_farm(owner, crop_type='maize', name='Test Farm'):
    return Farm.objects.create(
        owner=owner,
        name=name,
        geofence=FARM_GEOFENCE,
        crop_type=crop_type,
        phone_number='+254700000000',
        wallet_address='0x' + '1' * 40,
    )


def make_event(event_type='FLOOD', eo_metrics=None, severity_level=3):
    return DisasterEvent.objects.create(
        title=f'{event_type} Test Event',
        event_type=event_type,
        affected_area=EVENT_AREA,
        start_date=timezone.now(),
        severity_level=severity_level,
        eo_metrics=eo_metrics or {},
    )


class EngineEvaluationTests(TestCase):
    """引擎判定：FLOOD / WILDFIRE / DROUGHT 三分支阈值逻辑。"""

    def setUp(self):
        self.engine = ParametricClaimEngine()
        self.farm = make_farm(make_user(), crop_type='maize')
        # maize 阈值：flood 2.5m/3d，fire 5.0ha，drought ndwi -0.2

    # ---- FLOOD ----
    def test_flood_above_threshold_triggers_claim(self):
        event = make_event('FLOOD', {'water_level_m': 3.0, 'duration_days': 4})
        result = self.engine.evaluate_farm_status(self.farm, event)
        self.assertTrue(result['alert_needed'])
        self.assertTrue(result['claim_triggered'])
        self.assertIn('Flood parameters exceeded', result['reason'])
        # 无 rain_anomaly 时置信度为 0.85
        self.assertEqual(result['confidence_score'], 0.85)

    def test_flood_rain_anomaly_boosts_confidence(self):
        event = make_event('FLOOD', {
            'water_level_m': 3.0, 'duration_days': 4, 'rain_anomaly': True,
        })
        result = self.engine.evaluate_farm_status(self.farm, event)
        self.assertTrue(result['claim_triggered'])
        self.assertEqual(result['confidence_score'], 0.95)

    def test_flood_warning_zone_alerts_without_claim(self):
        # 水位 >= 阈值的 80%（2.0）但不足 2.5 → 进入预警区，仅预警不触发赔付
        event = make_event('FLOOD', {'water_level_m': 2.2, 'duration_days': 4})
        result = self.engine.evaluate_farm_status(self.farm, event)
        self.assertTrue(result['alert_needed'])
        self.assertFalse(result['claim_triggered'])
        self.assertIn('Approaching flood threshold', result['reason'])

    def test_flood_below_threshold_no_alert(self):
        event = make_event('FLOOD', {'water_level_m': 1.0, 'duration_days': 1})
        result = self.engine.evaluate_farm_status(self.farm, event)
        self.assertFalse(result['alert_needed'])
        self.assertFalse(result['claim_triggered'])
        self.assertEqual(result['reason'], '')

    # ---- WILDFIRE ----
    def test_wildfire_above_threshold_triggers_claim(self):
        event = make_event('WILDFIRE', {'fire_area_ha': 6.0})
        result = self.engine.evaluate_farm_status(self.farm, event)
        self.assertTrue(result['alert_needed'])
        self.assertTrue(result['claim_triggered'])
        self.assertIn('exceeds threshold', result['reason'])
        self.assertEqual(result['confidence_score'], 0.99)

    def test_wildfire_partial_area_alerts_without_claim(self):
        event = make_event('WILDFIRE', {'fire_area_ha': 2.0})
        result = self.engine.evaluate_farm_status(self.farm, event)
        self.assertTrue(result['alert_needed'])
        self.assertFalse(result['claim_triggered'])
        self.assertIn('partially', result['reason'])

    def test_wildfire_zero_area_no_alert(self):
        event = make_event('WILDFIRE', {'fire_area_ha': 0.0})
        result = self.engine.evaluate_farm_status(self.farm, event)
        self.assertFalse(result['alert_needed'])
        self.assertFalse(result['claim_triggered'])

    # ---- DROUGHT ----
    def test_drought_below_ndwi_threshold_triggers_claim(self):
        event = make_event('DROUGHT', {'ndwi': -0.3})
        result = self.engine.evaluate_farm_status(self.farm, event)
        self.assertTrue(result['alert_needed'])
        self.assertTrue(result['claim_triggered'])
        self.assertIn('Severe drought detected', result['reason'])
        self.assertEqual(result['confidence_score'], 0.90)

    def test_drought_above_ndwi_threshold_no_alert(self):
        event = make_event('DROUGHT', {'ndwi': -0.1})
        result = self.engine.evaluate_farm_status(self.farm, event)
        self.assertFalse(result['alert_needed'])
        self.assertFalse(result['claim_triggered'])

    # ---- HEATWAVE ----
    def test_heatwave_above_threshold_triggers_claim(self):
        event = make_event('HEATWAVE', {
            'temperature_anomaly_c': 3.1,
            'duration_days': 4,
        })
        result = self.engine.evaluate_farm_status(self.farm, event)
        self.assertTrue(result['alert_needed'])
        self.assertTrue(result['claim_triggered'])
        self.assertIn('Heatwave parameters exceeded', result['reason'])
        self.assertEqual(result['confidence_score'], 0.92)

    def test_heatwave_warning_zone_alerts_without_claim(self):
        event = make_event('HEATWAVE', {
            'temperature_anomaly_c': 1.7,
            'duration_days': 4,
        })
        result = self.engine.evaluate_farm_status(self.farm, event)
        self.assertTrue(result['alert_needed'])
        self.assertFalse(result['claim_triggered'])
        self.assertIn('Approaching heatwave threshold', result['reason'])

    # ---- 作物阈值差异 ----
    def test_crop_type_thresholds_differ(self):
        # livestock 洪水阈值为 4.0m：3.0m 水位不触发赔付，但 >= 3.2 才进预警区
        livestock_farm = make_farm(make_user('farmer2'), crop_type='livestock', name='Ranch')
        event = make_event('FLOOD', {'water_level_m': 3.0, 'duration_days': 4})
        result = self.engine.evaluate_farm_status(livestock_farm, event)
        self.assertFalse(result['alert_needed'])
        self.assertFalse(result['claim_triggered'])

    def test_unknown_event_type_never_alerts(self):
        # 引擎无 HEATWAVE 分支（对应审查中 NASA 事件误映射为 HEATWAVE 的发现）
        event = make_event('HEATWAVE', {'water_level_m': 99.0})
        result = self.engine.evaluate_farm_status(self.farm, event)
        self.assertFalse(result['alert_needed'])
        self.assertFalse(result['claim_triggered'])


class NasaIngestionIntegrityTests(TestCase):
    """Live EONET ingestion must not invent threshold values or auto-pay."""

    @mock.patch('core.management.commands.fetch_nasa_eonet.requests.get')
    def test_eonet_event_is_ingested_without_synthetic_thresholds(self, mock_get):
        mock_get.return_value.raise_for_status.return_value = None
        mock_get.return_value.json.return_value = {
            'events': [{
                'id': 'EONET-TEST-1',
                'title': 'Test Severe Storm',
                'categories': [{'id': 'severeStorms'}],
                'geometry': [{
                    'type': 'Point',
                    'coordinates': [36.85, -1.25],
                    'date': '2026-09-13T00:00:00Z',
                }],
            }],
        }

        call_command('fetch_nasa_eonet')

        event = DisasterEvent.objects.get(external_id='EONET-TEST-1')
        self.assertEqual(event.eo_metrics['source'], 'NASA EONET')
        self.assertFalse(event.eo_metrics['threshold_metrics_verified'])
        self.assertNotIn('water_level_m', event.eo_metrics)
        self.assertNotIn('duration_days', event.eo_metrics)
        self.assertNotIn('fire_area_ha', event.eo_metrics)
        self.assertFalse(RiskAlert.objects.filter(event=event).exists())


class SeedDemoDataSecurityTests(TestCase):
    """The public demo credentials must never grant Django admin access."""

    def test_seed_demo_data_keeps_public_demo_account_unprivileged(self):
        call_command('seed_demo_data', verbosity=0)
        demo_user = User.objects.get(username='demo')

        self.assertFalse(demo_user.is_staff)
        self.assertFalse(demo_user.is_superuser)


class SeedDemoDataContentTests(TestCase):
    """A fresh deployment must show the dashboard documented in docs/screenshots."""

    def setUp(self):
        call_command('seed_demo_data', verbosity=0)

    def test_seeds_the_documented_demo_history(self):
        self.assertEqual(Farm.objects.count(), 3)
        self.assertEqual(DisasterEvent.objects.count(), 4)
        self.assertEqual(Claim.objects.count(), 9)
        self.assertEqual(ClaimTimeline.objects.count(), 36)

        pipeline = sum(
            (amount or Decimal('0')) for amount in Claim.objects.values_list('payout_amount', flat=True)
        )
        self.assertEqual(pipeline, Decimal('3490.00'))
        self.assertFalse(Claim.objects.exclude(status='PENDING').exists())
        self.assertFalse(Claim.objects.filter(tx_hash__isnull=False).exists())

    def test_only_three_hazards_count_as_active(self):
        active = RiskAlert.objects.filter(status__in=['DISASTER', 'WARNING'])
        self.assertEqual(active.count(), 3)
        self.assertEqual(
            len({f'{alert.farm.name}:{alert.event.event_type}' for alert in active}),
            3,
        )

    def test_seeding_does_not_run_the_live_analysis_pipeline(self):
        # The post_save hook mints extra claims with random numbers; the seed must
        # stay deterministic so the documented claim numbers remain the only ones.
        self.assertEqual(
            set(Claim.objects.values_list('claim_no', flat=True)),
            {row[0] for row in seed_demo_data.DEMO_CLAIMS},
        )
        self.assertEqual(Claim.objects.values('alert_id').distinct().count(), 9)

    def test_seeding_is_idempotent(self):
        call_command('seed_demo_data', verbosity=0)
        self.assertEqual(Farm.objects.count(), 3)
        self.assertEqual(DisasterEvent.objects.count(), 4)
        self.assertEqual(Claim.objects.count(), 9)
        self.assertEqual(ClaimTimeline.objects.count(), 36)


class FarmApiPermissionTests(TestCase):
    """API 权限矩阵：匿名可读、匿名禁写、认证创建自动归属 owner。"""

    def setUp(self):
        self.client = APIClient()
        self.user = make_user()
        self.farm_payload = {
            'type': 'Feature',
            'geometry': {
                'type': 'Polygon',
                'coordinates': [[[36.80, -1.30], [36.80, -1.20],
                                 [36.90, -1.20], [36.90, -1.30], [36.80, -1.30]]],
            },
            'properties': {
                'name': 'API Farm',
                'crop_type': 'maize',
                'phone_number': '+254700000001',
                'wallet_address': '0x' + '2' * 40,
            },
        }

    def test_anonymous_get_farms_returns_200(self):
        response = self.client.get('/api/farms/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_anonymous_farm_read_hides_private_contact_fields(self):
        farm = make_farm(self.user, name='Public Map Farm')
        response = self.client.get('/api/farms/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        properties = response.data['features'][0]['properties']
        self.assertEqual(properties['name'], farm.name)
        self.assertNotIn('owner', properties)
        self.assertNotIn('phone_number', properties)
        self.assertNotIn('wallet_address', properties)

    def test_non_owner_farm_read_hides_private_contact_fields(self):
        owner = make_user('privacy_owner')
        viewer = make_user('privacy_viewer')
        farm = make_farm(owner, name='Private Map Farm')
        self.client.force_authenticate(user=viewer)

        response = self.client.get(f'/api/farms/{farm.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        properties = response.data['properties']
        self.assertNotIn('owner', properties)
        self.assertNotIn('phone_number', properties)
        self.assertNotIn('wallet_address', properties)

    def test_owner_farm_read_keeps_private_contact_fields(self):
        farm = make_farm(self.user, name='Owner Farm')
        self.client.force_authenticate(user=self.user)

        response = self.client.get(f'/api/farms/{farm.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        properties = response.data['properties']
        self.assertEqual(properties['owner'], self.user.id)
        self.assertEqual(properties['phone_number'], farm.phone_number)
        self.assertEqual(properties['wallet_address'], farm.wallet_address)

    def test_anonymous_post_farms_rejected(self):
        response = self.client.post('/api/farms/', self.farm_payload, format='json')
        # 仅配置 JWTAuthentication 时匿名写返回 401；若后续加入其他认证类可能为 403
        self.assertIn(response.status_code,
                      (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
        self.assertEqual(Farm.objects.count(), 0)

    def test_anonymous_put_delete_rejected(self):
        farm = make_farm(self.user)
        url = f'/api/farms/{farm.id}/'
        self.assertIn(self.client.put(url, self.farm_payload, format='json').status_code,
                      (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
        self.assertIn(self.client.delete(url).status_code,
                      (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_anonymous_integration_status_requires_auth(self):
        response = self.client.get('/api/farms/integration_status/')
        self.assertIn(response.status_code,
                      (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_authenticated_integration_status_lists_farms(self):
        farm = make_farm(self.user)
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/farms/integration_status/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['sms']['mode'], 'mock')
        self.assertEqual(response.data['web3']['mode'], 'mock')
        self.assertEqual([item['id'] for item in response.data['farms']], [farm.id])

    @mock.patch('core.tasks.send_sms_alert', return_value={
        'ok': True, 'mode': 'live', 'provider': 'Twilio', 'sid': 'SM123',
    })
    def test_test_sms_uses_request_phone_number(self, mock_sms):
        farm = make_farm(self.user)
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f'/api/farms/{farm.id}/test_sms/',
            {'phone_number': '+254711000000'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['mode'], 'live')
        self.assertEqual(response.data['to'], '+254711000000')
        self.assertEqual(response.data['sid'], 'SM123')
        mock_sms.assert_called_once_with('+254711000000', mock.ANY)

    def test_test_wallet_returns_mock_when_web3_missing(self):
        farm = make_farm(self.user)
        self.client.force_authenticate(user=self.user)
        with mock.patch.dict(os.environ, {
            'WEB3_PROVIDER_URI': '',
            'WEB3_PRIVATE_KEY': '',
            'SMART_CONTRACT_ADDRESS': '',
        }):
            response = self.client.post(
                f'/api/farms/{farm.id}/test_wallet/',
                {'wallet_address': farm.wallet_address},
                format='json',
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['mode'], 'mock')
        self.assertTrue(response.data['ok'])

    def test_authenticated_post_creates_farm_owned_by_current_user(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post('/api/farms/', self.farm_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        farm = Farm.objects.get(name='API Farm')
        # perform_create 注入 request.user：owner 自动为当前用户（P0-2 修复回归）
        self.assertEqual(farm.owner, self.user)
        # GeoDjango 应正确解析 GeoJSON Polygon 几何
        self.assertIsInstance(farm.geofence, GEOSGeometry)
        self.assertEqual(farm.geofence.geom_type, 'Polygon')

    def test_other_user_cannot_modify_or_delete_foreign_farm(self):
        owner = make_user('owner_user')
        intruder = make_user('intruder_user')
        farm = make_farm(owner, name='Owned Farm')
        self.client.force_authenticate(user=intruder)

        url = f'/api/farms/{farm.id}/'
        # 归属校验：他人农场对写操作不可见（404），而不是可被静默改写
        self.assertEqual(
            self.client.patch(url, {'name': 'Hijacked'}, format='json').status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(self.client.delete(url).status_code, status.HTTP_404_NOT_FOUND)

        farm.refresh_from_db()
        self.assertEqual(farm.name, 'Owned Farm')

    @mock.patch('core.tasks.send_sms_alert')
    def test_other_user_cannot_probe_foreign_farm_actions(self, mock_sms):
        owner = make_user('owner_two')
        intruder = make_user('intruder_two')
        farm = make_farm(owner, name='Private Farm')
        self.client.force_authenticate(user=intruder)

        sms_response = self.client.post(
            f'/api/farms/{farm.id}/test_sms/',
            {'phone_number': '+254799999999'},
            format='json',
        )
        wallet_response = self.client.post(
            f'/api/farms/{farm.id}/test_wallet/',
            {'wallet_address': farm.wallet_address},
            format='json',
        )
        self.assertEqual(sms_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(wallet_response.status_code, status.HTTP_404_NOT_FOUND)
        # 关键点：越权请求不得真正触发短信发送
        mock_sms.assert_not_called()

    def test_owner_can_still_update_own_farm(self):
        self.client.force_authenticate(user=self.user)
        farm = make_farm(self.user, name='My Farm')
        response = self.client.patch(
            f'/api/farms/{farm.id}/',
            {'name': 'Renamed Farm'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        farm.refresh_from_db()
        self.assertEqual(farm.name, 'Renamed Farm')


class PublicDemoRecordWriteHardeningTests(TestCase):
    """Public demo records stay readable, but clients cannot mutate audit data."""

    def setUp(self):
        self.user = make_user('record_guard')
        self.farm = make_farm(self.user, name='Audit Farm')
        self.event = make_event('FLOOD', severity_level=3)
        self.alert = RiskAlert.objects.create(
            farm=self.farm,
            event=self.event,
            status='DISASTER',
            confidence=95,
        )
        self.claim = Claim.objects.create(
            farm=self.farm,
            alert=self.alert,
            status='PENDING',
            payout_amount=Decimal('100.00'),
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_authenticated_client_cannot_mutate_audit_records(self):
        for url in (
            f'/api/events/{self.event.id}/',
            f'/api/alerts/{self.alert.id}/',
            f'/api/claims/{self.claim.claim_no}/',
        ):
            self.assertEqual(
                self.client.patch(url, {'status': 'PAID'}, format='json').status_code,
                status.HTTP_405_METHOD_NOT_ALLOWED,
            )
            self.assertEqual(
                self.client.delete(url).status_code,
                status.HTTP_405_METHOD_NOT_ALLOWED,
            )


@override_settings(CHANNEL_LAYERS=IN_MEMORY_CHANNELS)
class ProcessDisasterEventContractTests(TestCase):
    """tasks↔engine 契约：同步调用 process_disaster_event 全链路无异常。"""

    def setUp(self):
        self.farm = make_farm(make_user())
        self.event = make_event('FLOOD', severity_level=3)

    def _run(self):
        # 仿真模式：tasks 注入 water_level_m=3.0/duration_days=4/rain_anomaly=True
        return process_disaster_event(self.event.id, is_simulation=True)

    @mock.patch('core.tasks.generate_ai_damage_report')
    @mock.patch('core.tasks.send_sms_alert')
    def test_process_event_creates_alert_and_claim(self, mock_sms_delay, mock_ai_delay):
        result = self._run()

        # 无异常即验证了 evaluate_farm_status(farm, event) 与
        # process_payout(farm, event, trigger_results) 新签名契约（P0-1 修复回归）
        self.assertIn(f'Processed Event {self.event.id}', result)
        self.assertIn('New Alerts/Payouts: 1', result)

        alert = RiskAlert.objects.get(farm=self.farm, event=self.event)
        self.assertEqual(alert.status, 'DISASTER')
        # 仿真注入 rain_anomaly → 置信度 0.95 → 存库为 0-100 制
        self.assertEqual(float(alert.confidence), 95.0)

        self.assertEqual(Claim.objects.filter(alert=alert).count(), 1)
        claim = Claim.objects.get(alert=alert)
        self.assertEqual(
            list(claim.timeline.values_list('status', flat=True)),
            ['DETECTED', 'VERIFIED', 'TRIGGERED', 'NOTIFIED', 'PENDING'],
        )
        self.assertTrue(
            claim.timeline.get(status='DETECTED').detail.startswith('[SIMULATED] ')
        )
        self.assertIn(
            'not claim-grade',
            claim.timeline.get(status='VERIFIED').detail,
        )
        mock_sms_delay.delay.assert_called_once()
        mock_ai_delay.delay.assert_called_once_with(alert.id)

    @mock.patch('core.tasks.generate_ai_damage_report')
    @mock.patch('core.tasks.send_sms_alert')
    def test_reprocessing_is_idempotent(self, mock_sms_delay, mock_ai_delay):
        self._run()
        self._run()  # 重复调用

        # unique_alert_per_farm_event 唯一约束：不重复创建告警/理赔/短信/AI 报告
        self.assertEqual(RiskAlert.objects.filter(farm=self.farm, event=self.event).count(), 1)
        self.assertEqual(Claim.objects.count(), 1)
        self.assertEqual(mock_sms_delay.delay.call_count, 1)
        self.assertEqual(mock_ai_delay.delay.call_count, 1)


@override_settings(CHANNEL_LAYERS=IN_MEMORY_CHANNELS)
class SimulateEndpointTests(TestCase):
    """/api/events/simulate/ 只驱动一次管线的回归测试。"""

    def setUp(self):
        self.client = APIClient()
        self.user = make_user('sim_user')
        self.client.force_authenticate(user=self.user)
        make_farm(self.user, name='Sim Farm')

    @mock.patch('core.signals.process_disaster_event')
    @mock.patch('core.tasks.process_disaster_event')
    def test_simulate_triggers_pipeline_exactly_once(self, mock_view_task, mock_signal_task):
        mock_view_task.return_value = "Processed test event."
        response = self.client.post(
            '/api/events/simulate/', {'event_type': 'FLOOD'}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # 信号不得再触发一次（否则 eager 模式下管线会同步跑两遍）
        mock_signal_task.delay.assert_not_called()
        # 视图显式驱动一次，并带上仿真注入标记
        self.assertEqual(mock_view_task.call_count, 1)
        self.assertTrue(mock_view_task.call_args.kwargs.get('is_simulation'))

    @mock.patch('core.signals.process_disaster_event')
    def test_ingested_event_still_auto_triggers(self, mock_signal_task):
        # NASA EONET 等外部采集路径仍依赖 post_save 信号自动触发
        make_event('FLOOD', severity_level=3)
        self.assertEqual(mock_signal_task.delay.call_count, 1)

@override_settings(CHANNEL_LAYERS=IN_MEMORY_CHANNELS)
class PayoutIntegrityTests(TestCase):
    """资金诚信：Web3 未配置时不得伪造已赔付记录。"""

    def setUp(self):
        self.farm = make_farm(make_user())
        self.event = make_event('FLOOD', severity_level=3)

    @mock.patch('core.tasks.generate_ai_damage_report')
    @mock.patch('core.tasks.send_sms_alert')
    def test_claim_pending_without_web3_config(self, mock_sms_delay, mock_ai_delay):
        # 显式清空 Web3 环境变量，模拟未配置链上通道
        with mock.patch.dict(os.environ, {'WEB3_PROVIDER_URI': '', 'WEB3_PRIVATE_KEY': ''}):
            process_disaster_event(self.event.id, is_simulation=True)

        claim = Claim.objects.get(farm=self.farm)
        self.assertEqual(claim.status, 'PENDING')
        self.assertIsNone(claim.tx_hash)
        self.assertIsNone(claim.paid_at)
        self.assertGreater(claim.payout_amount, 0)
        self.assertEqual(len(claim.evidence_hash), 64)

        # 时间线应记录 PENDING 而非 PAID，避免误导审计
        timeline_statuses = list(claim.timeline.values_list('status', flat=True))
        self.assertIn('PENDING', timeline_statuses)
        self.assertNotIn('PAID', timeline_statuses)
        triggered_detail = claim.timeline.get(status='TRIGGERED').detail
        self.assertEqual(triggered_detail, 'Confidence threshold met. Settlement processing started.')

    @override_settings(LIVE_SETTLEMENT_ENABLED=False)
    @mock.patch('core.tasks.BlockchainService')
    @mock.patch('core.tasks.generate_ai_damage_report')
    @mock.patch('core.tasks.send_sms_alert')
    def test_claim_never_calls_blockchain_when_live_gate_is_disabled(
        self,
        mock_sms_delay,
        mock_ai_delay,
        mock_blockchain_service,
    ):
        with mock.patch.dict(os.environ, {
            'WEB3_PROVIDER_URI': 'https://rpc.example.invalid',
            'WEB3_PRIVATE_KEY': '0x' + 'a' * 64,
            'SMART_CONTRACT_ADDRESS': '0x' + 'b' * 40,
        }):
            process_disaster_event(self.event.id, is_simulation=True)

        mock_blockchain_service.assert_not_called()
        claim = Claim.objects.get(farm=self.farm)
        self.assertEqual(claim.status, 'PENDING')
        self.assertIsNone(claim.tx_hash)

    @mock.patch('core.tasks.generate_ai_damage_report')
    @mock.patch('core.tasks.send_sms_alert')
    def test_claim_pending_when_wallet_missing(self, mock_sms_delay, mock_ai_delay):
        # 即使配置了 Web3，农场无钱包地址同样记 PENDING 且不发链上交易
        self.farm.wallet_address = None
        self.farm.save()
        with mock.patch.dict(os.environ, {
            'WEB3_PROVIDER_URI': 'http://localhost:8545',
            'WEB3_PRIVATE_KEY': '0x' + 'a' * 64,
        }):
            process_disaster_event(self.event.id, is_simulation=True)

        claim = Claim.objects.get(farm=self.farm)
        self.assertEqual(claim.status, 'PENDING')
        self.assertIsNone(claim.tx_hash)


class BlockchainServiceCompatibilityTests(TestCase):
    """Settlement signing supports both Web3 6 and Web3 7 field names."""

    def test_reads_web3_7_raw_transaction_field(self):
        signed = SimpleNamespace(raw_transaction=b'web3-7-signed')
        self.assertEqual(
            BlockchainService._signed_transaction_bytes(signed),
            b'web3-7-signed',
        )

    def test_reads_web3_6_raw_transaction_field(self):
        signed = SimpleNamespace(rawTransaction=b'web3-6-signed')
        self.assertEqual(
            BlockchainService._signed_transaction_bytes(signed),
            b'web3-6-signed',
        )

    @override_settings(LIVE_SETTLEMENT_ENABLED=False)
    def test_service_refuses_to_settle_when_live_gate_is_disabled(self):
        with self.assertRaises(BlockchainConfigError):
            BlockchainService()


class OutboundIntegrationSafetyTests(TestCase):
    """Credentials alone must not enable real SMS or fund transfers."""

    @override_settings(LIVE_AI_ENABLED=False, OPENAI_API_KEY='sk-test')
    @mock.patch('core.services.llm_service.openai.OpenAI')
    def test_ai_stays_mock_when_live_gate_is_disabled(self, mock_openai):
        reply = ask_agri_guard_ai('context', 'question')

        self.assertIn('[Mock RAG Response]', reply)
        mock_openai.assert_not_called()

    @override_settings(
        LIVE_SMS_ENABLED=False,
        TWILIO_ACCOUNT_SID='AC-test',
        TWILIO_AUTH_TOKEN='token-test',
        TWILIO_PHONE_NUMBER='+10000000000',
    )
    @mock.patch('core.tasks.time.sleep')
    @mock.patch('core.tasks.Client')
    def test_sms_stays_mock_when_live_gate_is_disabled(self, mock_client, mock_sleep):
        result = send_sms_alert('+254700000000', 'Safety gate test')

        self.assertEqual(result['mode'], 'mock')
        mock_client.assert_not_called()
        mock_sleep.assert_called_once()


@override_settings(
    CHANNEL_LAYERS=IN_MEMORY_CHANNELS,
    ALERT_DB_POLL_INTERVAL=0.05,
)
class AlertConsumerPollingTests(TransactionTestCase):
    """数据库轮询兜底：跨实例创建的告警仍会推送给 WebSocket 客户端。"""

    def test_alert_created_after_connect_is_delivered(self):
        farm = make_farm(make_user())
        event = make_event('FLOOD', severity_level=3)

        async def scenario():
            communicator = WebsocketCommunicator(ALERT_WS_APPLICATION, '/ws/alerts/')
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

            greeting = await communicator.receive_json_from()
            self.assertEqual(greeting['message'], 'Connected to Alert WebSocket')

            alert = await database_sync_to_async(RiskAlert.objects.create)(
                farm=farm,
                event=event,
                status='WARNING',
                confidence=72,
            )
            payload = await communicator.receive_json_from(timeout=1)
            await communicator.disconnect()
            return alert, payload

        alert, payload = async_to_sync(scenario)()
        self.assertEqual(payload['message']['type'], 'NEW_ALERT')
        self.assertEqual(payload['message']['data']['id'], alert.id)
        self.assertEqual(payload['message']['data']['farm_name'], farm.name)
        self.assertEqual(payload['message']['data']['confidence'], 72.0)
