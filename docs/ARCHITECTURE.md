# AgriGuard — 02: System Architecture Diagram

> **Mermaid Format** — Render at https://mermaid.live or in any Mermaid-compatible viewer.

---

## Architecture Overview

AgriGuard follows a four-tier architecture: **Data Layer** (Space & IoT) → **Processing Layer** (Django + Celery) → **Application Layer** (Action & Finance) → **Frontend Layer** (React + MapLibre GL). Each component is annotated with actual code-level function and file references.

---

## Full System Architecture (Mermaid)

```mermaid
graph TD
    subgraph Data["🛰️ DATA LAYER — Space & IoT"]
        GNSS["GNSS-captured boundaries<br/>Device / accuracy / timestamp metadata<br/>(PolygonField, SRID 4326)"]
        NASA["NASA EONET API v3<br/>Severe Storms & Wildfires<br/>(6h Celery Beat schedule; Docker stack)"]
        GEOGLOWS["GEOGLOWS<br/>Hydrological Flood Forecast<br/>(Live map layer; engine ingest simulated)"]
        IOT["On-ground IoT Sensors<br/>Soil Moisture / Temperature<br/>(Roadmap validation layer)"]
    end

    subgraph Processing["⚙️ PROCESSING LAYER — AgriGuard Backend (Django + Celery)"]
        SIG["Django post_save Signal<br/>Auto-trigger on DisasterEvent"]
        CELERY["Celery Async Task Queue<br/>process_disaster_event()"]
        GIS["PostGIS Spatial Query<br/>Farm.geofence ST_Intersects<br/>DisasterEvent.affected_area"]
        AI["OpenAI chat model (configurable)<br/>Damage Estimation Report<br/>generate_ai_damage_report()"]
        WEB3["Web3.py ERC-20 settlement<br/>Configured transfer or PENDING<br/>(No fabricated hashes)"]
    end

    subgraph Application["📱 APPLICATION LAYER — Action & Finance"]
        WS["Django Channels WebSocket<br/>Real-time Alert Push<br/>to MapLibre Dashboard"]
        SMS["Twilio SMS (USSD planned)<br/>Low-bandwidth Farmer Alert<br/>send_sms_alert()"]
        ORACLE["Parametric Engine<br/>Crop threshold + confidence rules<br/>process_disaster_event()"]
        SC["Solidity Policy Contract<br/>Reference escrow design<br/>(Not called by current MVP)"]
    end

    subgraph Frontend["🖥️ FRONTEND LAYER — React + MapLibre GL"]
        MAP["MapLibre GL Satellite Basemap<br/>Farm geofence + disaster hotspot overlays"]
        SKETCH["Scenario Demo Trigger<br/>labeled simulated metrics"]
        CHARTS["Recharts Dashboard<br/>Pie: Safe vs Affected Farms<br/>Bar: Disaster Type Distribution"]
        CHAT["AI Chatbot (AgriBot)<br/>OpenAI-powered Farmer Q&A"]
        I18N["i18n: EN / FR / SW / ZH / ES / PT / AR"]
    end

    subgraph Wallets["💰 FINANCIAL ENDPOINTS"]
        FW["Farmer Web3 Wallet<br/>USDC Stablecoin Payout"]
        PHONE["Farmer's Mobile Phone<br/>SMS Notification (USSD planned)"]
    end

    NASA -->|"fetch_nasa_eonet.py<br/>Point → 50km Buffer (Mercator)"| SIG
    GEOGLOWS -.->|Live visualization; engine ingest simulated| SIG
    IOT -.->|Planned| SIG
    SIG -->|"process_disaster_event.delay()"| CELERY
    CELERY --> GIS
    GNSS -->|"Farm.geofence (PolygonField)"| GIS
    GIS -->|"affected_farms QuerySet"| WEB3
    GIS -->|"affected_farms QuerySet"| AI
    GIS -->|"affected_farms QuerySet"| WS
    ORACLE -->|"approved payout amount"| WEB3
    WEB3 -->|"configured ERC-20 transfer"| FW
    SC -.->|"future insurer escrow phase"| ORACLE
    AI -->|"ai_damage_report"| WS
    WS -->|"WebSocket push"| MAP
    SMS -->|"Payout Confirmation"| PHONE
    SKETCH -->|"POST /api/events/simulate/ → process_disaster_event"| SIG
    MAP -->|"3D Farm Cylinders + Disaster Polygons"| SKETCH
    CHAT -->|"POST /api/chat/"| AI
```

---

## Data Flow Summary

| Step | Trigger | Source File | Action |
|:---|:---|:---|:---|
| **Ingest** | Celery Beat (6h, Docker stack) | `fetch_nasa_eonet.py` | Pull NASA EONET → Point → 50km buffer Polygon |
| **Ingest** | Demo Simulator | `Dashboard.jsx` | User toggles disaster simulation for live walkthrough |
| **Auto-trigger** | `post_save` signal | `signals.py` | Any new `DisasterEvent` → `process_disaster_event.delay()` |
| **Spatial query** | Celery worker | `tasks.py` | `Farm.objects.filter(geofence__intersects=area)` |
| **Payout** | Celery worker | `tasks.py` / `blockchain_service.py` | Configured ERC-20 transfer; otherwise record `PENDING` with no fake tx hash |
| **AI report** | Celery worker | `tasks.py` | `generate_ai_damage_report.delay(alert.id)` |
| **WebSocket** | Celery worker | `tasks.py` | `channel_layer.group_send('alerts_group', ...)` |
| **WebSocket fallback** | WebSocket client | `consumers.py` | With an in-memory channel layer, each connection polls the shared database for new `RiskAlert` rows so alerts still reach clients on other server instances |
| **SMS** | Celery worker | `tasks.py` | `send_sms_alert.delay(phone, message)` |

---

## API Access Model

| Surface | Access | Notes |
|:---|:---|:---|
| `GET /api/farms/`, `/api/alerts/`, `/api/claims/`, `/api/events/` | Public read | Lets judges open the live map and claims timeline without credentials |
| `POST /api/events/simulate/` | Authenticated | The frontend performs a silent demo login (`demo` / `demo123`) so the public walkthrough can drive the real pipeline |
| `PATCH` / `PUT` / `DELETE /api/farms/<id>/` | Owner only | Foreign farms return `404`, never a silent mutation |
| `POST /api/farms/<id>/test_sms/`, `test_wallet/` | Owner only | Prevents using the SMS sender as an open relay for arbitrary numbers |
| `GET /api/farms/integration_status/`, `POST /api/chat/` | Authenticated | Contact and payout details are scoped to `request.user` |

`FarmViewSet.get_queryset()` is the single enforcement point: list/retrieve/risk_status keep the public demo working, while every write and per-farm action is filtered to `owner=request.user`.

The live map consumes current Esri layers, while GPS and GNSS evidence remain the spatial anchor for each farm. GEOGLOWS/VIIRS threshold ingestion and the Solidity escrow contract are explicitly separated as roadmap work.

*Part 2 of 5 — AgriGuard Hackathon Submission, July 2026*
