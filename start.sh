#!/usr/bin/env bash
set -e

echo "====================================="
echo " Starting AgriGuard (Docker Compose) "
echo "====================================="

docker compose up -d --build

echo "Waiting for database..."
max_retries=60
retry=0
ready=false
while [ "$retry" -lt "$max_retries" ]; do
    if docker compose exec -T db pg_isready -U postgres > /dev/null 2>&1; then
        ready=true
        break
    fi
    retry=$((retry + 1))
    sleep 2
done

if [ "$ready" != "true" ]; then
    echo "Database did not become ready. Check: docker compose logs db"
    exit 1
fi

# The web service runs migrations and seeds demo data automatically on startup.
# Running seed again is harmless and ensures data exists if the container was already running.
docker compose exec -T web python manage.py seed_demo_data

echo "====================================="
echo " Demo ready"
echo " Frontend:    http://localhost:5173"
echo " Django Admin: http://localhost:8000/admin"
echo " API:         http://localhost:8000/api/"
echo " Logins: demo/demo123, farmer/farmer123"
echo "====================================="
