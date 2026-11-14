"""Per-farm GNSS evidence report (JSON and printable HTML).

The report answers the questions an insurer, auditor or judge asks about a
parametric policy's insured area: where exactly is the plot, how was it
measured, how good is that measurement, can the measurement be reproduced, and
which hazard footprints touch it.

It is public like the farm map, so it never includes the owner, phone number or
wallet. The raw receiver log stays owner-only; its SHA-256 is published here.

``report_sha256`` is the SHA-256 of the canonical JSON of the report without
``generated_at`` and ``report_sha256`` itself, so the same farm state always
hashes the same and any change to it changes the hash.
"""
import hashlib
import json
import math
from html import escape

from django.core.exceptions import ObjectDoesNotExist
from django.utils import timezone

from .gnss_logs import MAX_FIX_ACCURACY_M, build_boundary_from_log
from .gnss_validation import EARTH_AUTHALIC_RADIUS_M, GnssValidationError, polygon_area_ha, validate_farm_polygon

REPORT_VERSION = '1'

# Conservative boundary-uncertainty band: the whole edge shifted by the 95 %
# accuracy, i.e. perimeter x accuracy, as a share of the insured area. Payouts
# scale with insured area, so this is the share of a payout the measurement
# itself could move. AgriGuard policy thresholds, not an external standard.
GRADE_THRESHOLDS = (
    (1.0, 'survey_grade'),
    (5.0, 'claim_grade'),
    (15.0, 'indicative'),
)
GRADE_LABELS = {
    'survey_grade': 'Survey grade (band <= 1 % of area)',
    'claim_grade': 'Claim grade (band <= 5 % of area)',
    'indicative': 'Indicative (band <= 15 % of area)',
    'insufficient': 'Insufficient (band > 15 % of area)',
    'unknown': 'Unknown (no accuracy recorded)',
}

ACCURACY_BASIS_LABELS = {
    'server_computed': 'Computed by the server from the stored receiver log',
    'client_reported': 'Reported by the capturing browser/client (not verifiable by the server)',
    'simulated': 'Labelled demo simulation',
    'not_recorded': 'Not recorded',
}

MAX_HAZARDS = 50
MAX_CLAIMS = 50


def ring_perimeter_m(polygon):
    """Haversine length of the exterior ring of a WGS84 polygon, metres."""
    coords = polygon.coords[0]
    total = 0.0
    for (lng1, lat1, *_), (lng2, lat2, *_) in zip(coords, coords[1:]):
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dp, dl = p2 - p1, math.radians(lng2 - lng1)
        a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        total += 2 * EARTH_AUTHALIC_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))
    return total


def _area_ha_any(geometry):
    if geometry is None or geometry.empty:
        return 0.0
    if geometry.geom_type == 'Polygon':
        return polygon_area_ha(geometry)
    if geometry.geom_type in ('MultiPolygon', 'GeometryCollection'):
        return sum(_area_ha_any(part) for part in geometry)
    return 0.0


def _grade(band_pct):
    if band_pct is None:
        return 'unknown'
    for limit, grade in GRADE_THRESHOLDS:
        if band_pct <= limit:
            return grade
    return 'insufficient'


def _accuracy_basis(farm, log):
    if farm.gnss_source in ('receiver_nmea', 'receiver_gpx') and log is not None:
        return 'server_computed'
    if farm.gnss_source == 'demo_sim':
        return 'simulated'
    if farm.gnss_accuracy_m is None:
        return 'not_recorded'
    return 'client_reported'


def _check(name, passed, detail):
    return {'name': name, 'passed': passed, 'detail': detail}


