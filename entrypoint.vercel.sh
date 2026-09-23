#!/bin/sh

# The container must survive a database outage. Previously a single failed
# ``manage.py migrate`` aborted the entrypoint, so Daphne never started and every
# request returned FUNCTION_INVOCATION_FAILED instead of a usable demo.
set -e

# Vercel kills a container that has not opened its port within ~28s, so the
# database decision has to be quick: one attempt by default, and a hard time
# budget that stops retrying before the platform gives up on us.
DB_CONNECT_RETRIES="${DB_CONNECT_RETRIES:-1}"
DB_CONNECT_DELAY="${DB_CONNECT_DELAY:-2}"
DB_MIGRATION_BUDGET="${DB_MIGRATION_BUDGET:-15}"
DB_ATTEMPT_TIMEOUT="${DB_ATTEMPT_TIMEOUT:-12}"
ALLOW_EPHEMERAL_FALLBACK="${ALLOW_EPHEMERAL_FALLBACK:-1}"

if [ -z "${DATABASE_URL:-}" ]; then
  export DATABASE_URL="spatialite:////tmp/agri_guard.sqlite3"
  PERSISTENCE_MODE="ephemeral"
  echo "=== DATABASE_URL not configured; using ephemeral demo database ==="
else
  PERSISTENCE_MODE="persistent"
  case "${DATABASE_URL%%:*}" in
    postgres|postgis)
      echo "=== Persistent PostgreSQL database configured ==="
      ;;
    *)
      echo "=== DATABASE_URL configured ==="
      ;;
  esac
fi

export SPATIALITE_LIBRARY_PATH="${SPATIALITE_LIBRARY_PATH:-/usr/lib/x86_64-linux-gnu/mod_spatialite.so}"

# $1 = optional per-attempt timeout in seconds; empty means no limit.
run_migrations() {
  echo "=== Running database migrations ==="
  if [ -n "${1:-}" ] && command -v timeout >/dev/null 2>&1; then
    timeout "$1" python manage.py migrate --noinput
  else
    python manage.py migrate --noinput
  fi
}

migrated=0
attempt=1
elapsed=0
retry_started_at=$(date +%s)
while [ "${attempt}" -le "${DB_CONNECT_RETRIES}" ]; do
  if run_migrations "${DB_ATTEMPT_TIMEOUT}"; then
    migrated=1
    break
  fi
  echo "!!! Migration attempt ${attempt}/${DB_CONNECT_RETRIES} failed"
  elapsed=$(( $(date +%s) - retry_started_at ))
  if [ "${elapsed}" -ge "${DB_MIGRATION_BUDGET}" ]; then
    echo "!!! Spent ${elapsed}s on the database, budget is ${DB_MIGRATION_BUDGET}s; giving up on retries."
    break
  fi
  if [ "${attempt}" -lt "${DB_CONNECT_RETRIES}" ]; then
    sleep "${DB_CONNECT_DELAY}"
  fi
  attempt=$((attempt + 1))
done

if [ "${migrated}" -ne 1 ]; then
  if [ "${ALLOW_EPHEMERAL_FALLBACK}" = "1" ]; then
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    echo "!!! Database unreachable (attempts=${DB_CONNECT_RETRIES}, elapsed=${elapsed}s)."
    echo "!!! Falling back to an EPHEMERAL database at /tmp/agri_guard.sqlite3."
    echo "!!! Demo data will NOT persist and is not shared across instances."
    echo "!!! Fix DATABASE_URL to restore the persistent deployment."
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    export DATABASE_URL="spatialite:////tmp/agri_guard.sqlite3"
    PERSISTENCE_MODE="ephemeral"
    run_migrations ""
  else
    echo "!!! Database unreachable (attempts=${DB_CONNECT_RETRIES}, elapsed=${elapsed}s)."
    echo "!!! Set ALLOW_EPHEMERAL_FALLBACK=1 to serve the demo from a temporary"
    echo "!!! database, or fix DATABASE_URL. Refusing to start with no database."
    exit 1
  fi
fi

# Daphne inherits this, and /api/health/ reports it so the UI can warn reviewers
# when they are looking at throwaway data.
export AGRIGUARD_PERSISTENCE_MODE="${PERSISTENCE_MODE}"

echo "=== Seeding demo data ==="
python manage.py seed_demo_data

PORT="${PORT:-80}"
echo "=== Starting Daphne server on port ${PORT} ==="
exec daphne -b 0.0.0.0 -p "${PORT}" config.asgi:application
