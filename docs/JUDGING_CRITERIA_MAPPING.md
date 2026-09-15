# AgriGuard — G4-SAA Judging Criteria Mapping

This page maps AgriGuard to the official judging criteria for **GNSS 4 for Space Applications in Africa (G4-SAA)**, under **Challenge II - Synergizing Agriculture and Geomatics**. Each criterion is scored out of ten; this document makes the evidence easy for judges to locate.

## 1. Originality

AgriGuard is not another weather dashboard or crop-monitoring tool. It closes the loop from space observation to automated financial resilience:

- GNSS geo-fenced farm boundaries replace manual field surveys and subjective claims.
- A PostGIS `ST_Intersects` trigger removes human loss adjusters from the payout decision.
- The same pipeline produces an early warning, an evidence hash, an AI damage report, and an auditable settlement record.

Reference: `docs/SUBMISSION_FULL.md`, `core/engine.py`, `core/tasks.py`, `contracts/AgriGuardParametric.sol`.

## 2. Sustainability

- **Environmental:** Parametric insurance reduces repeated field inspections, lowering transport and carbon costs associated with claims.
- **Financial:** The B2B2C SaaS model creates recurring per-policy revenue and per-payout transaction fees.
- **Long-term operating model:** Year-1 pilot, Year-2 scale, Year-3 expansion across Kenya, Nigeria, East and West Africa.
- **Operational continuity:** Open data from Esri Living Atlas, Africa GeoPortal, VIIRS, GEOGLOWS, and mock-safe fallback paths keep the demo runnable without paid keys.

Reference: `docs/IMPACT_AND_MARKET.md`, `docs/CLOUD_DEPLOYMENT_GUIDE.md`, `README.md`.

## 3. Significance

The official G4-SAA theme is mitigating disaster risk through space technologies that exploit GNSS. AgriGuard directly addresses that theme:

- Early warning for floods, droughts, wildfires, and heatwaves on GNSS/WGS84 farm boundaries.
- Instant liquidity reduces post-disaster bankruptcy and food-supply disruption.
- GNSS + Earth Observation + Web3 gives insurers a measurable way to serve smallholders.

Reference: official challenge page and `docs/SUBMISSION_FULL.md`.

## 4. Applicability and Transferability

The same architecture can be reused across hazards and regions:

- Flood, wildfire, drought, and heatwave already share one trigger engine.
- Farm polygons can be replaced by protected sites, water bodies, infrastructure, or community assets for environmental monitoring.
- SMS and planned USSD channels make the output transferable to feature-phone users beyond agriculture.
- PostGIS, Django, MapLibre, and standard ERC-20 payouts use portable, widely available components.

Reference: `docs/ARCHITECTURE.md`, `docs/TECH_STACK.md`, `frontend/src/utils/arcGisLayers.js`.

## 5. Market Potential

- TAM: 485 million smallholder livelihoods exposed to climate losses.
- SAM: 120 million farms across Sub-Saharan Africa and Southeast Asia.
- SOM: 120,000 farmers in Year 3.
- Projected base ARR: `~$3M`, plus platform licensing and payout transaction upside.
- Satellite downstream-service adoption is a core mechanism: each claim consumes GNSS/EO data and drives demand for spatial services.

Reference: `docs/IMPACT_AND_MARKET.md`.

## 6. Impact

- Claim settlement target: from 4-12 weeks to minutes once verified data feeds and settlement credentials are live.
- Verification-cost target: materially below the $50-$200 manual field-visit benchmark for routine evaluations.
- Fraud mitigation target: stronger through GNSS boundary metadata and deterministic SHA-256 evidence hashes.
- SDG alignment: SDG 1, SDG 2, SDG 9, and SDG 13.

Reference: `docs/IMPACT_AND_MARKET.md`, `docs/SUBMISSION_FULL.md`.

---

## Evidence Boundary

- **Implemented now:** GNSS/WGS84 polygons, optional capture metadata, PostGIS intersections, crop-specific threshold evaluation, EONET event ingestion, live Esri map layers, REST/WebSocket workflow, AI/SMS fallbacks, and a gated ERC-20 settlement code path.
- **Demo-only:** Deterministic threshold metrics used by the live walkthrough.
- **Roadmap:** Direct threshold ingestion from GEOGLOWS/VIIRS, raw NMEA/RINEX capture, USSD, and deployment of the reference Solidity escrow contract.

*Prepared for the GNSS 4 for Space Applications in Africa (G4-SAA) hackathon.*
