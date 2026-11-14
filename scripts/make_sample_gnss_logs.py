"""Write the SYNTHETIC sample receiver logs used by the demo and the tests.

These files are generated, not recorded in the field. They exist so judges and
reviewers can try "Import receiver log" without owning a GNSS receiver, and so
the parser has a realistic fixture. Every file name starts with ``SYNTHETIC_``.

The walk follows the Mwangi Farm demo plot (Kitale, Kenya; a field edge traced on
Esri World Imagery, see core/management/commands/seed_demo_data.py) at walking
pace, 1 Hz, with SBAS-grade noise and a few realistic defects the parser must
reject: no-fix epochs under a tree line, two high-HDOP epochs and one sentence
with a corrupted checksum.

    python scripts/make_sample_gnss_logs.py
"""
import datetime as dt
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / 'frontend' / 'public' / 'samples'

CORNERS = [  # (lon, lat), Mwangi Farm demo plot
    (34.966371, 1.058661), (34.967465, 1.058704),
    (34.967508, 1.056623), (34.966414, 1.056537),
]
START = dt.datetime(2026, 11, 12, 6, 40, 0, tzinfo=dt.timezone.utc)
WALK_SPEED_MPS = 1.25
EARTH_R = 6371007.2


def checksum(body):
    value = 0
    for char in body:
        value ^= ord(char)
    return f'{value:02X}'


def sentence(body):
    return f'${body}*{checksum(body)}'


def nmea_lat(lat):
    hemi = 'N' if lat >= 0 else 'S'
    lat = abs(lat)
    deg = int(lat)
    return f'{deg:02d}{(lat - deg) * 60:010.7f}', hemi


def nmea_lon(lon):
    hemi = 'E' if lon >= 0 else 'W'
    lon = abs(lon)
    deg = int(lon)
    return f'{deg:03d}{(lon - deg) * 60:010.7f}', hemi


def walk_points():
    """Positions along the closed boundary at 1 s spacing, ending ~2 m short."""
    lat0 = sum(c[1] for c in CORNERS) / len(CORNERS)
    kx = math.radians(1) * EARTH_R * math.cos(math.radians(lat0))
    ky = math.radians(1) * EARTH_R
    ring = CORNERS + [CORNERS[0]]
    points = []
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        dx, dy = (x2 - x1) * kx, (y2 - y1) * ky
        steps = max(1, int(math.hypot(dx, dy) / WALK_SPEED_MPS))
        for i in range(steps):
            f = i / steps
            points.append((x1 + (x2 - x1) * f, y1 + (y2 - y1) * f))
    return points[:-2]


