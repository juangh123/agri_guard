#!/bin/sh
set -e

if [ -z "${DATABASE_URL:-}" ]; then
  export DATABASE_URL="spatialite:////tmp/agri_guard.sqlite3"
  echo "=== DATABASE_URL not configured; using ephemeral demo database ==="
else
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

echo "=== Running database migrations ==="
python manage.py migrate --noinput

echo "=== Seeding demo data ==="
python manage.py seed_demo_data

PORT="${PORT:-80}"
echo "=== Starting Daphne server on port ${PORT} ==="
exec daphne -b 0.0.0.0 -p "${PORT}" config.asgi:application
