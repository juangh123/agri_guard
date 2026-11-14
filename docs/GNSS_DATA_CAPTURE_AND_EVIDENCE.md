# AgriGuard — GNSS Data Capture and Evidence

AgriGuard is designed around GNSS/WGS84 geo-fencing. This page describes how GNSS data enters the system and how it is protected for downstream insurance decisions.

## 1. Intended Field Capture Flow

1. A farmer, extension officer, or field device walks or rides the plot boundary while collecting GNSS positions. Galileo-capable receivers are supported at the data level because the workflow is standard WGS84.
2. The client converts the ordered positions into a WGS84 polygon (`SRID 4326`).
3. The polygon is submitted with metadata:
   - Capture timestamp.
   - Estimated horizontal accuracy in metres.
   - Device or receiver identifier.
   - Constraint reference frame (WGS84).
4. The backend stores the polygon in `Farm.geofence` using GeoDjango `PolygonField`.

## 2. Current MVP Implementation

- `Farm.geofence` is a GeoDjango `PolygonField(srid=4326)`.
- `Farm.gnss_device_id`, `Farm.gnss_accuracy_m`, and `Farm.gnss_captured_at` capture optional GNSS source metadata.
- Registration and farm create/update validate the boundary and GNSS metadata with `core/gnss_validation.py` before saving (see 2.2).
- The claim evidence hash includes the farm ID, event ID, event timestamp, confidence score, and GNSS metadata.
- `Claim.evidence_hash` is stored as SHA-256 and can be published on-chain for auditability. `core.tasks.compute_evidence_hash` is the single implementation used by both the live pipeline and the demo seed, so any hash can be recomputed from the published fields.
- Farmer self-registration has three capture modes: **Walk the boundary** (default, see 2.2), which builds the polygon from corners the farmer marks on site with the phone; **Receiver file** (see 2.3), which uploads the raw NMEA or GPX log of a GNSS receiver and lets the server build the polygon and compute the accuracy; and **Quick point**, a labelled single-fix fallback.
- `Farm.gnss_source` records which path produced the boundary (`browser_walk`, `browser_quick`, `browser`, `receiver_nmea`, `receiver_gpx`, `demo_sim`), and `Farm.gnss_evidence` holds the server's summary of the receiver log. The log itself is kept in `GnssCaptureLog` with its SHA-256.
- Every farm has a public **GNSS evidence report** (see 2.4) at `/api/farms/<id>/gnss-evidence/` (JSON) and `/api/farms/<id>/gnss-evidence/html/` (printable page), linked from the map card.
- The Live Map shows a **GNSS boundary evidence** card for the highlighted farm: area (ha), vertex count, horizontal accuracy, capture date, datum (WGS84 / EPSG:4326), centroid, and receiver.

Reference: `core/models.py`, `core/views.py`, `core/tasks.py`, `core/gnss_validation.py`, `core/gnss_logs.py`, `core/gnss_evidence.py`, `frontend/src/components/MapView.jsx`, `frontend/src/components/BoundaryCapture.jsx`, `frontend/src/components/ReceiverLogImport.jsx`, `frontend/src/utils/gnssBoundary.js`, `frontend/src/pages/Register.jsx`.

## 2.2 Boundary Capture and Validation

**Walk the boundary.** The farmer stands at each corner of the field and taps *Mark corner*. A corner is the inverse-variance weighted mean of the fixes received in the last 5 s that lie within `max(5 m, 2 × accuracy)` of the newest fix, so a corner marked soon after walking from the previous one is not pulled back toward it. The app refuses a corner when the newest fix is coarser than ±30 m or lies within 2 m of the previous corner. Closing the boundary rejects fewer than 3 corners, self-intersecting rings and implausible areas, orders the ring counter-clockwise, and computes area, perimeter and the worst and median corner accuracy. The `gnss_accuracy_m` stored with the farm is the **worst** corner accuracy: the boundary is only as good as its weakest corner. The receiver string records the mode, corner count and median accuracy.

**Quick point.** A single fix and a 50 m placeholder square around it. It exists so registration works without walking the field, and the receiver string says `single fix, 50 m placeholder square` so it is never mistaken for a surveyed boundary.

**Server-side limits** (the browser is never trusted; the same checks run on registration and on authenticated farm create/update):

