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
- Registration validates that the supplied geometry is a valid WGS84 polygon before saving.
- The claim evidence hash includes the farm ID, event ID, event timestamp, confidence score, and GNSS metadata.
- `Claim.evidence_hash` is stored as SHA-256 and can be published on-chain for auditability. `core.tasks.compute_evidence_hash` is the single implementation used by both the live pipeline and the demo seed, so any hash can be recomputed from the published fields.
- Farmer self-registration reads the browser Geolocation API with `enableHighAccuracy`, and sends the fix's horizontal accuracy (metres) and capture timestamp as `gnss_accuracy_m` / `gnss_captured_at`.
- The Live Map shows a **GNSS boundary evidence** card for the highlighted farm: area (ha), vertex count, horizontal accuracy, capture date, datum (WGS84 / EPSG:4326), centroid, and receiver.

Reference: `core/models.py`, `core/views.py`, `core/tasks.py`, `frontend/src/components/MapView.jsx`, `frontend/src/pages/Register.jsx`.

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
- Add a "walk the boundary" capture mode that collects a fix per vertex with `watchPosition` and rejects fixes above the accuracy limit.
- Ingest NMEA/RINEX traces or mobile GNSS fixes and auto-populate the GNSS metadata fields.
- Include the GNSS fields in the reference escrow contract's policy metadata, not only the evidence hash.
- Add a tamper-evident upload route for raw traces and boundary snapshots.

---

*Prepared for the GNSS 4 for Space Applications in Africa (G4-SAA) hackathon.*
