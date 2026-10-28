"""Server-side validation for farm boundaries and GNSS metadata.

The browser captures a boundary (single fix or a walked track) and sends it to
the API, but nothing the client sends can be trusted. These checks keep one
careless or malicious request from poisoning the public demo:

* ``NaN`` / ``inf`` accuracy values pass a plain ``>= 0`` test and later make
  JSON rendering of the public farm list raise, which takes the whole list down.
* An unbounded polygon (a whole country, or a point-sized speck) would hit every
  disaster event in the hazard engine or never hit any.

Limits are deliberately generous for real smallholder and commercial fields and
only exclude values that cannot be a single farm plot.
"""
import math

# Phone-grade GNSS is typically 3-30 m; network/IP fixes can be several km. Beyond
# 1 km the value says nothing about the boundary, so it is rejected as malformed.
MAX_GNSS_ACCURACY_M = 1000.0

MIN_FARM_AREA_HA = 0.01        # 100 m2: a kitchen garden
MAX_FARM_AREA_HA = 1000.0      # 10 km2: a large commercial holding
MAX_BOUNDARY_VERTICES = 1000   # counts the closing vertex
MAX_EXTENT_DEG = 0.1           # ~11 km: no single plot is longer than this

# WGS84 authalic (equal-area) sphere radius, metres.
EARTH_AUTHALIC_RADIUS_M = 6371007.2


class GnssValidationError(ValueError):
    """Raised with a client-safe message when GNSS input is unacceptable."""


def validate_gnss_accuracy(value):
    """Return the accuracy as a finite float in metres, or ``None`` if absent."""
    if value is None or value == '':
        return None
    if isinstance(value, bool):
        raise GnssValidationError('gnss_accuracy_m must be a number.')
    try:
        accuracy = float(value)
    except (TypeError, ValueError):
        raise GnssValidationError('gnss_accuracy_m must be a number.') from None
    if not math.isfinite(accuracy):
        raise GnssValidationError('gnss_accuracy_m must be a finite number.')
    if accuracy < 0:
        raise GnssValidationError('gnss_accuracy_m must be greater than or equal to 0.')
    if accuracy > MAX_GNSS_ACCURACY_M:
        raise GnssValidationError(
            f'gnss_accuracy_m must not exceed {MAX_GNSS_ACCURACY_M:.0f} m; '
            'a fix that coarse cannot describe a field boundary.'
        )
    return accuracy


def _ring_signed_area_m2(ring):
    """Signed spherical area of a lng/lat ring, positive for counter-clockwise.

    Chamberlain & Duquette's formula on the authalic sphere. Longitude steps are
    not wrapped on purpose: the polygon is stored as planar geometry, so a ring
    that spans the antimeridian is huge as far as PostGIS is concerned and must
    be judged that way (``MAX_EXTENT_DEG`` rejects it before this is called).
    """
    total = 0.0
    for start, end in zip(ring[:-1], ring[1:]):
        # Index instead of unpacking: coordinates may carry a Z value.
        total += math.radians(end[0] - start[0]) * (
            2.0 + math.sin(math.radians(start[1])) + math.sin(math.radians(end[1]))
        )
    return total * EARTH_AUTHALIC_RADIUS_M ** 2 / 2.0


def polygon_area_ha(polygon):
    """Area in hectares of a WGS84 GEOS polygon (holes subtracted)."""
    rings = polygon.coords
    area_m2 = abs(_ring_signed_area_m2(rings[0]))
    for hole in rings[1:]:
        area_m2 -= abs(_ring_signed_area_m2(hole))
    return area_m2 / 10_000.0


def validate_farm_polygon(polygon):
    """Validate a WGS84 GEOS geometry as a single farm plot; return area in ha."""
    if polygon.geom_type != 'Polygon':
        raise GnssValidationError('The supplied farm geometry must be a Polygon.')

    rings = polygon.coords
    for ring in rings:
        for lng, lat in ((point[0], point[1]) for point in ring):
            if not (math.isfinite(lng) and math.isfinite(lat)):
                raise GnssValidationError('Boundary coordinates must be finite numbers.')
            if not (-180.0 <= lng <= 180.0 and -90.0 <= lat <= 90.0):
                raise GnssValidationError(
                    'Boundary coordinates must be WGS84 longitude [-180, 180] and latitude [-90, 90].'
                )

    if polygon.num_coords > MAX_BOUNDARY_VERTICES:
        raise GnssValidationError(
            f'The boundary has {polygon.num_coords} vertices; at most {MAX_BOUNDARY_VERTICES} are allowed.'
        )

    if not polygon.valid:
        raise GnssValidationError(f'The supplied farm geometry is invalid: {polygon.valid_reason}.')

    min_lng, min_lat, max_lng, max_lat = polygon.extent
    if (max_lng - min_lng) > MAX_EXTENT_DEG or (max_lat - min_lat) > MAX_EXTENT_DEG:
        raise GnssValidationError(
            f'The boundary spans more than {MAX_EXTENT_DEG} degrees (about 11 km); '
            'a farm plot must be smaller than that.'
        )

    area_ha = polygon_area_ha(polygon)
    if area_ha < MIN_FARM_AREA_HA:
        raise GnssValidationError(
            f'The boundary encloses {area_ha:.4f} ha; the minimum is {MIN_FARM_AREA_HA} ha.'
        )
    if area_ha > MAX_FARM_AREA_HA:
        raise GnssValidationError(
            f'The boundary encloses {area_ha:.1f} ha; the maximum is {MAX_FARM_AREA_HA:.0f} ha.'
        )
    return area_ha
