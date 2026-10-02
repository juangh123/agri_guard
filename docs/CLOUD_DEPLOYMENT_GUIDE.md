# AgriGuard Cloud Deployment Guide

This guide deploys the public judge-facing demo without requiring local setup.

## Current Production Deployment

| Component | Current implementation |
|:---|:---|
| Public URL | [https://agri-guard-api-live.vercel.app](https://agri-guard-api-live.vercel.app) |
| Django API / WebSocket | Vercel container services, routed by `vercel.json` |
| Frontend | Vercel container running the production Vite build behind Nginx |
| Database | Railway PostgreSQL 16 with PostGIS |
| Connection mode | Railway public TCP proxy with TLS negotiated by `psycopg2` |

The active backend logs `=== Persistent PostgreSQL database configured ===` and
`No migrations to apply` after redeploys. A simulated claim was written, the
deployment was rebuilt, and the same claim remained visible, confirming that the
current production database is not the temporary SpatiaLite fallback.

The Vercel services can run more than one container instance. Because an
in-memory channel layer is per-process, the alert consumer also polls the shared
PostgreSQL/PostGIS database for newly created `RiskAlert` rows. A browser
connected to instance A therefore still receives an alert produced by instance B.
`ALERT_DB_POLL_INTERVAL` tunes the cadence (default `3` seconds when the
in-memory layer is active; `0` disables it). Add Upstash Redis or another
`channels-redis` backend when you want lower latency: once `CELERY_BROKER_URL` is
set, `CHANNEL_LAYER_BACKEND=redis` switches to the shared Redis layer and the
database polling fallback turns off automatically.

The current Vercel API container starts Daphne with eager task execution. It
does **not** run a Celery worker, Celery Beat, Redis, OpenAI, Twilio, or an
on-chain settlement job. NASA EONET ingestion can therefore be demonstrated with
the included six-hour Celery Beat schedule in the Docker stack or triggered
manually; it is not claimed to run automatically inside the Vercel judge
container.

### Container startup behaviour

`entrypoint.vercel.sh` never lets a database outage take the whole demo down
again. On start it:

1. Logs whether `DATABASE_URL` points at PostgreSQL or at the ephemeral
   fallback.
2. Runs `manage.py migrate` up to `DB_CONNECT_RETRIES` times (default `1`, with
   `DB_CONNECT_DELAY` seconds between attempts, default `2`). Each attempt is
   capped by `DB_ATTEMPT_TIMEOUT` (default `12`s) and the whole retry phase by
   `DB_MIGRATION_BUDGET` (default `15`s).
3. If every attempt fails and `ALLOW_EPHEMERAL_FALLBACK` is `1` (the default),
   prints a banner, repoints Django at
   `spatialite:////tmp/agri_guard.sqlite3`, and still starts Daphne. Set
   `ALLOW_EPHEMERAL_FALLBACK=0` to refuse to start instead.
4. Exports `AGRIGUARD_PERSISTENCE_MODE` so the running container can report
   which mode it ended up in.
5. Emits one machine-readable `agri_guard_startup` JSON line with the
   persistence mode, degradation flag, database scheme, Vercel environment, and
   release. Log-based alerting can match that stable field instead of scraping
   the surrounding prose:

   ```json
   {"event":"agri_guard_startup","persistence_mode":"ephemeral","degraded":true,"database_scheme":"spatialite","environment":"production","release":"680dfa3"}
   ```

The defaults are deliberately impatient: Vercel kills a container that has not
opened its port within roughly 28 seconds, and an earlier five-attempt retry
loop spent that entire window on a dead database, so the fallback never ran.
Raise the retry values only for hosts with a longer startup grace period.

Set the optional `ALERT_WEBHOOK_URL` variable to receive an
`agri_guard_database_fallback` JSON notification if the container falls back.
The payload includes both `text` (Slack-compatible) and `content`
(Discord-compatible) fields. `ALERT_WEBHOOK_TIMEOUT` defaults to `2` seconds so
alert delivery cannot consume the cold-start window; a failed webhook call is
logged but never prevents Daphne from starting.

### Health endpoint

`GET /api/health/` is public and returns `200` while the database answers, or
`503` with a diagnostic body when it does not:

```json
{
  "status": "ok",
  "persistence_mode": "persistent",
  "degraded": false,
  "degraded_reason": null,
  "started_at": "2026-09-23T14:02:11+00:00",
  "uptime_seconds": 1693,
  "database": { "engine": "postgis", "reachable": true, "error": null },
  "migrations": { "applied": 25, "latest": "core.0007_alter_claimtimeline_options" },
  "data": { "farms": 4, "claims": 9, "alerts": 9 },
  "environment": "production",
  "release": "8a5eb64",
  "time": "2026-09-23T14:30:24+00:00"
}
```

Use it as the deployment probe. `persistence_mode: "ephemeral"` means the demo
is running on throwaway data, and the dashboard shows the matching warning
banner so reviewers are not misled by an empty database. The frontend also
renders an explicit banner when the API is unreachable and no cached snapshot
exists, instead of silently displaying zeroes.

### Verify the live deployment

`scripts/verify_deployment.py` turns the health endpoint into a pass/fail check.
It is standard-library only, so it runs without the Django/GeoDjango stack:

```bash
python scripts/verify_deployment.py                            # judge-facing URL
python scripts/verify_deployment.py --url http://127.0.0.1:8000
python scripts/verify_deployment.py --no-require-persistent    # accept the fallback
python scripts/verify_deployment.py --no-frontend              # API checks only
```

It exits non-zero and prints the offending value when the database is
unreachable, migrations have not run, demo data is missing, or (by default)
`persistence_mode` is `ephemeral`. The `Deployment Watch` workflow runs the same
probe every six hours, so a database that disappears again fails a scheduled run
instead of waiting for someone to open the dashboard.

For remote hosts the probe also walks the surface a judge actually opens, because
the API can be healthy while the browser entry point is stale:

- `frontend_serves_spa` and `frontend_entry_asset_reachable` confirm `/` returns
  the React shell and its fingerprinted `/assets/index-*.js` bundle.
- `frontend_api_same_origin` and `frontend_has_no_localhost_api` fail when a
  production bundle bakes in a foreign or local API host. The retired
  `agri-guard-murex.vercel.app` build shipped `https://agri-guard-jcko.onrender.com/api`
  and this check now catches that class of regression.
- `frontend_websocket_url_absolute` fails when the lazy Dashboard chunk builds a
  relative socket URL, which browsers reject (`new WebSocket("/ws/alerts/")`).
- `public_api_geojson` requires anonymous `/api/farms/` to answer with GeoJSON
  instead of the HTML shell, and `websocket_upgrade` performs a real handshake
  against `/ws/alerts/` and expects `101 Switching Protocols`.

The browser checks are skipped automatically for `localhost`/`127.0.0.1` targets,
where Django is usually served without a SPA in front of it.

`degraded_reason` and `started_at`/`uptime_seconds` say why the container fell
back and how long it has been serving throwaway data. Containers started before
these fields existed report `null`.

### Replacing the database

Managed databases can be deleted, suspended, or moved. To point the deployment
at a new PostgreSQL/PostGIS database:

1. Create a PostgreSQL database and enable PostGIS:

   ```sql
   create extension if not exists postgis;
   ```

2. Update the production variable with the provider's public connection string:

   ```bash
   vercel env rm DATABASE_URL production -y
   vercel env add DATABASE_URL production --sensitive
   ```

3. Redeploy and confirm the probe passes and reports
   `persistence_mode: persistent`:

   ```bash
   python scripts/verify_deployment.py
   ```

   Re-run `seed_demo_data` if the new database is empty:

   ```bash
   vercel env pull .env.production.local
   python manage.py migrate
   python manage.py seed_demo_data
   ```

## Recommended Architecture

| Component | Service |
|:---|:---|
| Frontend | Vercel, Netlify, or Cloudflare Pages |
| Backend / WebSocket | Render or another Docker-compatible host |
| Spatial database | PostgreSQL with PostGIS enabled |
| Redis / Channels | Upstash Redis or Redis Cloud |

> **Persistence requirement:** do not use SQLite/SpatiaLite for a Vercel deployment.
> The Vercel container fallback at `/tmp/agri_guard.sqlite3` is ephemeral and can
> differ between requests or disappear after a cold start. The deployment is
> suitable for UI and authentication checks only until `DATABASE_URL` points to
> an external PostgreSQL/PostGIS database.
>
> The container now falls back to that file automatically instead of exiting, so
> a broken database degrades the demo rather than blacking it out. The fallback
> is always labelled: the container logs a banner, `/api/health/` reports
> `persistence_mode: "ephemeral"`, and the dashboard shows a warning strip.

### Managed PostGIS setup

Railway's official `PostGIS` template provides a persistent volume and is the
current production host. The Vercel entrypoint also accepts Supabase or another
managed PostgreSQL provider.

1. Create a PostgreSQL/PostGIS service.
2. Enable PostGIS:

```sql
create extension if not exists postgis;
```

3. Use a public connection string reachable from Vercel. The entrypoint accepts
   either the spatial `postgis` scheme or a provider `postgres`/`postgresql`
   URL, which it normalizes before migrations:

```dotenv
# PostgreSQL/PostGIS on Railway
DATABASE_URL=postgresql://postgres:<password>@<public-proxy-host>:<port>/railway

# Supabase session pooler alternative
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
```

4. Run `python manage.py migrate` and `python manage.py seed_demo_data`.
5. If the provider exposes PostgREST directly, enable row-level security on all
   application tables and keep the database connection private to trusted
   services.

Run the provider's security advisor after migrations. The only expected public
schema notice for a PostgREST-enabled database is `RLS Enabled No Policy`;
`RLS Disabled in Public` should not remain for application tables.

## 1. Backend on Render

Create a Docker Web Service from the repository root and configure:

```text
Build command: Dockerfile
Start command: /app/entrypoint.sh
Health check: /api/
```

Required environment variables:

```dotenv
DEBUG=False
SECRET_KEY=<long-random-secret>
ALLOWED_HOSTS=<backend-host>
DATABASE_URL=postgis://...
CELERY_BROKER_URL=rediss://...
CELERY_RESULT_BACKEND=rediss://...
CORS_ALLOWED_ORIGINS=https://<frontend-host>
```

Optional integrations:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
LIVE_AI_ENABLED=False
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
LIVE_SMS_ENABLED=False
WEB3_PROVIDER_URI=
WEB3_PRIVATE_KEY=
SMART_CONTRACT_ADDRESS=
WEB3_PAYOUT_DECIMALS=6
LIVE_SETTLEMENT_ENABLED=False
```

Leave `LIVE_AI_ENABLED`, `LIVE_SETTLEMENT_ENABLED`, and `LIVE_SMS_ENABLED` false
for a public demo. Supplying credentials alone never enables real external
actions. Claims remain `PENDING` with no fake transaction hash, AI stays on the
deterministic fallback, and SMS stays in labeled mock mode.

Before enabling any live gate on a public host, remove public demo credentials,
restrict open farmer registration and event creation to trusted operators,
rotate the provider credentials, and add rate limiting. The public hackathon
deployment should keep all three gates disabled.

The active backend must log `=== Persistent PostgreSQL database configured ===`
on startup. If it logs `=== DATABASE_URL not configured; using ephemeral demo
database ===`, replace `DATABASE_URL` before treating the deployment as a
persistent production environment.

Run migrations and seed the demo account after the first deployment:

```bash
python manage.py migrate
python manage.py seed_demo_data
```

## 2. Frontend on Vercel

- Import the GitHub repository.
- Set the project root to `frontend`.
- Build command: `npm run build`.
- Output directory: `dist`.

Set:

```dotenv
VITE_API_BASE_URL=https://<backend-host>/api
VITE_WS_BASE_URL=wss://<backend-host>/ws/alerts/
```

Add the exact Vercel origin to the backend's `CORS_ALLOWED_ORIGINS`. For preview deployments, `*.vercel.app` is accepted by default.

## 3. Verification

Open the deployed frontend and confirm:

1. The dashboard loads farm, claim, and alert data.
2. `Live Map` renders the Esri satellite layer and farm polygon.
3. `Simulate Disaster` creates an alert and claim.
4. Without Web3 configuration, the claim is visibly `PENDING`.
5. Without Twilio configuration, the SMS panel labels the message as mock.
6. `/api/` and the WebSocket endpoint are reachable over HTTPS/WSS.
7. Create a simulated claim, reload the page, and verify the same claim remains
   visible. If it disappears, the backend is still using an ephemeral database.

Use `demo / demo123` only for the hackathon demo. The seeded account is
intentionally unprivileged so the public credentials cannot access Django
admin. Create a separate `createsuperuser` account for administration, and
replace the demo password before any production use.

## 4. Emergency Local Tunnel

For a temporary judge-facing tunnel, build and preview the frontend instead of
using the Vite development server:

```bash
cd frontend
npm run build
npm run preview -- --host 0.0.0.0 --port 5174
```

Expose port `5174` with Cloudflare Quick Tunnel and rebuild with that public URL
as `VITE_API_BASE_URL`. The preview proxy forwards `/api` and `/ws` to the local
Django/Daphne process, so the browser uses one HTTPS origin and no per-request
local-network permission is needed.

Quick Tunnel URLs are temporary and have no uptime guarantee. For a reliable
judge experience, the backend and frontend should be deployed persistently and
exposed through the same HTTPS domain or through origins explicitly listed in
`CORS_ALLOWED_ORIGINS`.
