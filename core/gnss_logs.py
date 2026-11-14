"""Build a farm boundary from a raw GNSS receiver log (NMEA 0183 or GPX).

Why this exists
---------------
A boundary walked in the browser carries an accuracy number the browser reports
about itself; the server cannot check it. A receiver log is different: it holds
the receiver's own per-epoch fix quality, satellite count, HDOP and (when the
receiver emits ``GST``) its error estimate. The server parses that log itself,
throws away fixes that are not good enough, derives the polygon and an accuracy
figure from what is left, and keeps a SHA-256 of the exact bytes it parsed.
Any accuracy or geometry the client sends alongside a log is ignored.

This does not prove the log came from a real receiver (a log can be written by
hand), but every number in the evidence is reproducible from the stored log by
anyone who re-runs this parser on it.

Accuracy convention
-------------------
Every accuracy in this module is a horizontal radius at roughly 95 % confidence
(2DRMS), the same convention as the browser Geolocation API, so receiver and
browser captures are comparable.

* ``GST`` present: ``2 * sqrt(sigma_lat**2 + sigma_lon**2)`` from the receiver.
* otherwise: ``2 * HDOP * UERE`` with a user-equivalent range error chosen by
  fix quality (``UERE_BY_QUALITY_M``). This is a model, and the evidence says so.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import math
import re
import statistics
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

from django.contrib.gis.geos import LinearRing, LineString, Polygon

from .gnss_validation import (
    EARTH_AUTHALIC_RADIUS_M,
    MAX_BOUNDARY_VERTICES,
    GnssValidationError,
    polygon_area_ha,
    validate_farm_polygon,
)

PARSER_VERSION = '1'

# Comfortably above a 30-minute 1 Hz walk with GGA+RMC+GST+GSA+GSV (~1 MB) and
# below Django's 2.5 MB request-body limit once the text is JSON-escaped.
MAX_LOG_BYTES = 1_500_000
MAX_LOG_EPOCHS = 20_000

# A fix must be at least this good to become part of a boundary. The 30 m limit
# matches the per-corner gate of the in-browser "walk the boundary" capture.
MIN_SATELLITES = 4
MAX_HDOP = 5.0
MAX_FIX_ACCURACY_M = 30.0
MIN_USED_FIXES = 3

# A walked perimeter must end close to where it started, or the closing edge is
# a guess. Beyond the warning distance the evidence flags it.
MAX_CLOSURE_GAP_M = 50.0
WARN_CLOSURE_GAP_M = 15.0

# GGA fix-quality field. 0 invalid, 6 dead reckoning, 7 manual input and
# 8 simulator mode are never accepted as survey fixes.
FIX_QUALITY_LABELS = {
    1: 'gps',
    2: 'dgps_sbas',
    3: 'pps',
    4: 'rtk_fixed',
    5: 'rtk_float',
}
REJECTED_QUALITY_REASONS = {
    0: 'no_fix',
    6: 'dead_reckoning',
    7: 'manual_input',
    8: 'simulator_mode',
}
# One-sigma user-equivalent range error, metres, per fix quality. Single-
# frequency autonomous GNSS is typically 3-5 m UERE; SBAS/DGPS about 1 m; RTK
# float decimetres; RTK fixed centimetres.
UERE_BY_QUALITY_M = {
    'gps': 4.0,
    'pps': 4.0,
    'dgps_sbas': 1.0,
    'rtk_float': 0.3,
    'rtk_fixed': 0.02,
}

TALKER_CONSTELLATIONS = {
    'GP': 'GPS',
    'GL': 'GLONASS',
    'GA': 'Galileo',
    'GB': 'BeiDou',
    'BD': 'BeiDou',
    'GQ': 'QZSS',
    'QZ': 'QZSS',
    'GI': 'NavIC',
}
# NMEA 4.10+ GSA field 18 / GSV final field: GNSS system id.
SYSTEM_ID_CONSTELLATIONS = {
    '1': 'GPS', '2': 'GLONASS', '3': 'Galileo', '4': 'BeiDou', '5': 'QZSS', '6': 'NavIC',
}

GPX_FIX_TO_QUALITY = {
    '2d': 'gps',
    '3d': 'gps',
    'dgps': 'dgps_sbas',
    'pps': 'pps',
}

_NMEA_SENTENCE = re.compile(r'[$!]([A-Z0-9]{2,6}),([^*\r\n]*)(?:\*([0-9A-Fa-f]{2}))?')


class GnssLogError(GnssValidationError):
    """Raised with a client-safe message when a receiver log cannot be used."""


@dataclass
class Fix:
    lng: float
    lat: float
    quality: str
    satellites: int | None
    hdop: float | None
    accuracy_m: float | None
    accuracy_basis: str          # 'gst' | 'hdop_model' | 'none'
    time: dt.datetime | None     # UTC; None when the log carries no date


@dataclass
class ParsedLog:
    fmt: str
    fixes_total: int = 0
    candidates: list[Fix] = field(default_factory=list)
    corners: list[Fix] = field(default_factory=list)   # GPX waypoints
    rejected: dict[str, int] = field(default_factory=dict)
    constellations_used: set[str] = field(default_factory=set)
    constellations_in_view: set[str] = field(default_factory=set)
    lines: int = 0

    def reject(self, reason, count=1):
        self.rejected[reason] = self.rejected.get(reason, 0) + count


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _float(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _nmea_coord(value, hemisphere, degree_digits):
    """``ddmm.mmmm`` / ``dddmm.mmmm`` plus hemisphere to signed decimal degrees."""
    if not value or hemisphere not in ('N', 'S', 'E', 'W'):
        return None
    if len(value.split('.')[0]) != degree_digits + 2:
        return None
    degrees = _int(value[:degree_digits])
    minutes = _float(value[degree_digits:])
    if degrees is None or minutes is None or not 0 <= minutes < 60:
        return None
    decimal = degrees + minutes / 60.0
    return -decimal if hemisphere in ('S', 'W') else decimal


def _nmea_time(value):
    """``hhmmss[.ss]`` to a ``datetime.time`` (UTC) or None."""
    if not value or len(value) < 6:
        return None
    try:
        hours, minutes = int(value[0:2]), int(value[2:4])
        seconds = float(value[4:])
        whole = int(seconds)
        return dt.time(hours, minutes, whole, int(round((seconds - whole) * 1e6)) % 1_000_000)
    except ValueError:
        return None


def _nmea_date(value):
    """``ddmmyy`` to a ``datetime.date`` or None."""
    if not value or len(value) != 6 or not value.isdigit():
        return None
    try:
        return dt.date(2000 + int(value[4:6]), int(value[2:4]), int(value[0:2]))
    except ValueError:
        return None


def _checksum_ok(body, checksum):
    calculated = 0
    for char in body:
        calculated ^= ord(char)
    return f'{calculated:02X}' == checksum.upper()


def _accuracy(quality, hdop, gst_sigma_m):
    if gst_sigma_m is not None:
        return 2.0 * gst_sigma_m, 'gst'
    if hdop is not None:
        return 2.0 * hdop * UERE_BY_QUALITY_M[quality], 'hdop_model'
    return None, 'none'


def _local_projection(fixes):
    """Equirectangular projection to metres around the fixes' mean position.

    Farm plots are at most ~11 km across (``MAX_EXTENT_DEG``), where this is
    accurate to well under a metre, and it keeps GEOS simplification in metres.
    """
    lat0 = statistics.fmean(f.lat for f in fixes)
    lng0 = statistics.fmean(f.lng for f in fixes)
    kx = math.radians(1.0) * EARTH_AUTHALIC_RADIUS_M * math.cos(math.radians(lat0))
    ky = math.radians(1.0) * EARTH_AUTHALIC_RADIUS_M

    def forward(lng, lat):
        return ((lng - lng0) * kx, (lat - lat0) * ky)

    def inverse(x, y):
        return (lng0 + x / kx, lat0 + y / ky)

    return forward, inverse


def _percentile(values, pct):
    ordered = sorted(values)
    if not ordered:
        return None
    rank = (len(ordered) - 1) * pct / 100.0
    low, high = math.floor(rank), math.ceil(rank)
    return ordered[low] + (ordered[high] - ordered[low]) * (rank - low)


def _round(value, digits=2):
    return None if value is None else round(value, digits)


# ---------------------------------------------------------------------------
# NMEA 0183
# ---------------------------------------------------------------------------
def _parse_nmea(text):
    log = ParsedLog(fmt='nmea')
    epochs = {}      # time string -> dict of fields for that epoch
    order = []       # time strings in first-seen order
    current_date = None

    for raw_line in text.splitlines():
        log.lines += 1
        # Loggers often prefix sentences (Android GnssLogger: "NMEA,$GPGGA...").
        start = raw_line.find('$')
        if start < 0:
            continue
        match = _NMEA_SENTENCE.match(raw_line, start)
        if not match:
            log.reject('malformed_sentence')
            continue
        address, payload, checksum = match.groups()
        body = f'{address},{payload}'
        if checksum is None:
            log.reject('missing_checksum')
            continue
        if not _checksum_ok(body, checksum):
            log.reject('bad_checksum')
            continue

        talker, kind = address[:2], address[2:]
        fields = payload.split(',')

        if kind in ('GSV', 'GSA'):
            constellation = TALKER_CONSTELLATIONS.get(talker)
            if constellation is None and kind == 'GSA' and len(fields) >= 18:
                constellation = SYSTEM_ID_CONSTELLATIONS.get(fields[17])
            if constellation is None and kind == 'GSV' and len(fields) % 4 == 0:
                constellation = SYSTEM_ID_CONSTELLATIONS.get(fields[-1])
            if constellation:
                if kind == 'GSV':
                    log.constellations_in_view.add(constellation)
                elif any(fields[2:14]):
                    # GSA lists the satellites used in the position solution.
                    log.constellations_used.add(constellation)
            continue

        if kind == 'RMC' and len(fields) >= 9:
            current_date = _nmea_date(fields[8]) or current_date
            epoch = epochs.get(fields[0])
            if epoch is not None and epoch.get('date') is None:
                epoch['date'] = current_date
            continue

        if kind == 'ZDA' and len(fields) >= 4:
            day, month, year = _int(fields[1]), _int(fields[2]), _int(fields[3])
            if day and month and year:
                try:
                    current_date = dt.date(year, month, day)
                except ValueError:
                    pass
            continue

        if kind == 'GST' and len(fields) >= 7:
            sd_lat, sd_lon = _float(fields[5]), _float(fields[6])
            epoch = epochs.setdefault(fields[0], {'time': fields[0]})
            if fields[0] not in order:
                order.append(fields[0])
            if sd_lat is not None and sd_lon is not None and sd_lat >= 0 and sd_lon >= 0:
                epoch['gst_sigma_m'] = math.hypot(sd_lat, sd_lon)
            continue

        if kind == 'GGA' and len(fields) >= 8:
            time_key = fields[0]
            epoch = epochs.setdefault(time_key, {'time': time_key})
            if time_key not in order:
                order.append(time_key)
            if 'gga' in epoch:
                log.reject('duplicate_epoch')
                continue
            epoch['gga'] = fields
            epoch.setdefault('date', current_date)
            if len(order) > MAX_LOG_EPOCHS:
                raise GnssLogError(f'The log has more than {MAX_LOG_EPOCHS} epochs; split it or log at 1 Hz.')

    for time_key in order:
        epoch = epochs[time_key]
        fields = epoch.get('gga')
        if fields is None:
            continue
        log.fixes_total += 1
        quality_code = _int(fields[5])
        if quality_code in REJECTED_QUALITY_REASONS:
            log.reject(REJECTED_QUALITY_REASONS[quality_code])
            continue
        quality = FIX_QUALITY_LABELS.get(quality_code)
        if quality is None:
            log.reject('unknown_fix_quality')
            continue
        lat = _nmea_coord(fields[1], fields[2], 2)
        lng = _nmea_coord(fields[3], fields[4], 3)
        if lat is None or lng is None:
            log.reject('bad_coordinates')
            continue
        satellites = _int(fields[6])
        hdop = _float(fields[7])
        accuracy, basis = _accuracy(quality, hdop, epoch.get('gst_sigma_m'))

        when = None
        clock = _nmea_time(time_key)
        if clock is not None and epoch.get('date') is not None:
            when = dt.datetime.combine(epoch['date'], clock, tzinfo=dt.timezone.utc)

        log.candidates.append(Fix(lng, lat, quality, satellites, hdop, accuracy, basis, when))
    return log


# ---------------------------------------------------------------------------
# GPX 1.0 / 1.1
# ---------------------------------------------------------------------------
def _local(tag):
    return tag.rsplit('}', 1)[-1]


def _child_text(element, name):
    for child in element:
        if _local(child.tag) == name:
            return (child.text or '').strip()
    return None


def _gpx_point(element, log):
    log.fixes_total += 1
    lat, lng = _float(element.get('lat')), _float(element.get('lon'))
    if lat is None or lng is None or not (-90 <= lat <= 90 and -180 <= lng <= 180):
        log.reject('bad_coordinates')
        return None
    fix_kind = (_child_text(element, 'fix') or '').lower()
    if fix_kind == 'none':
        log.reject('no_fix')
        return None
    quality = GPX_FIX_TO_QUALITY.get(fix_kind, 'gps')
    hdop = _float(_child_text(element, 'hdop'))
    satellites = _int(_child_text(element, 'sat'))
    accuracy, basis = _accuracy(quality, hdop, None)
    when = None
    stamp = _child_text(element, 'time')
    if stamp:
        try:
            when = dt.datetime.fromisoformat(stamp.replace('Z', '+00:00'))
            if when.tzinfo is None:
                when = when.replace(tzinfo=dt.timezone.utc)
            when = when.astimezone(dt.timezone.utc)
        except ValueError:
            when = None
    return Fix(lng, lat, quality, satellites, hdop, accuracy, basis, when)


def _parse_gpx(text):
    # ElementTree never fetches external entities, but an inline DTD can still
    # declare entity bombs. A GPX file has no reason to carry a DTD at all.
    if re.search(r'<!(DOCTYPE|ENTITY)', text, re.IGNORECASE):
        raise GnssLogError('GPX files with a DOCTYPE or ENTITY declaration are not accepted.')
    try:
        root = ET.fromstring(text)
    except ET.ParseError as exc:
        raise GnssLogError(f'The GPX file is not well-formed XML: {exc}.') from None
    if _local(root.tag) != 'gpx':
        raise GnssLogError('The XML file is not GPX (root element is not <gpx>).')

    log = ParsedLog(fmt='gpx')
    log.lines = text.count('\n') + 1
    for element in root:
        if _local(element.tag) == 'wpt':
            point = _gpx_point(element, log)
            if point is not None:
                log.corners.append(point)
    for element in root.iter():
        if _local(element.tag) == 'trkpt':
            point = _gpx_point(element, log)
            if point is not None:
                log.candidates.append(point)
        if log.fixes_total > MAX_LOG_EPOCHS:
            raise GnssLogError(f'The GPX file has more than {MAX_LOG_EPOCHS} points.')
    return log


# ---------------------------------------------------------------------------
# Quality filter and polygon construction
# ---------------------------------------------------------------------------
def _passes_quality(fix, log):
    if fix.satellites is not None and fix.satellites < MIN_SATELLITES:
        log.reject('low_satellites')
        return False
    if fix.hdop is not None and fix.hdop > MAX_HDOP:
        log.reject('high_hdop')
        return False
    if fix.accuracy_m is not None and fix.accuracy_m > MAX_FIX_ACCURACY_M:
        log.reject('poor_accuracy')
        return False
    return True


MAX_SIMPLIFY_TOLERANCE_M = 10.0


def _simplify_track_to_polygon(points_m, tolerance_m):
    """Douglas-Peucker on the walked track (in metres), then close the ring.

    Simplifying the track as a line, not as a polygon, is what removes the
    walking jitter: a noisy 1 Hz track zigzags across itself, and a polygon
    built from it is already invalid before any simplification. If the result
    still crosses itself the tolerance is raised step by step, never beyond
    ``MAX_SIMPLIFY_TOLERANCE_M``; the tolerance actually used is recorded.
    """
    track = LineString(points_m)
    tolerance = tolerance_m
    while True:
        simplified = track.simplify(tolerance, preserve_topology=False)
        coords = list(simplified.coords)
        if math.dist(coords[0], coords[-1]) > 1e-6:
            coords.append(coords[0])
        polygon = Polygon(LinearRing(coords)) if len(coords) >= 4 else None
        if (
            polygon is not None
            and polygon.valid
            and polygon.num_coords <= MAX_BOUNDARY_VERTICES
        ):
            return polygon, tolerance
        if tolerance >= MAX_SIMPLIFY_TOLERANCE_M:
            return polygon, tolerance
        tolerance = min(tolerance * 1.5, MAX_SIMPLIFY_TOLERANCE_M)


def _track_length_m(points_m):
    return sum(math.dist(a, b) for a, b in zip(points_m, points_m[1:]))


def _ring_perimeter_m(polygon_m):
    coords = polygon_m.coords[0]
    return sum(math.dist(a, b) for a, b in zip(coords, coords[1:]))


def detect_format(content, filename=''):
    name = (filename or '').lower()
    if name.endswith('.gpx'):
        return 'gpx'
    if name.endswith(('.nmea', '.nma', '.log', '.txt', '.ubx.nmea')):
        return 'nmea'
    head = content.lstrip()[:200]
    if head.startswith('<'):
        return 'gpx'
    if '$' in content[:4096]:
        return 'nmea'
    raise GnssLogError('Could not tell whether the file is NMEA or GPX.')


def build_boundary_from_log(content, fmt='auto', filename=''):
    """Parse a receiver log and return ``(polygon, evidence)``.

    ``polygon`` is a validated WGS84 GEOS Polygon. ``evidence`` is a JSON-safe
    dict stored on the farm and shown in the evidence report. Raises
    ``GnssLogError`` with a client-safe message when the log is unusable.
    """
    if not isinstance(content, str) or not content.strip():
        raise GnssLogError('The receiver log is empty.')
    raw = content.encode('utf-8')
    if len(raw) > MAX_LOG_BYTES:
        raise GnssLogError(
            f'The receiver log is {len(raw)} bytes; at most {MAX_LOG_BYTES} are accepted.'
        )
    fmt = (fmt or 'auto').lower()
    if fmt == 'auto':
        fmt = detect_format(content, filename)
    if fmt not in ('nmea', 'gpx'):
        raise GnssLogError('format must be "nmea", "gpx" or "auto".')

    log = _parse_nmea(content) if fmt == 'nmea' else _parse_gpx(content)

    method = 'walked_perimeter'
    if fmt == 'gpx' and len(log.corners) >= 3:
        method = 'surveyed_corners'
        source_points = log.corners
    else:
        source_points = log.candidates
    used = [fix for fix in source_points if _passes_quality(fix, log)]
    if method == 'surveyed_corners' and len(used) != len(source_points):
        raise GnssLogError(
            'One or more GPX waypoints (corners) fail the quality gate '
            f'(at least {MIN_SATELLITES} satellites, HDOP <= {MAX_HDOP}, '
            f'accuracy <= {MAX_FIX_ACCURACY_M:.0f} m); re-survey those corners.'
        )
    if len(used) < MIN_USED_FIXES:
        raise GnssLogError(
            f'Only {len(used)} of {log.fixes_total} fixes in the log pass the quality gate; '
            f'at least {MIN_USED_FIXES} are needed.'
        )

    if all(fix.time is not None for fix in used):
        used.sort(key=lambda fix: fix.time)

    forward, inverse = _local_projection(used)
    points_m = [forward(fix.lng, fix.lat) for fix in used]
    accuracies = [fix.accuracy_m for fix in used if fix.accuracy_m is not None]

    closure_gap = math.dist(points_m[0], points_m[-1])
    warnings = []
    if method == 'walked_perimeter':
        if closure_gap > MAX_CLOSURE_GAP_M:
            raise GnssLogError(
                f'The walk ends {closure_gap:.0f} m from where it started; finish within '
                f'{MAX_CLOSURE_GAP_M:.0f} m of the starting point so the boundary closes.'
            )
        if closure_gap > WARN_CLOSURE_GAP_M:
            warnings.append('closure_gap_large')
        median_accuracy = statistics.median(accuracies) if accuracies else 3.0
        # One 95 % radius: jitter inside it is noise, corners outside it stay.
        tolerance = min(max(median_accuracy, 0.5), 5.0)
        polygon_m, tolerance = _simplify_track_to_polygon(points_m, tolerance)
    else:
        tolerance = 0.0
        polygon_m = Polygon(LinearRing(points_m + [points_m[0]]))

    if polygon_m is None or polygon_m.empty or polygon_m.geom_type != 'Polygon':
        raise GnssLogError('The track does not enclose an area.')
    if not polygon_m.valid:
        raise GnssLogError(
            f'The boundary from this log crosses itself ({polygon_m.valid_reason}); '
            'walk the edge in one direction without doubling back.'
        )

    ring_wgs84 = [inverse(x, y) for x, y in polygon_m.coords[0]]
    ring_wgs84[-1] = ring_wgs84[0]
    polygon = Polygon([(round(lng, 8), round(lat, 8)) for lng, lat in ring_wgs84], srid=4326)
    try:
        area_ha = validate_farm_polygon(polygon)
    except GnssValidationError as exc:
        raise GnssLogError(str(exc)) from None

    if any(fix.accuracy_basis == 'none' for fix in used):
        warnings.append('accuracy_missing_for_some_fixes')
    bases = {fix.accuracy_basis for fix in used if fix.accuracy_basis != 'none'}
    if not bases:
        accuracy_basis = 'none'
    elif len(bases) == 1:
        accuracy_basis = bases.pop()
    else:
        accuracy_basis = 'mixed'
    if any(fix.time is None for fix in used):
        warnings.append('timestamps_missing')

    quality_counts = {}
    for fix in used:
        quality_counts[fix.quality] = quality_counts.get(fix.quality, 0) + 1
    hdops = [fix.hdop for fix in used if fix.hdop is not None]
    satellites = [fix.satellites for fix in used if fix.satellites is not None]
    times = [fix.time for fix in used if fix.time is not None]

    evidence = {
        'parser_version': PARSER_VERSION,
        'source': f'receiver_{fmt}',
        'format': fmt,
        'method': method,
        'filename': (filename or '')[:120],
        'log_sha256': hashlib.sha256(raw).hexdigest(),
        'log_bytes': len(raw),
        'log_lines': log.lines,
        'fixes_total': log.fixes_total,
        'fixes_used': len(used),
        'rejected': dict(sorted(log.rejected.items())),
        'fix_quality': dict(sorted(quality_counts.items())),
        'constellations_used': sorted(log.constellations_used),
        'constellations_in_view': sorted(log.constellations_in_view),
        'accuracy_basis': accuracy_basis,
        'accuracy_p50_m': _round(statistics.median(accuracies)) if accuracies else None,
        'accuracy_p95_m': _round(_percentile(accuracies, 95)) if accuracies else None,
        'hdop_median': _round(statistics.median(hdops)) if hdops else None,
        'satellites_median': statistics.median(satellites) if satellites else None,
        'started_at': min(times).isoformat() if times else None,
        'ended_at': max(times).isoformat() if times else None,
        'duration_s': round((max(times) - min(times)).total_seconds(), 1) if times else None,
        'track_length_m': _round(_track_length_m(points_m), 1) if method == 'walked_perimeter' else None,
        'closure_gap_m': _round(closure_gap, 1) if method == 'walked_perimeter' else None,
        'simplify_tolerance_m': _round(tolerance),
        'vertices': polygon.num_coords - 1,
        'area_ha': _round(area_ha, 4),
        'perimeter_m': _round(_ring_perimeter_m(polygon_m), 1),
        'quality_gate': {
            'min_satellites': MIN_SATELLITES,
            'max_hdop': MAX_HDOP,
            'max_fix_accuracy_m': MAX_FIX_ACCURACY_M,
            'max_closure_gap_m': MAX_CLOSURE_GAP_M,
        },
        'warnings': warnings,
    }
    return polygon, evidence


def captured_at_from_evidence(evidence):
    started = evidence.get('started_at')
    return dt.datetime.fromisoformat(started) if started else None


def accuracy_from_evidence(evidence):
    """The farm-level accuracy: the 95th percentile of the fixes that were used."""
    return evidence.get('accuracy_p95_m')
