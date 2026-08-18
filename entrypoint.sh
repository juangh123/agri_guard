#!/bin/sh
set -e

echo "=== Running database migrations ==="
python manage.py migrate --noinput || true

echo "=== Seeding demo data ==="
python manage.py seed_demo_data || true

PORT="${PORT:-8000}"
echo "=== Starting Daphne server on port $PORT ==="
exec daphne -b 0.0.0.0 -p "$PORT" config.asgi:application