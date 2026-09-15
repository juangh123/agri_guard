# AgriGuard — 05: Tech Stack Summary

> Complete technology stack organized by architectural layer.

---

| Layer | Technology | Version | Purpose |
|:---|:---|:---|:---|
| **Space Data** | GNSS/WGS84 capture | — | Farm geo-fencing plus optional receiver, accuracy, and timestamp metadata (SRID 4326) |
| | NASA EONET API v3 | — | Event-footprint monitoring for severe storms & wildfires (6h Celery Beat schedule in the Docker stack) |
| | GEOGLOWS | — | Live flood-forecast visualization; engine ingest simulated in demo |
| **Spatial Database** | PostgreSQL + PostGIS | 15 / 3.3 | `ST_Intersects` spatial queries: Farm PolygonField ∩ DisasterEvent PolygonField |
| **Backend Framework** | Django | 4.2.30 | Web framework, ORM, admin interface, GeoJSON serialization |
| | Django REST Framework | 3.14 | REST API, ViewSets, authentication |
| | django-rest-framework-gis | — | GeoJSON serializer for spatial data |
| | Django Channels | 4.0 | WebSocket support for real-time alert push |
| | Daphne | — | ASGI server for WebSocket connections |
| | SimpleJWT | 5.3 | JWT-based authentication |
| **Async Task Queue** | Celery | 5.3.4 | Async task execution, scheduled jobs (Celery Beat) |
| | Redis | 7 | Message broker for Celery + Channels layer backend |
| **Blockchain** | Solidity | ^0.8.0 | Reference policy/escrow contract (`AgriGuardParametric.sol`), not called by the MVP |
| | Web3.py | 7.16.0 tested (6.15+ compatible) | Python ↔ Ethereum interaction, transaction signing, configured ERC-20 settlement |
| **AI / ML** | OpenAI chat completions | configurable | Automated damage estimation reports + farmer chatbot (AgriBot) |
| **Messaging** | Twilio | 8.11 | SMS alerts to farmers (USSD planned for non-smartphone users) |
| **Frontend Framework** | React | 19.2 | Component-based UI |
| | Vite | 8 | Build tool and dev server |
| **Geospatial Visualization** | MapLibre GL | 6.9 | Satellite basemap, farm geofence and disaster hotspot overlays |
| **Charts** | Recharts | 3.9 | Pie charts (safe vs affected farms), bar charts (disaster type distribution) |
| **Internationalization** | react-i18next / i18next | — | English, Français, Kiswahili, Chinese, Spanish, Portuguese, Arabic |
| **UI** | Lucide React | — | Icon library |
| | react-hot-toast | — | Real-time notification toasts |
| **HTTP Client** | Axios | — | API communication with JWT interceptor |
| **Routing** | react-router-dom | 7 | Client-side routing |
| **Containerization** | Docker + Docker Compose | — | 6-service orchestration: db, redis, web, celery, celery-beat, frontend |
| **DevOps** | PowerShell (start.ps1) | — | One-click local environment bootstrap |

---

## Container Architecture

```
docker-compose.yml
├── db        → postgis/postgis:15-3.3    (port 5432)
├── redis     → redis:7-alpine             (port 6379)
├── web       → Daphne ASGI server         (port 8000)
├── celery    → Celery worker              (async tasks)
├── celery-beat → Celery Beat              (6-hour NASA EONET schedule)
└── frontend  → Node 20 + Vite dev         (port 5173)
```

---

## API Endpoints

| Method | Endpoint | Description |
|:---|:---|:---|
| `POST` | `/api/token/` | JWT login |
| `POST` | `/api/token/refresh/` | JWT token refresh |
| `GET/POST` | `/api/farms/` | List/Create farms (GeoJSON PolygonField) |
| `GET/PUT/DELETE` | `/api/farms/{id}/` | Farm detail |
| `GET` | `/api/events/` | List disaster events (read-only GeoJSON FeatureCollection) |
| `POST` | `/api/events/{id}/trigger_analysis/` | **Manual trigger: dispatch Celery pipeline** |
| `POST` | `/api/events/simulate/` | Create a labeled demo scenario and run the pipeline |
| `GET` | `/api/alerts/` | List risk alerts with payout status |
| `POST` | `/api/chat/` | AI chatbot (AgriBot) |
| `WS` | `ws://.../ws/alerts/` | WebSocket real-time alert stream |

---

## Key Source Files

| File | Role |
|:---|:---|
| `core/models.py` | Data models: Farm (GNSS PolygonField), DisasterEvent (PolygonField), RiskAlert |
| `core/tasks.py` | Celery tasks: spatial analysis, parametric decisions, AI report, SMS |
| `core/services/blockchain_service.py` | Configured ERC-20 settlement; never fabricates transaction hashes |
| `core/views.py` | REST API: ViewSets, trigger_analysis endpoint, chat |
| `core/signals.py` | Django post_save signal → auto-trigger pipeline |
| `core/consumers.py` | WebSocket consumer for real-time alerts |
| `core/management/commands/fetch_nasa_eonet.py` | NASA EONET data ingestion (Celery Beat) |
| `config/celery.py` | Celery app config + beat schedule |
| `config/settings.py` | Django settings (PostGIS, JWT, Celery, Twilio, OpenAI) |
| `frontend/src/pages/Dashboard.jsx` | MapLibre/Esri map, charts, alert stream, chatbot |
| `frontend/src/pages/Register.jsx` | Farm registration with browser GPS |
| `frontend/src/i18n/config.js` | EN / FR / SW / ZH / ES / PT / AR translations |
| `docker-compose.yml` | 6-service container orchestration |

---

*Part 5 of 5 — AgriGuard Hackathon Submission, July 2026*