def make_nmea(rng):
    lines = []
    lat0 = sum(c[1] for c in CORNERS) / len(CORNERS)
    kx = math.radians(1) * EARTH_R * math.cos(math.radians(lat0))
    ky = math.radians(1) * EARTH_R
    points = walk_points()
    canopy = set(range(150, 153))       # no fix under a tree line
    multipath = {240, 241}              # HDOP spike
    corrupt = 320                       # one corrupted GGA checksum
    for i, (lon, lat) in enumerate(points):
        t = START + dt.timedelta(seconds=i)
        hhmmss = t.strftime('%H%M%S') + '.00'
        ddmmyy = t.strftime('%d%m%y')
        sd_lat = rng.uniform(0.45, 0.75)
        sd_lon = rng.uniform(0.45, 0.75)
        noisy_lat = lat + rng.gauss(0, sd_lat) / ky
        noisy_lon = lon + rng.gauss(0, sd_lon) / kx
        quality = 2 if i % 37 else 1
        sats = rng.randint(14, 19)
        hdop = round(rng.uniform(0.7, 1.1), 2)
        if i in canopy:
            quality, sats, hdop = 0, 3, 99.9
        if i in multipath:
            hdop = 6.4
        la, lah = nmea_lat(noisy_lat)
        lo, loh = nmea_lon(noisy_lon)
        gga = sentence(f'GNGGA,{hhmmss},{la},{lah},{lo},{loh},{quality},{sats:02d},{hdop:.2f},1902.4,M,-14.8,M,,')
        if i == corrupt:
            gga = gga[:-2] + ('00' if gga[-2:] != '00' else '11')
        rmc_status = 'A' if quality else 'V'
        lines.append(sentence(f'GNRMC,{hhmmss},{rmc_status},{la},{lah},{lo},{loh},0.{rng.randint(10, 99)},,{ddmmyy},,,D,V'))
        lines.append(gga)
        if quality:
            lines.append(sentence(
                f'GNGST,{hhmmss},{math.hypot(sd_lat, sd_lon):.2f},{sd_lat * 1.2:.2f},{sd_lon * 0.9:.2f},12.0,'
                f'{sd_lat:.2f},{sd_lon:.2f},{rng.uniform(0.9, 1.6):.2f}'
            ))
        if i % 5 == 0:
            lines.append(sentence('GNGSA,A,3,02,05,12,15,18,24,25,29,,,,,1.42,0.86,1.13,1'))
            lines.append(sentence('GNGSA,A,3,04,09,11,19,36,,,,,,,,1.42,0.86,1.13,3'))
            lines.append(sentence('GNGSA,A,3,07,10,23,32,,,,,,,,,1.42,0.86,1.13,4'))
            lines.append(sentence('GPGSV,1,1,04,02,64,031,44,05,41,288,40,12,22,115,38,15,57,190,45,1'))
            lines.append(sentence('GAGSV,1,1,04,04,58,320,43,09,35,060,41,11,18,211,36,19,49,145,42,7'))
            lines.append(sentence('GBGSV,1,1,04,07,62,005,41,10,30,250,39,23,44,130,40,32,27,075,37,1'))
    return '\r\n'.join(lines) + '\r\n'


def make_gpx(rng):
    lat0 = sum(c[1] for c in CORNERS) / len(CORNERS)
    kx = math.radians(1) * EARTH_R * math.cos(math.radians(lat0))
    ky = math.radians(1) * EARTH_R
    wpts = []
    for n, (lon, lat) in enumerate(CORNERS, start=1):
        t = START + dt.timedelta(minutes=2 * n)
        # A 60 s static occupation per corner: averaged, so ~0.3 m error.
        lat_n = lat + rng.gauss(0, 0.3) / ky
        lon_n = lon + rng.gauss(0, 0.3) / kx
        wpts.append(
            f'  <wpt lat="{lat_n:.8f}" lon="{lon_n:.8f}">\n'
            f'    <ele>1902.{n}</ele>\n'
            f'    <time>{t.strftime("%Y-%m-%dT%H:%M:%SZ")}</time>\n'
            f'    <name>Corner {n}</name>\n'
            f'    <fix>dgps</fix>\n'
            f'    <sat>{rng.randint(15, 19)}</sat>\n'
            f'    <hdop>{rng.uniform(0.6, 0.9):.2f}</hdop>\n'
            f'  </wpt>\n'
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<gpx version="1.1" creator="AgriGuard sample generator (SYNTHETIC, not a field survey)"\n'
        '     xmlns="http://www.topografix.com/GPX/1/1">\n'
        '  <metadata><name>SYNTHETIC corner survey - Mwangi Farm demo plot</name>'
        '<desc>Generated by scripts/make_sample_gnss_logs.py for demos and tests.</desc></metadata>\n'
        + ''.join(wpts)
        + '</gpx>\n'
    )


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rng = random.Random(20261112)
    (OUT_DIR / 'SYNTHETIC_mwangi_walk.nmea').write_text(make_nmea(rng), newline='')
    (OUT_DIR / 'SYNTHETIC_mwangi_corners.gpx').write_text(make_gpx(rng), newline='\n')
    for path in sorted(OUT_DIR.iterdir()):
        print(f'{path.relative_to(ROOT)}  {path.stat().st_size} bytes')


if __name__ == '__main__':
    main()