def _reproduce(farm, log):
    """Re-run the parser on the stored log and compare with what was stored."""
    checks = []
    digest = hashlib.sha256(log.content.encode('utf-8')).hexdigest()
    stored = (farm.gnss_evidence or {}).get('log_sha256')
    checks.append(_check(
        'log_hash_matches',
        digest == log.sha256 == stored,
        f'SHA-256 of the stored log is {digest[:16]}...; the evidence records {str(stored)[:16]}...',
    ))
    try:
        polygon, evidence = build_boundary_from_log(log.content, log.format, log.filename)
    except GnssValidationError as exc:
        checks.append(_check('log_reproducible', False, f'Re-parsing the stored log failed: {exc}'))
        return checks
    same_shape = polygon.equals_exact(farm.geofence, tolerance=1e-7)
    same_accuracy = evidence.get('accuracy_p95_m') == farm.gnss_accuracy_m
    checks.append(_check(
        'log_reproducible',
        same_shape and same_accuracy,
        'Re-parsing the stored log with parser v{0} gives the same boundary and accuracy.'.format(
            evidence.get('parser_version'))
        if same_shape and same_accuracy else
        'Re-parsing the stored log gives a different boundary or accuracy than the farm record.',
    ))
    return checks


def build_report(farm):
    polygon = farm.geofence
    try:
        log = farm.gnss_log
    except ObjectDoesNotExist:
        log = None

    area_ha = polygon_area_ha(polygon)
    perimeter_m = ring_perimeter_m(polygon)
    accuracy = farm.gnss_accuracy_m
    band_ha = perimeter_m * accuracy / 10_000 if accuracy is not None else None
    band_pct = band_ha / area_ha * 100 if band_ha is not None and area_ha > 0 else None
    basis = _accuracy_basis(farm, log)
    centroid = polygon.centroid
    min_lng, min_lat, max_lng, max_lat = polygon.extent

    checks = []
    try:
        validate_farm_polygon(polygon)
        checks.append(_check('boundary_valid', True, 'Valid WGS84 polygon within AgriGuard plot limits.'))
    except GnssValidationError as exc:
        checks.append(_check('boundary_valid', False, str(exc)))
    checks.append(_check(
        'accuracy_recorded', accuracy is not None,
        f'95 % horizontal accuracy {accuracy:.2f} m.' if accuracy is not None else 'No accuracy recorded.',
    ))
    if accuracy is not None:
        checks.append(_check(
            'accuracy_within_gate', accuracy <= MAX_FIX_ACCURACY_M,
            f'{accuracy:.2f} m against a {MAX_FIX_ACCURACY_M:.0f} m gate.',
        ))
    checks.append(_check(
        'accuracy_server_computed', basis == 'server_computed', ACCURACY_BASIS_LABELS[basis],
    ))
    if log is not None:
        checks.extend(_reproduce(farm, log))

    hazards = []
    from .models import DisasterEvent  # local import: models import this module's siblings
    events = (
        DisasterEvent.objects.filter(affected_area__intersects=polygon)
        .order_by('-start_date')[:MAX_HAZARDS]
    )
    for event in events:
        overlap = event.affected_area.intersection(polygon)
        overlap_ha = _area_ha_any(overlap)
        hazards.append({
            'event_id': event.id,
            'external_id': event.external_id,
            'title': event.title,
            'event_type': event.event_type,
            'severity_level': event.severity_level,
            'start_date': event.start_date.isoformat() if event.start_date else None,
            'overlap_ha': round(overlap_ha, 4),
            'overlap_pct_of_farm': round(overlap_ha / area_ha * 100, 1) if area_ha else None,
            'simulation': bool((event.eo_metrics or {}).get('simulation')),
        })

    claims = [
        {
            'claim_no': claim.claim_no,
            'status': claim.status,
            'event_type': claim.alert.event.event_type,
            'evidence_hash': claim.evidence_hash or None,
            'triggered_at': claim.triggered_at.isoformat() if claim.triggered_at else None,
        }
        for claim in farm.claims.select_related('alert__event').order_by('-triggered_at')[:MAX_CLAIMS]
    ]

    report = {
        'report_version': REPORT_VERSION,
        'farm': {
            'id': farm.id,
            'name': farm.name,
            'crop_type': farm.crop_type,
            'registered_at': farm.created_at.isoformat() if farm.created_at else None,
        },
        'boundary': {
            'datum': 'WGS84 (EPSG:4326)',
            'geometry': json.loads(polygon.geojson),
            'vertices': polygon.num_coords - 1,
            'area_ha': round(area_ha, 4),
            'perimeter_m': round(perimeter_m, 1),
            'centroid': [round(centroid.x, 7), round(centroid.y, 7)],
            'bbox': [round(min_lng, 7), round(min_lat, 7), round(max_lng, 7), round(max_lat, 7)],
        },
        'capture': {
            'source': farm.gnss_source or 'not_recorded',
            'source_label': dict(farm.GNSS_SOURCE_CHOICES).get(farm.gnss_source, 'Not recorded'),
            'device': farm.gnss_device_id or None,
            'captured_at': farm.gnss_captured_at.isoformat() if farm.gnss_captured_at else None,
            'accuracy_m_95': accuracy,
            'accuracy_basis': basis,
            'accuracy_basis_label': ACCURACY_BASIS_LABELS[basis],
            'receiver_log': farm.gnss_evidence or None,
            'receiver_log_stored': log is not None,
        },
        'uncertainty': {
            'band_ha': round(band_ha, 4) if band_ha is not None else None,
            'band_pct_of_area': round(band_pct, 2) if band_pct is not None else None,
            'grade': _grade(band_pct),
            'grade_label': GRADE_LABELS[_grade(band_pct)],
            # A grade is only as good as the accuracy behind it.
            'accuracy_verified': basis == 'server_computed',
            'method': 'Perimeter x 95 % accuracy: the whole boundary shifted outward by its accuracy. '
                      'Conservative; random per-fix errors partly cancel along an edge.',
            'thresholds_pct': {grade: limit for limit, grade in GRADE_THRESHOLDS},
        },
        'checks': checks,
        'hazards': hazards,
        'claims': claims,
    }
    canonical = json.dumps(report, sort_keys=True, separators=(',', ':'), default=str)
    report['report_sha256'] = hashlib.sha256(canonical.encode('utf-8')).hexdigest()
    report['generated_at'] = timezone.now().isoformat()
    return report


