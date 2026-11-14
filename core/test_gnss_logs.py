"""Receiver-log import (core.gnss_logs) and the GNSS evidence report.

The sample logs in frontend/public/samples are SYNTHETIC (see
scripts/make_sample_gnss_logs.py); they follow the Mwangi Farm demo plot and
carry a known set of defects the parser must reject.
"""
import datetime as dt
import hashlib
import json
import math
from pathlib import Path

from django.contrib.auth.models import User
from django.contrib.gis.geos import Polygon
from django.core.cache import caches
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .gnss_logs import GnssLogError, MAX_LOG_BYTES, build_boundary_from_log
from .gnss_validation import polygon_area_ha
from .management.commands.seed_demo_data import DEMO_FARMS, boundary_polygon
from .models import DisasterEvent, Farm, GnssCaptureLog

SAMPLES = Path(__file__).resolve().parents[1] / 'frontend' / 'public' / 'samples'
WALK = SAMPLES / 'SYNTHETIC_mwangi_walk.nmea'
CORNERS = SAMPLES / 'SYNTHETIC_mwangi_corners.gpx'


def reference_plot():
    polygon = boundary_polygon(DEMO_FARMS[0]['boundary'])
    polygon.srid = 4326
    return polygon


def _checksum(body):
    value = 0
    for char in body:
        value ^= ord(char)
    return f'{value:02X}'


def _sentence(body):
    return f'${body}*{_checksum(body)}'


def _nmea_lat(lat):
    deg = int(abs(lat))
    return f'{deg:02d}{(abs(lat) - deg) * 60:010.7f}', 'N' if lat >= 0 else 'S'


def _nmea_lon(lon):
    deg = int(abs(lon))
    return f'{deg:03d}{(abs(lon) - deg) * 60:010.7f}', 'E' if lon >= 0 else 'W'


def square_walk(side_m=120.0, step_m=4.0, quality=1, hdop=1.0, gst=None, close=True,
                prefix='', talker='GP', lat0=0.5, lon0=35.0):
    """A clean walk around a square, one GGA (+RMC, +GST) per step."""
    ky = math.radians(1) * 6371007.2
    kx = ky * math.cos(math.radians(lat0))
    corners = [(0, 0), (side_m, 0), (side_m, side_m), (0, side_m), (0, 0)]
    pts = []
    for (x1, y1), (x2, y2) in zip(corners, corners[1:]):
        n = int(max(abs(x2 - x1), abs(y2 - y1)) / step_m)
        pts += [(x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n) for i in range(n)]
    if close:
        pts.append(corners[-1])
    else:
        pts = pts[: int(len(pts) * 0.75)]
    lines = []
    start = dt.datetime(2026, 11, 12, 7, 0, 0)
    for i, (x, y) in enumerate(pts):
        t = (start + dt.timedelta(seconds=i)).strftime('%H%M%S.00')
        la, lah = _nmea_lat(lat0 + y / ky)
        lo, loh = _nmea_lon(lon0 + x / kx)
        lines.append(prefix + _sentence(f'{talker}RMC,{t},A,{la},{lah},{lo},{loh},1.0,,121126,,,A'))
        lines.append(prefix + _sentence(f'{talker}GGA,{t},{la},{lah},{lo},{loh},{quality},12,{hdop:.2f},100.0,M,0.0,M,,'))
        if gst is not None:
            lines.append(prefix + _sentence(f'{talker}GST,{t},1.0,1.0,1.0,0.0,{gst:.2f},{gst:.2f},2.0'))
    return '\n'.join(lines) + '\n'


