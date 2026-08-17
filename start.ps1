$ErrorActionPreference = "Stop"
Write-Host "====================================="
Write-Host " Starting AgriGuard (Docker Compose) "
Write-Host "====================================="

docker compose up -d --build

Write-Host "Waiting for database..."
$maxRetries = 60
$retry = 0
$ready = $false
while ($retry -lt $maxRetries) {
    docker compose exec -T db pg_isready -U postgres | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    $retry++
    Start-Sleep -Seconds 2
}
if (-not $ready) {
    Write-Host "Database did not become ready. Check: docker compose logs db"
    exit 1
}

# The web service runs migrations and seeds demo data automatically on startup.
# Running seed again is harmless and ensures data exists if the container was already running.
docker compose exec -T web python manage.py seed_demo_data

Write-Host "====================================="
Write-Host " Demo ready"
Write-Host " Frontend:    http://localhost:5173"
Write-Host " Django Admin: http://localhost:8000/admin"
Write-Host " API:         http://localhost:8000/api/"
Write-Host " Logins: demo/demo123, farmer/farmer123"
Write-Host "====================================="