| Check | Limit |
|:---|:---|
| `gnss_accuracy_m` | finite number, 0 – 1000 m (`NaN` and `inf` are rejected; a `NaN` stored in the database would otherwise break JSON rendering of the public farm list) |
| Geometry | single `Polygon`, valid (no self-intersection), WGS84 longitude/latitude in range |
| Area | 0.01 – 1000 ha, computed on the WGS84 authalic sphere (within 0.6 % of an EPSG:6933 equal-area projection for plots up to 10 km across at latitudes 0–60°) |
| Extent | no more than 0.1° (about 11 km) in either direction |
| Vertices | at most 1000 |
| Text fields | username 150, farm name 255, phone 20, receiver 100, wallet 42 characters |
| Rate | `REGISTER_THROTTLE_RATE` (default 30/hour per client IP) on the public registration endpoint, malformed requests included. Counters are kept in a database table shared by every serverless instance, so the limit holds across the deployment rather than per container (`THROTTLE_CACHE_URL` can point it at Redis instead). If that store is unreachable the endpoint falls back to per-process counters instead of failing |

**What this does and does not prove.** The accuracy is what the browser and operating system report for their location estimate. A web page cannot see which constellations were tracked, the DOP, whether corrections were applied, or whether the position blends Wi-Fi or cell positioning with GNSS. The server therefore stores accuracy as self-reported metadata. Averaging a few seconds of fixes reduces noise but does not earn a claim of better accuracy than the best individual fix, and the app does not claim one. Phone-grade, single-frequency positioning is typically a few metres in open sky and degrades under canopy or near buildings. Authenticating the position itself (for example Galileo OSNMA) is on the roadmap below. For a server-computed accuracy, import a receiver log (2.3).

## 2.3 Receiver Log Import (NMEA 0183 / GPX)

The farmer (or an extension officer) records a log on any GNSS receiver while walking the field edge, or occupies each corner and saves it as a GPX waypoint, then chooses the file on the registration page. The browser uploads the raw text; **the server parses it** (`core/gnss_logs.py`) and builds the boundary, the accuracy and the capture time itself. Any geometry or accuracy the client sends with a log is ignored, and sending both `geometry` and `gnss_log` is rejected.

| Step | What the server does |
|:---|:---|
| Sentences | NMEA `GGA` (position, fix quality, satellites, HDOP), `RMC`/`ZDA` (date), `GST` (receiver error estimate), `GSA`/`GSV` (constellations used / in view). Prefixed lines such as Android GnssLogger's `NMEA,$GPGGA…` are accepted. Every sentence must carry a valid checksum. GPX 1.0/1.1 `trkpt` and `wpt` with `fix`, `sat`, `hdop`, `time`; files with a `DOCTYPE`/`ENTITY` are refused. |
| Quality gate | Fix quality 1–5 (GPS, DGPS/SBAS, PPS, RTK fixed/float). Quality 0 (no fix), 6 (dead reckoning), 7 (manual input) and 8 (simulator) are never accepted. At least 4 satellites, HDOP ≤ 5, per-fix 95 % accuracy ≤ 30 m (the same limit as a phone corner). Every rejection is counted by reason. |
| Accuracy | A horizontal 95 % radius, the same convention as the browser Geolocation API. With `GST`: `2 × √(σlat² + σlon²)` from the receiver. Without it: `2 × HDOP × UERE`, with UERE 4 m (autonomous), 1 m (SBAS/DGPS), 0.3 m (RTK float), 0.02 m (RTK fixed); the evidence records which method was used. The farm's `gnss_accuracy_m` is the **95th percentile** over the fixes used. |
| Walked perimeter | Fixes in time order, projected to local metres, Douglas–Peucker simplified as a track (tolerance = median accuracy, 0.5–5 m; raised step by step up to 10 m only if the ring would otherwise cross itself), then closed. The walk must end within 50 m of its start (warning above 15 m). |
| Surveyed corners | Three or more GPX waypoints are used as corners in file order, and every one must pass the quality gate. |
| Limits | 1.5 MB and 20 000 epochs per log; the resulting polygon passes the same checks as every other boundary (2.2). |

The exact log text is stored (`GnssCaptureLog`) with its SHA-256; only the farm owner can download it (`/api/farms/<id>/gnss-log/`) because a timestamped track shows when someone was on the plot. The preview the farmer sees before signing up comes from `POST /api/gnss/parse-log/`, which stores nothing and is rate-limited (`GNSS_PARSE_THROTTLE_RATE`, default 120/hour per IP).

**What this proves and what it does not.** Every number in the evidence can be reproduced by re-running the parser on the stored log, and the evidence report does exactly that on every request. It does not prove that the log came from a real receiver on that field: a log can be written by hand. Galileo OSNMA authentication (roadmap) is what closes that gap.