class ReceiverLogParserTests(SimpleTestCase):
    def test_sample_walk_recovers_the_plot_and_rejects_every_injected_defect(self):
        polygon, evidence = build_boundary_from_log(WALK.read_bytes().decode(), 'auto', WALK.name)
        self.assertEqual(evidence['method'], 'walked_perimeter')
        self.assertEqual(evidence['source'], 'receiver_nmea')
        # scripts/make_sample_gnss_logs.py injects exactly these defects.
        self.assertEqual(evidence['rejected'], {'bad_checksum': 1, 'high_hdop': 2, 'no_fix': 3})
        self.assertEqual(evidence['accuracy_basis'], 'gst')
        self.assertLess(evidence['accuracy_p95_m'], 3.0)
        self.assertIn('Galileo', evidence['constellations_used'])
        self.assertEqual(evidence['started_at'], '2026-11-12T06:40:00+00:00')
        self.assertEqual(evidence['log_sha256'], hashlib.sha256(WALK.read_bytes()).hexdigest())
        ref = reference_plot()
        self.assertAlmostEqual(polygon_area_ha(polygon) / polygon_area_ha(ref), 1.0, delta=0.03)
        self.assertLess(polygon_area_ha(polygon.sym_difference(ref)), 0.06 * polygon_area_ha(ref))

    def test_sample_gpx_waypoints_become_surveyed_corners(self):
        polygon, evidence = build_boundary_from_log(CORNERS.read_bytes().decode(), 'auto', CORNERS.name)
        self.assertEqual(evidence['method'], 'surveyed_corners')
        self.assertEqual(evidence['vertices'], 4)
        self.assertEqual(evidence['accuracy_basis'], 'hdop_model')
        self.assertIsNone(evidence['closure_gap_m'])
        self.assertAlmostEqual(polygon_area_ha(polygon) / polygon_area_ha(reference_plot()), 1.0, delta=0.02)

    def test_parsing_is_deterministic(self):
        text = WALK.read_bytes().decode()
        first, evidence_a = build_boundary_from_log(text, 'nmea')
        second, evidence_b = build_boundary_from_log(text, 'nmea')
        self.assertTrue(first.equals_exact(second, tolerance=0))
        self.assertEqual(evidence_a, evidence_b)

    def test_hdop_model_is_used_without_gst(self):
        _polygon, evidence = build_boundary_from_log(square_walk(hdop=1.5), 'nmea')
        self.assertEqual(evidence['accuracy_basis'], 'hdop_model')
        self.assertAlmostEqual(evidence['accuracy_p95_m'], 2 * 1.5 * 4.0, places=2)

    def test_gst_overrides_the_hdop_model(self):
        _polygon, evidence = build_boundary_from_log(square_walk(hdop=1.5, gst=0.3), 'nmea')
        self.assertEqual(evidence['accuracy_basis'], 'gst')
        self.assertAlmostEqual(evidence['accuracy_p95_m'], 2 * math.hypot(0.3, 0.3), places=2)

    def test_android_gnsslogger_prefix_and_galileo_talker_are_accepted(self):
        _polygon, evidence = build_boundary_from_log(square_walk(prefix='NMEA,', talker='GA'), 'auto', 'gnss_log.txt')
        self.assertGreater(evidence['fixes_used'], 50)
        self.assertAlmostEqual(evidence['area_ha'], 1.44, delta=0.03)

    def test_bad_and_missing_checksums_are_rejected(self):
        lines = square_walk().splitlines()
        tampered = [line.replace(',1,12,', ',4,12,') if 'GGA' in line and 100 <= i < 120 else line
                    for i, line in enumerate(lines)]                     # edited, checksum now wrong
        stripped = [line.split('*')[0] if 'GGA' in line and 120 <= i < 130 else line
                    for i, line in enumerate(tampered)]                  # checksum removed
        _polygon, evidence = build_boundary_from_log('\n'.join(stripped), 'nmea')
        self.assertEqual(evidence['rejected']['bad_checksum'], 10)
        self.assertEqual(evidence['rejected']['missing_checksum'], 5)
        self.assertNotIn('rtk_fixed', evidence['fix_quality'])

    def test_simulator_mode_fixes_are_never_accepted(self):
        with self.assertRaisesMessage(GnssLogError, 'pass the quality gate'):
            build_boundary_from_log(square_walk(quality=8), 'nmea')

    def test_poor_fixes_fail_the_quality_gate(self):
        with self.assertRaisesMessage(GnssLogError, 'pass the quality gate'):
            build_boundary_from_log(square_walk(hdop=7.0), 'nmea')

    def test_an_unclosed_walk_is_rejected(self):
        with self.assertRaisesMessage(GnssLogError, 'from where it started'):
            build_boundary_from_log(square_walk(close=False), 'nmea')

    def test_gpx_with_a_dtd_is_rejected(self):
        evil = '<?xml version="1.0"?><!DOCTYPE gpx [<!ENTITY a "aaaa">]><gpx>&a;</gpx>'
        with self.assertRaisesMessage(GnssLogError, 'DOCTYPE'):
            build_boundary_from_log(evil, 'gpx')

    def test_gpx_corner_that_fails_the_gate_rejects_the_survey(self):
        text = CORNERS.read_bytes().decode().replace('<hdop>', '<hdop>9', 1)
        with self.assertRaisesMessage(GnssLogError, 're-survey those corners'):
            build_boundary_from_log(text, 'gpx')

    def test_oversized_and_empty_logs_are_rejected(self):
        with self.assertRaisesMessage(GnssLogError, 'at most'):
            build_boundary_from_log('$' + 'x' * MAX_LOG_BYTES, 'nmea')
        with self.assertRaisesMessage(GnssLogError, 'empty'):
            build_boundary_from_log('   ', 'nmea')

    def test_a_country_sized_track_is_rejected_by_the_plot_limits(self):
        with self.assertRaisesMessage(GnssLogError, 'degrees'):
            build_boundary_from_log(square_walk(side_m=20_000, step_m=400), 'nmea')


