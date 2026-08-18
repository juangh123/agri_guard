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
from unittest import mock

from django.contrib.auth.models import User
from django.contrib.gis.geos import GEOSGeometry, Polygon
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from .engine import ParametricClaimEngine
from .models import Claim, DisasterEvent, Farm, RiskAlert
from .tasks import process_disaster_event

# 内存在内存中的 channel layer，避免测试依赖真实 Redis
IN_MEMORY_CHANNELS = {
    'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}
}

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