**Sample logs.** `frontend/public/samples/SYNTHETIC_mwangi_walk.nmea` and `SYNTHETIC_mwangi_corners.gpx` are **generated** by `scripts/make_sample_gnss_logs.py`, not recorded in the field. They follow the Mwangi Farm demo plot and carry known defects (3 no-fix epochs, 2 high-HDOP epochs, 1 corrupted checksum) that the parser rejects. The registration page offers the NMEA sample as "Try a synthetic sample log" and marks the result as synthetic. Parsed, the walk recovers the plot's area to within 0.1 % (2.844 vs 2.847 ha) with a 95 % accuracy of 1.99 m; the GPX corners give 2.831 ha.

## 2.4 GNSS Evidence Report

`/api/farms/<id>/gnss-evidence/` (JSON) and `/api/farms/<id>/gnss-evidence/html/` (printable; *Print / save as PDF*) answer the questions an insurer or auditor asks about an insured area. The report is public like the map and never contains the owner, phone number or wallet.

- **Boundary**: GeoJSON, datum, vertices, area, perimeter, centroid, bounding box, and an outline drawing with a scale bar.
- **Capture**: source, device or file, capture time, 95 % accuracy and its basis: *computed by the server from the stored receiver log*, *reported by the browser/client (not verifiable)*, *labelled demo simulation* or *not recorded*. For receiver logs: the log SHA-256, fixes used/total, rejections by reason, fix-quality mix, constellations, accuracy p50/p95, median HDOP and satellites, walk duration and closure gap.
- **Uncertainty grade**: band = perimeter × accuracy (the whole edge shifted by its accuracy), as a share of the area. ≤ 1 % survey grade, ≤ 5 % claim grade, ≤ 15 % indicative, above that insufficient. These are AgriGuard policy thresholds, not an external standard; payouts scale with insured area, so the band is the share of a payout the measurement itself could move. The method is conservative: random per-fix errors partly cancel along an edge. A grade based on an accuracy the server did not compute is flagged as such.
- **Checks**: boundary valid; accuracy recorded and within the 30 m gate; accuracy server-computed; for receiver logs, `log_hash_matches` (stored log hashes to the recorded SHA-256) and `log_reproducible` (re-parsing the stored log gives the same polygon and accuracy).
- **Hazards and claims**: every event footprint that intersects the boundary, with the overlap in hectares and as a share of the farm, and the farm's claims with their evidence hashes.
- **Integrity**: `report_sha256` is the SHA-256 of the canonical JSON (sorted keys, no whitespace) without `generated_at` and `report_sha256`, so the same farm state always produces the same hash.

## 2.1 Public Demo Farms (labeled simulation)

The three seeded farms are smallholder-sized plots whose boundaries follow real field edges visible in Esri World Imagery, so the polygons line up with the satellite basemap at field scale:

| Farm | Crop | Locality | Area | Vertices | Simulated accuracy |
|:---|:---|:---|---:|---:|---:|
| Mwangi Farm | Maize | Kitale, Trans Nzoia County | 2.85 ha | 4 | ±1.8 m |
| Achieng Farm | Wheat | Njoro, Nakuru County | 1.73 ha | 4 | ±2.1 m |
| Nafula Farm | Livestock | Uasin Gishu County | 1.23 ha | 6 | ±2.4 m |

The GNSS capture metadata on these farms is **simulated**: the receiver id starts with `demo-sim`, and the dashboard shows a *Demo record* badge. No field survey is claimed. Every seeded claim is reproducible by the rule engine (`core/tests.py::SeedDemoDataContentTests`): the farm intersects the event footprint, the engine triggers on the stored metrics, and the stored payout and evidence hash equal the engine's output.

## 3. Accuracy and Anti-Fraud Controls

- Polygon intersection is performed by PostGIS `ST_Intersects` against the disaster area.
- Payout area is capped to a realistic insured smallholder area, preventing oversized polygons from inflating claims.
- Confidence thresholds gate automatic approval.
- The evidence hash links the GNSS-defined farm to the specific event and analysis result.

## 4. Production Roadmap

- Enforce a per-policy minimum horizontal accuracy using the stored `gnss_accuracy_m`, and record whether SBAS (EGNOS / African SBAS) or Galileo HAS corrections were applied.
- Record the Galileo OSNMA authentication status of each fix and include it in the evidence hash to flag spoofed captures.
- ~~Accept boundaries surveyed with an external receiver and record its fix type~~ — done for NMEA 0183 and GPX (2.3). Next: RINEX observation files with post-processing (PPP) and a live Bluetooth receiver connection from the phone.
- Include the GNSS fields in the reference escrow contract's policy metadata, not only the evidence hash.
- ~~Add a tamper-evident upload route for raw traces~~ — receiver logs are stored with their SHA-256 and re-verified by the evidence report (2.4). Next: include the log hash in the claim evidence hash and the on-chain policy metadata.

---

*Prepared for the GNSS 4 for Space Applications in Africa (G4-SAA) hackathon.*
