# AgriGuard — 02: System Architecture Diagram

> **Mermaid Format** — Render at https://mermaid.live or in any Mermaid-compatible viewer.

---

## Architecture Overview

AgriGuard follows a four-tier architecture: **Data Layer** (Space & IoT) → **Processing Layer** (Django + Celery) → **Application Layer** (Action & Finance) → **Frontend Layer** (React + Mapbox GL). Each component is annotated with actual code-level function and file references.

---

## Full System Architecture (Mermaid)

```mermaid
graph TD
    subgraph Data["🛰️ DATA LAYER — Space & IoT"]
        GNSS["Galileo GNSS<br/>Farm Geo-fencing<br/>(PolygonField, SRID 4326)"]
        NASA["NASA EONET API v3<br/>Severe Storms & Wildfires<br/>(Every 6h via Celery Beat)"]
        GEOGLOWS["GEOGLOWS<br/>Hydrological Flood Forecast<br/>(Planned Integration)"]
        IOT["On-ground IoT Sensors<br/>Soil Moisture / Temperature<br/>(Validation Layer)"]
    end

    subgraph Processing["⚙️ PROCESSING LAYER — AgriGuard Backend (Django + Celery)"]
        SIG["Django post_save Signal<br/>Auto-trigger on DisasterEvent"]
        CELERY["Celery Async Task Queue<br/>process_disaster_event()"]
        GIS["PostGIS Spatial Query<br/>Farm.geofence ST_Intersects<br/>DisasterEvent.affected_area"]
        AI["OpenAI GPT-3.5 Turbo<br/>Damage Estimation Report<br/>generate_ai_damage_report()"]
        WEB3["Web3.py Integration<br/>ETH/USDC Transfer<br/>(Real + Mock Fallback)"]
    end

    subgraph Application["📱 APPLICATION LAYER — Action & Finance"]
        WS["Django Channels WebSocket<br/>Real-time Alert Push<br/>to Mapbox Dashboard"]
        SMS["Twilio SMS (USSD planned)<br/>Low-bandwidth Farmer Alert<br/>send_sms_alert()"]
        ORACLE["Parametric Oracle<br/>Severity >= Threshold → Payout<br/>trigger_analysis() API"]
        SC["Solidity Smart Contract<br/>AgriGuardParametric.sol<br/>createPolicy() / triggerPayout()"]
    end

    subgraph Frontend["🖥️ FRONTEND LAYER — React + Mapbox GL"]
        MAP["Mapbox GL Satellite Basemap<br/>Farm geofence + disaster hotspot overlays"]
        SKETCH["Disaster Simulator Toggle<br/>God Mode demo trigger"]
        CHARTS["Recharts Dashboard<br/>Pie: Safe vs Affected Farms<br/>Bar: Disaster Type Distribution"]
        CHAT["AI Chatbot (AgriBot)<br/>OpenAI-powered Farmer Q&A"]
        I18N["i18n: English / Français / Kiswahili"]
    end

    subgraph Wallets["💰 FINANCIAL ENDPOINTS"]
        FW["Farmer Web3 Wallet<br/>USDC Stablecoin Payout"]
        PHONE["Farmer's Mobile Phone<br/>SMS Notification (USSD planned)"]
    end

    NASA -->|"fetch_nasa_eonet.py<br/>Point → 50km Buffer (Mercator)"| SIG
    GEOGLOWS -.->|Planned| SIG
    IOT -.->|Planned| SIG
    SIG -->|"process_disaster_event.delay()"| CELERY
    CELERY --> GIS
    GNSS -->|"Farm.geofence (PolygonField)"| GIS
    GIS -->|"affected_farms QuerySet"| WEB3
    GIS -->|"affected_farms QuerySet"| AI
    GIS -->|"affected_farms QuerySet"| WS
    WEB3 -->|"ETH tx_hash"| ORACLE
    ORACLE -->|"triggerPayout(policyId, disasterType)"| SC
    SC -->|"USDC Transfer"| FW
    AI -->|"ai_damage_report"| WS
    WS -->|"WebSocket push"| MAP
    SMS -->|"Payout Confirmation"| PHONE
    SKETCH -->|"POST /api/events/ → trigger_analysis"| SIG
    MAP -->|"3D Farm Cylinders + Disaster Polygons"| SKETCH
    CHAT -->|"POST /api/chat/"| AI
```

---

## Data Flow Summary

| Step | Trigger | Source File | Action |
|:---|:---|:---|:---|
| **Ingest** | Celery Beat (6h) | `fetch_nasa_eonet.py` | Pull NASA EONET → Point → 50km buffer Polygon |
| **Ingest** | Demo Simulator | `Dashboard.jsx` | User toggles disaster simulation for live walkthrough |
| **Auto-trigger** | `post_save` signal | `signals.py` | Any new `DisasterEvent` → `process_disaster_event.delay()` |
| **Spatial query** | Celery worker | `tasks.py` | `Farm.objects.filter(geofence__intersects=area)` |
| **Payout** | Celery worker | `tasks.py` | Web3.py ETH transfer + mock fallback |
| **AI report** | Celery worker | `tasks.py` | `generate_ai_damage_report.delay(alert.id)` |
| **WebSocket** | Celery worker | `tasks.py` | `channel_layer.group_send('alerts_group', ...)` |
| **SMS** | Celery worker | `tasks.py` | `send_sms_alert.delay(phone, message)` |

---

*Part 2 of 5 — AgriGuard Hackathon Submission, July 2026*
