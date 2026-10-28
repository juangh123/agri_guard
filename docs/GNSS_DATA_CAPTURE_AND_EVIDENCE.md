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
- Farmer self-registration has two capture modes (see 2.2): **Walk the boundary** (default), which builds the polygon from corners the farmer marks on site, and **Quick point**, a labelled single-fix fallback. Both send the horizontal accuracy (metres) and capture timestamp as `gnss_accuracy_m` / `gnss_captured_at`.
- The Live Map shows a **GNSS boundary evidence** card for the highlighted farm: area (ha), vertex count, horizontal accuracy, capture date, datum (WGS84 / EPSG:4326), centroid, and receiver.

Reference: `core/models.py`, `core/views.py`, `core/tasks.py`, `core/gnss_validation.py`, `frontend/src/components/MapView.jsx`, `frontend/src/components/BoundaryCapture.jsx`, `frontend/src/utils/gnssBoundary.js`, `frontend/src/pages/Register.jsx`.

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
| Rate | `REGISTER_THROTTLE_RATE` (default 30/hour per client) on the public registration endpoint |

**What this does and does not prove.** The accuracy is what the browser and operating system report for their location estimate. A web page cannot see which constellations were tracked, the DOP, whether corrections were applied, or whether the position blends Wi-Fi or cell positioning with GNSS. The server therefore stores accuracy as self-reported metadata. Averaging a few seconds of fixes reduces noise but does not earn a claim of better accuracy than the best individual fix, and the app does not claim one. Phone-grade, single-frequency positioning is typically a few metres in open sky and degrades under canopy or near buildings. Authenticating the position itself (for example Galileo OSNMA) and surveying with an external receiver are on the roadmap below.

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
- Accept boundaries surveyed with an external receiver (NMEA / RINEX traces, or a Bluetooth GNSS receiver) instead of the phone's own location service, and record its fix type (single, SBAS, RTK).
- Ingest NMEA/RINEX traces or mobile GNSS fixes and auto-populate the GNSS metadata fields.
- Include the GNSS fields in the reference escrow contract's policy metadata, not only the evidence hash.
- Add a tamper-evident upload route for raw traces and boundary snapshots.

---

*Prepared for the GNSS 4 for Space Applications in Africa (G4-SAA) hackathon.*
