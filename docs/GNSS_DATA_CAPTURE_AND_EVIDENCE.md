# AgriGuard — GNSS Data Capture and Evidence

AgriGuard is designed around **Galileo GNSS** geo-fencing. This page describes how GNSS data enters the system and how it is protected for downstream insurance decisions.

## 1. Intended Field Capture Flow

1. A farmer, extension officer, or field device walks or rides the plot boundary while collecting GNSS positions.
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
- `Claim.evidence_hash` is stored as SHA-256 and can be published on-chain for auditability.

Reference: `core/models.py`, `core/views.py`, `core/tasks.py`.

## 3. Accuracy and Anti-Fraud Controls

- Polygon intersection is performed by PostGIS `ST_Intersects` against the disaster area.
- Payout area is capped to a realistic insured smallholder area, preventing oversized polygons from inflating claims.
- Confidence thresholds gate automatic approval.
- The evidence hash links the GNSS-defined farm to the specific event and analysis result.

## 4. Production Roadmap

- Ingest NMEA/RINEX traces or mobile GNSS fixes and auto-populate the GNSS metadata fields.
- Include the GNSS fields in on-chain policy metadata, not only the evidence hash.
- Add a tamper-evident upload route for raw traces and boundary snapshots.

---

*Prepared for the GNSS 4 for Space Applications in Africa (G4-SAA) hackathon.*
