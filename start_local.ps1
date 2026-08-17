$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "====================================="
Write-Host " Starting AgriGuard locally (no Docker) "
Write-Host "====================================="

$python = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python)) {
    Write-Host "Python virtualenv not found. Create one with:"
    Write-Host "  python -m venv .venv"
    Write-Host "  .\.venv\Scripts\python.exe -m pip install -r requirements-local.txt"
    exit 1
}

$node = $null
if (Get-Command node -ErrorAction SilentlyContinue) {
    $node = (Get-Command node).Source
}
if (-not $node) {
    Write-Host "Node.js was not found on PATH. Install Node 20+ or add node.exe to PATH."
    exit 1
}

# Force the portable PostgreSQL package to extract and return its bin directory.
$pgbin = & $python -c "from postgresql_binaries import bin; print(bin())"
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($pgbin)) {
    Write-Host "Unable to locate portable PostgreSQL binaries. Install postgresql-binaries into .venv."
    exit 1
}

$pgData = Join-Path $root ".pgdata"
$pgLog = Join-Path $root ".pg.log"

if (-not (Test-Path -LiteralPath (Join-Path $pgData "PG_VERSION"))) {
    Write-Host "Initializing portable PostgreSQL..."
    & "$pgbin\initdb.exe" -D $pgData -U postgres --auth=trust --encoding=UTF8 --no-locale
    if ($LASTEXITCODE -ne 0) { throw "initdb failed" }
}

& "$pgbin\pg_isready.exe" -h 127.0.0.1 -p 5432 *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Starting portable PostgreSQL..."
    & "$pgbin\pg_ctl.exe" -D $pgData -l $pgLog -o "-p 5432" start
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL failed to start" }
} else {
    Write-Host "PostgreSQL is already running."
}

$dbExists = (& "$pgbin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='agri_guard_db'")
if ($dbExists.Trim() -ne "1") {
    Write-Host "Creating agri_guard_db..."
    & "$pgbin\createdb.exe" -h 127.0.0.1 -p 5432 -U postgres agri_guard_db
    if ($LASTEXITCODE -ne 0) { throw "createdb failed" }
}

Write-Host "Enabling PostGIS..."
& "$pgbin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d agri_guard_db -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS postgis;" | Out-Null
& "$pgbin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d template1 -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS postgis;" | Out-Null

if (-not (Test-Path -LiteralPath (Join-Path $root ".env"))) {
    Write-Host "Creating local .env..."
    $secret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 50 | ForEach-Object { [char]$_ })
    $gdalDll = (Join-Path $root ".venv\Lib\site-packages\osgeo\gdal.dll").Replace("\", "/")
    $geosDll = (Join-Path $root ".venv\Lib\site-packages\osgeo\geos_c.dll").Replace("\", "/")
    $envContent = @"
SECRET_KEY=$secret
DEBUG=True
DATABASE_URL=postgis://postgres:postgres@127.0.0.1:5432/agri_guard_db
CELERY_BROKER_URL=redis://127.0.0.1:6379/0
CELERY_RESULT_BACKEND=redis://127.0.0.1:6379/0
CELERY_TASK_ALWAYS_EAGER=True
CHANNEL_LAYER_BACKEND=memory
OPENAI_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
WEB3_PROVIDER_URI=
WEB3_PRIVATE_KEY=
SMART_CONTRACT_ADDRESS=
GDAL_LIBRARY_PATH='$gdalDll'
GEOS_LIBRARY_PATH='$geosDll'
"@
    [System.IO.File]::WriteAllText((Join-Path $root ".env"), $envContent, [System.Text.UTF8Encoding]::new($false))
} else {
    Write-Host "Using existing .env."
}

$projLib = Join-Path $root ".venv\Lib\site-packages\osgeo\data\proj"
$gdalData = Join-Path $root ".venv\Lib\site-packages\osgeo\data\gdal"
$env:PROJ_LIB = $projLib
$env:GDAL_DATA = $gdalData

Write-Host "Applying migrations and demo data..."
& $python manage.py migrate
if ($LASTEXITCODE -ne 0) { throw "Django migrate failed" }
& $python manage.py seed_demo_data
if ($LASTEXITCODE -ne 0) { throw "Demo data seeding failed" }

$backendUrl = "http://127.0.0.1:8000/api/farms/"
$frontendUrl = "http://127.0.0.1:5173/"
$backendRunning = $false
$frontendRunning = $false

try {
    Invoke-WebRequest -UseBasicParsing -Uri $backendUrl -TimeoutSec 2 | Out-Null
    $backendRunning = $true
} catch {
    $backendRunning = $false
}

if (-not $backendRunning) {
    Write-Host "Starting Django backend on :8000..."
    $backendLog = Join-Path $root ".backend.out.log"
    $backendErr = Join-Path $root ".backend.err.log"
    $backend = Start-Process -FilePath $python -ArgumentList @("-m", "daphne", "-b", "127.0.0.1", "-p", "8000", "config.asgi:application") -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $backendLog -RedirectStandardError $backendErr -PassThru
    Write-Host "Backend started (PID $($backend.Id))."
} else {
    Write-Host "Backend is already running."
}

try {
    Invoke-WebRequest -UseBasicParsing -Uri $frontendUrl -TimeoutSec 2 | Out-Null
    $frontendRunning = $true
} catch {
    $frontendRunning = $false
}

$frontendDir = Join-Path $root "frontend"
if (-not $frontendRunning) {
    Write-Host "Starting React frontend on :5173..."
    $frontendLog = Join-Path $root ".frontend.out.log"
    $frontendErr = Join-Path $root ".frontend.err.log"
    $frontend = Start-Process -FilePath $node -ArgumentList @("node_modules/vite/bin/vite.js", "--host", "0.0.0.0") -WorkingDirectory $frontendDir -WindowStyle Hidden -RedirectStandardOutput $frontendLog -RedirectStandardError $frontendErr -PassThru
    Write-Host "Frontend started (PID $($frontend.Id))."
} else {
    Write-Host "Frontend is already running."
}

Write-Host "====================================="
Write-Host " Demo ready"
Write-Host " Frontend:    http://127.0.0.1:5173"
Write-Host " Django Admin: http://127.0.0.1:8000/admin"
Write-Host " API:         http://127.0.0.1:8000/api/"
Write-Host " Logins: demo/demo123, farmer/farmer123"
Write-Host "====================================="