class ReceiverLogApiTests(TestCase):
    REGISTER = '/api/auth/register/'
    PARSE = '/api/gnss/parse-log/'

    def setUp(self):
        for alias in ('default', 'throttle'):
            caches[alias].clear()
        self.client = APIClient()
        self.walk = WALK.read_bytes().decode()

    def _register(self, **overrides):
        payload = {
            'username': 'receiverfarmer',
            'password': 'secret123',
            'farm_name': 'Kitale <b>Plot</b>',
            'phone_number': '+254700000777',
            'wallet_address': '0x7777777777777777777777777777777777777777',
            'gnss_log': {'content': self.walk, 'format': 'auto', 'filename': 'C:\\logs\\SYNTHETIC_mwangi_walk.nmea'},
        }
        payload.update(overrides)
        return self.client.post(self.REGISTER, payload, format='json')

    def test_register_with_a_log_uses_server_computed_values_only(self):
        response = self._register(gnss_accuracy_m=0.01, gnss_captured_at='2020-01-01T00:00:00Z')
        self.assertEqual(response.status_code, 201, response.data)
        farm = Farm.objects.get(id=response.data['farm_id'])
        self.assertEqual(farm.gnss_source, 'receiver_nmea')
        self.assertEqual(farm.gnss_accuracy_m, farm.gnss_evidence['accuracy_p95_m'])
        self.assertNotEqual(farm.gnss_accuracy_m, 0.01)
        self.assertEqual(farm.gnss_captured_at, dt.datetime(2026, 11, 12, 6, 40, tzinfo=dt.timezone.utc))
        self.assertEqual(farm.gnss_device_id, 'receiver log: SYNTHETIC_mwangi_walk.nmea')
        log = GnssCaptureLog.objects.get(farm=farm)
        self.assertEqual(log.filename, 'SYNTHETIC_mwangi_walk.nmea')
        self.assertEqual(log.sha256, hashlib.sha256(self.walk.encode()).hexdigest())
        self.assertEqual(log.content, self.walk)

    def test_geometry_and_log_together_are_rejected_without_creating_a_user(self):
        geometry = json.loads(reference_plot().geojson)
        response = self._register(geometry=geometry)
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(username='receiverfarmer').exists())

    def test_an_unusable_log_is_rejected_without_creating_a_user(self):
        response = self._register(gnss_log={'content': square_walk(quality=8)})
        self.assertEqual(response.status_code, 400)
        self.assertIn('quality gate', response.data['error'])
        self.assertFalse(User.objects.filter(username='receiverfarmer').exists())
        response = self._register(gnss_log='not an object')
        self.assertEqual(response.status_code, 400)

    def test_browser_registrations_record_their_capture_method(self):
        geometry = json.loads(reference_plot().geojson)
        response = self.client.post(self.REGISTER, {
            'username': 'walker', 'password': 'secret123', 'farm_name': 'Walked',
            'phone_number': '+254700000778', 'geometry': geometry,
            'gnss_accuracy_m': 6.0, 'gnss_capture_method': 'walk',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Farm.objects.get(id=response.data['farm_id']).gnss_source, 'browser_walk')

    def test_parse_preview_stores_nothing(self):
        before = (User.objects.count(), Farm.objects.count(), GnssCaptureLog.objects.count())
        response = self.client.post(self.PARSE, {'content': CORNERS.read_bytes().decode(), 'filename': CORNERS.name}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['geometry']['type'], 'Polygon')
        self.assertEqual(response.data['evidence']['method'], 'surveyed_corners')
        self.assertEqual(response.data['accuracy_m'], response.data['evidence']['accuracy_p95_m'])
        self.assertEqual(before, (User.objects.count(), Farm.objects.count(), GnssCaptureLog.objects.count()))

    def test_parse_preview_is_rate_limited(self):
        with override_settings(GNSS_PARSE_THROTTLE_RATE='2/hour'):
            codes = [self.client.post(self.PARSE, {'content': 'x'}, format='json').status_code for _ in range(3)]
        self.assertEqual(codes, [400, 400, 429])

    def _receiver_farm(self):
        response = self._register()
        self.assertEqual(response.status_code, 201, response.data)
        return Farm.objects.get(id=response.data['farm_id'])

    def test_evidence_report_is_public_reproducible_and_private_fields_free(self):
        farm = self._receiver_farm()
        event = DisasterEvent(
            title='Test flood', event_type='FLOOD', severity_level=3, start_date=timezone.now(),
            affected_area=Polygon.from_bbox((34.9667, 1.0560, 34.9690, 1.0600)),
            eo_metrics={'simulation': True},
        )
        event.affected_area.srid = 4326
        event._skip_auto_trigger = True
        event.save()

        anonymous = APIClient()
        response = anonymous.get(f'/api/farms/{farm.id}/gnss-evidence/')
        self.assertEqual(response.status_code, 200)
        report = response.json()
        text = json.dumps(report)
        for secret in ('+254700000777', '0x7777777777777777777777777777777777777777', 'receiverfarmer'):
            self.assertNotIn(secret, text)
        checks = {c['name']: c['passed'] for c in report['checks']}
        self.assertTrue(checks['accuracy_server_computed'])
        self.assertTrue(checks['log_hash_matches'])
        self.assertTrue(checks['log_reproducible'])
        self.assertEqual(report['capture']['accuracy_basis'], 'server_computed')
        self.assertEqual(len(report['hazards']), 1)
        self.assertGreater(report['hazards'][0]['overlap_ha'], 0)
        self.assertLess(report['hazards'][0]['overlap_pct_of_farm'], 100)
        self.assertIn(report['uncertainty']['grade'], ('claim_grade', 'indicative'))
        again = anonymous.get(f'/api/farms/{farm.id}/gnss-evidence/').json()
        self.assertEqual(report['report_sha256'], again['report_sha256'])

    def test_tampering_with_the_stored_log_fails_the_checks(self):
        farm = self._receiver_farm()
        GnssCaptureLog.objects.filter(farm=farm).update(content=self.walk.replace('GNGGA,064500', 'GNGGA,064501', 1))
        report = APIClient().get(f'/api/farms/{farm.id}/gnss-evidence/').json()
        checks = {c['name']: c['passed'] for c in report['checks']}
        self.assertFalse(checks['log_hash_matches'])

    def test_evidence_html_is_escaped_and_locked_down(self):
        farm = self._receiver_farm()
        response = APIClient().get(f'/api/farms/{farm.id}/gnss-evidence/html/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response['Content-Type'].startswith('text/html'))
        self.assertIn("default-src 'none'", response['Content-Security-Policy'])
        body = response.content.decode()
        self.assertIn('Kitale &lt;b&gt;Plot&lt;/b&gt;', body)
        self.assertNotIn('<b>Plot</b>', body)
        self.assertIn('Computed by the server from the stored receiver log', body)
        self.assertIn(f'/api/farms/{farm.id}/gnss-evidence/', body)

    def test_browser_and_demo_reports_say_their_accuracy_is_not_server_verified(self):
        from django.core.management import call_command
        call_command('seed_demo_data', verbosity=0)
        demo = Farm.objects.get(name='Mwangi Farm')
        self.assertEqual(demo.gnss_source, 'demo_sim')
        report = APIClient().get(f'/api/farms/{demo.id}/gnss-evidence/').json()
        self.assertEqual(report['capture']['accuracy_basis'], 'simulated')
        self.assertFalse({c['name']: c['passed'] for c in report['checks']}['accuracy_server_computed'])
        self.assertTrue(report['claims'])
        self.assertFalse(report['uncertainty']['accuracy_verified'])
        body = APIClient().get(f'/api/farms/{demo.id}/gnss-evidence/html/').content.decode()
        self.assertIn('labelled simulation', body)
        self.assertIn('not verified', body)

    def test_raw_log_download_is_owner_only(self):
        farm = self._receiver_farm()
        url = f'/api/farms/{farm.id}/gnss-log/'
        self.assertEqual(APIClient().get(url).status_code, 401)
        other = User.objects.create_user('other', password='x')
        client = APIClient()
        client.force_authenticate(other)
        self.assertEqual(client.get(url).status_code, 404)
        client.force_authenticate(farm.owner)
        response = client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content.decode(), self.walk)
        self.assertEqual(response['X-Content-SHA256'], farm.gnss_log.sha256)
        self.assertIn('SYNTHETIC_mwangi_walk.nmea', response['Content-Disposition'])

    def test_farm_list_exposes_the_capture_source(self):
        farm = self._receiver_farm()
        features = APIClient().get('/api/farms/').json()['features']
        source = {f['id']: f['properties']['gnss_source'] for f in features}
        self.assertEqual(source[farm.id], 'receiver_nmea')