# ---------------------------------------------------------------------------
# HTML rendering
# ---------------------------------------------------------------------------
def _svg_outline(report, size=320):
    ring = report['boundary']['geometry']['coordinates'][0]
    lat0 = report['boundary']['centroid'][1]
    kx = math.cos(math.radians(lat0))
    xs = [lng * kx for lng, *_ in ring]
    ys = [lat for _lng, lat, *_ in ring]
    span = max(max(xs) - min(xs), max(ys) - min(ys)) or 1e-9
    pad = 18
    scale = (size - 2 * pad) / span
    points = ' '.join(
        f'{pad + (x - min(xs)) * scale:.1f},{size - pad - (y - min(ys)) * scale:.1f}'
        for x, y in zip(xs, ys)
    )
    dots = ''.join(
        f'<circle cx="{pad + (x - min(xs)) * scale:.1f}" cy="{size - pad - (y - min(ys)) * scale:.1f}" r="2.2"/>'
        for x, y in zip(xs[:-1], ys[:-1])
    ) if len(xs) <= 60 else ''
    metres = span * (math.pi / 180) * EARTH_AUTHALIC_RADIUS_M
    target = max(metres / 3, 1)
    magnitude = 10 ** math.floor(math.log10(target))
    bar_m = max(step * magnitude for step in (1, 2, 5) if step * magnitude <= target)
    bar_px = bar_m / metres * (size - 2 * pad)
    return (
        f'<svg viewBox="0 0 {size} {size}" width="{size}" height="{size}" role="img" '
        f'aria-label="Boundary outline">'
        f'<rect width="{size}" height="{size}" fill="#f6f8f5"/>'
        f'<polygon points="{points}" fill="rgba(22,128,61,0.15)" stroke="#16803d" stroke-width="2"/>'
        f'<g fill="#16803d">{dots}</g>'
        f'<line x1="{pad}" y1="{size - 8}" x2="{pad + bar_px:.1f}" y2="{size - 8}" stroke="#333" stroke-width="2"/>'
        f'<text x="{pad + bar_px + 6:.1f}" y="{size - 4}" font-size="11" fill="#333">{bar_m:g} m</text>'
        f'<text x="{size - pad}" y="{pad}" font-size="12" text-anchor="end" fill="#333">N &#8593;</text>'
        f'</svg>'
    )


