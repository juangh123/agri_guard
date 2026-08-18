# AgriGuard Hackathon Resources & Living Atlas Cross-Verification Matrix

This matrix demonstrates AgriGuard's deep alignment with the **SATNAV Africa Joint Programme Hackathon** official datasets, ArcGIS Living Atlas layers, Africa GeoPortal capabilities, and Pan-African Startup Case Studies.

---

## 🛰️ 1. Official Dataset Cross-Verification Matrix

| Category | Hackathon Official Resource | Project Implementation & Technical Integration | Value Proposition & Impact |
|:---|:---|:---|:---|
| **Satellite Imagery** | **The Africa GeoPortal**<br/>`https://www.africageoportal.com/` | Integrated into `frontend/src/utils/mapStyles.js` as the default satellite base layer (`SATELLITE_MAP_STYLE`). | Provides high-resolution African agricultural coverage without proprietary token dependencies. |
| **Fire & Thermal** | **VIIRS Thermal Hotspots & Fire Activity**<br/>`https://arcg.is/miur8` | **Live deployed** in `frontend/src/utils/arcGisLayers.js` + `MapView.jsx` as a current-map-extent FeatureServer query. Also used by `ParametricClaimEngine` for geofence intersection. | Instant wildfire detection (confidence > 80%) triggers automated USDC micro-payouts in <3 minutes. |
| **Hydrology / Flood** | **GEOGLOWS 2.0 ECMWF Streamflow (10-Day Forecast)**<br/>`https://arcg.is/1nH0yj` | **Live deployed** in `MapView.jsx` as an official forecast polyline layer, querying the current map extent. | Predictive flood parametric claims trigger before catastrophic crop root rot sets in. |
| **Extreme Climate** | **Global Yearly Temperature Anomaly**<br/>`https://arcg.is/1jvfqS0` | Modeled in `core/engine.py` (`DROUGHT` trigger: NDWI deficit + temperature anomalies). | Heat-wave & persistent drought triggers index insurance compensation for smallholders. |
| **Hydrology / Gauges** | **Live Stream Gauges**<br/>`https://arcg.is/15zKr1` | **Live deployed** in `MapView.jsx` as an official FeatureServer point layer, with status/flow-based symbology. | Ground-truths flood model alerts with real gauge readings where station coverage exists. |
| **Community GIS** | **OpenStreetMap Layers for Africa**<br/>`https://livingatlas.arcgis.com/...` | Integrated into frontend map view switcher (`OPEN_MAP_STYLE`) for vector boundaries. | Precise administrative boundaries and rural road network contextualization. |
| **Disaster Response** | **FAO Data in Emergencies (DIEM-EVE)**<br/>`https://data-in-emergencies.fao.org/` | Aligned with UN SDG 2 (Zero Hunger) & SDG 13 (Climate Action) damage assessment thresholds. | Standardizes damage estimation metrics with international humanitarian aid agencies. |
| **Economic Market** | **World Bank Real-Time Commodity Prices**<br/>`https://data.humdata.org/...` | Calibrates average policy payout ($25 - $150 USDC) based on East African maize/coffee price indexes. | Ensures dynamic payouts match actual seasonal replacement seed and fertilizer costs. |

---

## ✅ 1.1 Verified Official Service Endpoints (Deployed)

| Layer | Official Short Link | ArcGIS Item / Service Endpoint | Geometry | Frontend Toggle |
|:---|:---|:---|:---|:---|
| Satellite (VIIRS) Thermal Hotspots and Fire Activity | `https://arcg.is/miur8` | `https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer` | Point | On by default |
| GEOGLOWS 2.0 ECMWF Streamflow | `https://arcg.is/1nH0yj` | `https://livefeeds3.arcgis.com/arcgis/rest/services/GEOGLOWS/GlobalWaterModel_Medium/MapServer` | Polyline | Off by default |
| Live Stream Gauges | `https://arcg.is/15zKr1` | `https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Live_Stream_Gauges_v1/FeatureServer` | Point | Off by default |

Implementation notes:
- `frontend/src/utils/arcGisLayers.js` stores the exact public FeatureServer query URLs, output fields, ordering, and Legend metadata.
- `MapView.jsx` queries each enabled layer by the current visible bounding box, so users always see real data for the active extent instead of mock markers.
- All endpoints are public, CORS-enabled, and require no API key or Mapbox token.
- GEOGLOWS and VIIRS returned live features during East Africa bbox verification. Live Stream Gauges coverage is dense in the United States and may be sparse in some African extents; the layer remains available for global validation.

---

## 🚀 2. Pan-African Agritech Benchmark & Innovation Matrix

| Benchmark Startup / Case Study | Reference Source | Traditional Limitation | AgriGuard Leapfrog Advantage |
|:---|:---|:---|:---|
| **ACRE Africa / Pula Advisors** | `https://startuplist.africa/` | Uses manual yield audits or picture-based insurance requiring 4-8 weeks processing. | **Zero-Touch Parametric**: Galileo GNSS + NASA/ArcGIS EO triggers automated smart contract settlement in **< 3 minutes**. |
| **Apollo Agriculture** | `https://startuplist.africa/` | Bundles micro-credit with weather index but lacks on-chain transparency. | **Web3 Transparency + SMS**: Tamper-proof evidence hash stored on blockchain; low-bandwidth SMS alert to non-smartphones. |
| **Above Health (Pitch Case)** | `https://www.thepitch.show/175` | Focuses on proactive predictive environmental triggers in health. | Transferred proactive prediction model to **agriculture risk reduction and instant micro-liquidity**. |