def _grade_html(uncertainty):
    css = uncertainty['grade'] if uncertainty['accuracy_verified'] else 'indicative'
    note = '' if uncertainty['accuracy_verified'] else (
        '<br><span class="muted">Based on an accuracy the server has not verified.</span>')
    return f'<span class="grade {escape(css)}">{escape(uncertainty["grade_label"])}</span>{note}'


def _row(label, value):
    return f'<tr><th>{escape(label)}</th><td>{value}</td></tr>'


def _fmt(value, suffix=''):
    if value is None or value == '':
        return '<span class="muted">not recorded</span>'
    return escape(f'{value}{suffix}')


def render_html(report, json_url):
    farm, boundary, capture = report['farm'], report['boundary'], report['capture']
    uncertainty = report['uncertainty']
    log = capture['receiver_log'] or {}
    is_receiver = capture['accuracy_basis'] == 'server_computed'

    capture_rows = [
        _row('Source', _fmt(capture['source_label'])),
        _row('Device / file', _fmt(capture['device'])),
        _row('Captured at (UTC)', _fmt(capture['captured_at'])),
        _row('Accuracy (95 %)', _fmt(capture['accuracy_m_95'], ' m')),
        _row('Accuracy basis', _fmt(capture['accuracy_basis_label'])),
    ]
    if is_receiver:
        rejected = ', '.join(f'{k}: {v}' for k, v in (log.get('rejected') or {}).items()) or 'none'
        quality = ', '.join(f'{k}: {v}' for k, v in (log.get('fix_quality') or {}).items()) or 'n/a'
        capture_rows += [
            _row('Log format / method', _fmt(f"{log.get('format', '').upper()} / {log.get('method', '')}")),
            _row('Log SHA-256', f"<code>{escape(log.get('log_sha256', ''))}</code>"),
            _row('Fixes used / total', _fmt(f"{log.get('fixes_used')} / {log.get('fixes_total')}")),
            _row('Rejected', _fmt(rejected)),
            _row('Fix quality of used fixes', _fmt(quality)),
            _row('Constellations used', _fmt(', '.join(log.get('constellations_used') or []) or None)),
            _row('Accuracy method', _fmt(log.get('accuracy_basis'))),
            _row('Accuracy p50 / p95', _fmt(f"{log.get('accuracy_p50_m')} m / {log.get('accuracy_p95_m')} m")),
            _row('Median HDOP / satellites', _fmt(f"{log.get('hdop_median')} / {log.get('satellites_median')}")),
            _row('Walk duration / closure gap', _fmt(
                f"{log.get('duration_s')} s / {log.get('closure_gap_m')} m"
                if log.get('method') == 'walked_perimeter' else None)),
        ]

    checks_html = ''.join(
        f'<li class="{"pass" if c["passed"] else "fail"}"><b>{"PASS" if c["passed"] else "FAIL"}</b> '
        f'{escape(c["name"])}: {escape(c["detail"])}</li>'
        for c in report['checks']
    )
    hazards_html = ''.join(
        f'<tr><td>{escape(h["event_type"])}</td><td>{escape(h["title"])}'
        f'{" <span class=muted>(simulated)</span>" if h["simulation"] else ""}</td>'
        f'<td>{escape(str(h["start_date"] or "")[:10])}</td><td class="nowrap">{h["overlap_ha"]} ha ({h["overlap_pct_of_farm"]} %)</td></tr>'
        for h in report['hazards']
    ) or '<tr><td colspan="4" class="muted">No hazard footprint intersects this boundary.</td></tr>'
    claims_html = ''.join(
        f'<tr><td><code>{escape(c["claim_no"])}</code></td><td>{escape(c["event_type"])}</td>'
        f'<td>{escape(c["status"])}</td><td><code>{escape((c["evidence_hash"] or "")[:16])}</code></td></tr>'
        for c in report['claims']
    ) or '<tr><td colspan="4" class="muted">No claims.</td></tr>'

    demo_banner = ''
    if capture['accuracy_basis'] == 'simulated':
        demo_banner = ('<p class="banner">Demo farm: the capture metadata is a labelled simulation, '
                       'not a field survey.</p>')
    elif not is_receiver:
        demo_banner = ('<p class="banner">The accuracy below was reported by the capturing device; '
                       'the server cannot verify it. Import a receiver log for a server-verified figure.</p>')

    return f'''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>GNSS evidence - {escape(farm['name'])}</title>
<style>
body{{font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1d2a20;margin:0;background:#fff}}
main{{max-width:880px;margin:0 auto;padding:28px 20px 48px}}
h1{{font-size:22px;margin:0 0 4px}} h2{{font-size:15px;margin:28px 0 8px;border-bottom:1px solid #dfe6df;padding-bottom:4px}}
.sub{{color:#5b6b5e;margin:0 0 16px}} .muted{{color:#7a877c}}
.grid{{display:grid;grid-template-columns:330px 1fr;gap:20px;align-items:start}}
@media (max-width:720px){{.grid{{grid-template-columns:1fr}}}}
table{{border-collapse:collapse;width:100%}} th,td{{text-align:left;padding:4px 8px 4px 0;vertical-align:top;border-bottom:1px solid #eef2ee}}
th{{color:#5b6b5e;font-weight:600;width:42%}} code{{font:12px ui-monospace,Menlo,Consolas,monospace;word-break:break-all}}
.grade{{display:inline-block;padding:3px 9px;border-radius:999px;font-weight:700;background:#e8f3ea;color:#16803d}}
.grade.indicative{{background:#fff4dc;color:#94600a}} .grade.insufficient,.grade.unknown{{background:#fde8e8;color:#a32020}}
ul.checks{{list-style:none;padding:0;margin:0}} ul.checks li{{padding:3px 0}} li.pass b{{color:#16803d}} li.fail b{{color:#a32020}}
.nowrap{{white-space:nowrap}} .banner{{background:#fff4dc;border:1px solid #f0d28c;padding:8px 12px;border-radius:8px}}
.actions{{margin:14px 0}} .actions a,.actions button{{font:inherit;margin-right:10px}}
@media print{{.actions{{display:none}} main{{padding:0}}}}
</style></head><body><main>
<h1>GNSS boundary evidence: {escape(farm['name'])}</h1>
<p class="sub">AgriGuard farm #{farm['id']} · {escape(farm['crop_type'])} · report v{escape(report['report_version'])} · generated {escape(report['generated_at'][:19])} UTC</p>
<div class="actions"><button onclick="window.print()">Print / save as PDF</button><a href="{escape(json_url)}">Machine-readable JSON</a></div>
{demo_banner}
<div class="grid"><div>{_svg_outline(report)}</div><div><table>
{_row('Datum', escape(boundary['datum']))}
{_row('Area', escape(f"{boundary['area_ha']} ha"))}
{_row('Perimeter', escape(f"{boundary['perimeter_m']} m"))}
{_row('Vertices', escape(str(boundary['vertices'])))}
{_row('Centroid (lat, lon)', escape(f"{boundary['centroid'][1]}, {boundary['centroid'][0]}"))}
{_row('Uncertainty band', escape(f"{uncertainty['band_ha']} ha ({uncertainty['band_pct_of_area']} % of area)") if uncertainty['band_ha'] is not None else _fmt(None))}
{_row('Grade', _grade_html(uncertainty))}
</table></div></div>
<h2>Capture</h2><table>{''.join(capture_rows)}</table>
<h2>Checks</h2><ul class="checks">{checks_html}</ul>
<h2>Hazard footprints intersecting the boundary</h2>
<table><tr><th>Type</th><th>Event</th><th>Start</th><th>Overlap</th></tr>{hazards_html}</table>
<h2>Claims on this farm</h2>
<table><tr><th>Claim</th><th>Hazard</th><th>Status</th><th>Evidence hash</th></tr>{claims_html}</table>
<h2>Integrity</h2>
<p>Report SHA-256 <code>{escape(report['report_sha256'])}</code> — computed over the canonical JSON of this report
(sorted keys, no whitespace) without <code>generated_at</code> and <code>report_sha256</code>.
Uncertainty method: {escape(uncertainty['method'])}</p>
</main></body></html>'''
