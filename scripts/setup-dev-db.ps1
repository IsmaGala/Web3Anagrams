# ─────────────────────────────────────────────────────────────────────────────
# setup-dev-db.ps1
#
# Creates the local wordchain_dev database and runs all migrations.
# Run once when setting up a new dev environment, or after adding a new
# migration file.
#
# Usage:
#   .\scripts\setup-dev-db.ps1
#
# Requirements:
#   • PostgreSQL installed and psql available on PATH
#   • Running as a user with permission to CREATE DATABASE
#     (typically your Windows Postgres superuser, default: postgres)
#
# To use a different PG user or host, override at the top of this script.
# ─────────────────────────────────────────────────────────────────────────────

param(
    [string]$PgUser  = "postgres",
    [string]$PgHost  = "localhost",
    [int]   $PgPort  = 5432,
    [string]$DbName  = "wordchain_dev"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== WordChain Dev DB Setup ===" -ForegroundColor Cyan
Write-Host "Host : $PgHost`:$PgPort"
Write-Host "User : $PgUser"
Write-Host "DB   : $DbName"
Write-Host ""

# ── 1. Create the database (ignore error if it already exists) ────────────────
Write-Host "Creating database '$DbName' (skips if already exists)..." -ForegroundColor Yellow
$createCmd = "SELECT 'already exists' FROM pg_database WHERE datname='$DbName'\gexec"
$exists = psql -U $PgUser -h $PgHost -p $PgPort -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName'"
if ($exists -eq "1") {
    Write-Host "  Database already exists, skipping create." -ForegroundColor DarkGray
} else {
    psql -U $PgUser -h $PgHost -p $PgPort -c "CREATE DATABASE $DbName;"
    Write-Host "  Created." -ForegroundColor Green
}

# ── 2. Run all migrations in order ───────────────────────────────────────────
$migrationsDir = Join-Path $PSScriptRoot "..\migrations"
$migrations = Get-ChildItem -Path $migrationsDir -Filter "*.sql" | Sort-Object Name

Write-Host ""
Write-Host "Running migrations..." -ForegroundColor Yellow

foreach ($file in $migrations) {
    Write-Host "  Applying $($file.Name)..." -NoNewline
    psql -U $PgUser -h $PgHost -p $PgPort -d $DbName -f $file.FullName -q
    if ($LASTEXITCODE -ne 0) {
        Write-Host " FAILED" -ForegroundColor Red
        Write-Host "  Error running $($file.Name). Fix the issue and re-run this script." -ForegroundColor Red
        exit 1
    }
    Write-Host " done" -ForegroundColor Green
}

# ── 3. Print connection string ────────────────────────────────────────────────
Write-Host ""
Write-Host "=== All done! ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Add this to your .env.local:" -ForegroundColor Yellow
Write-Host "  DATABASE_URL=postgresql://$PgUser@$PgHost`:$PgPort/$DbName" -ForegroundColor White
Write-Host ""
Write-Host "If your Postgres user has a password, use:"
Write-Host "  DATABASE_URL=postgresql://$PgUser`:<password>@$PgHost`:$PgPort/$DbName"
Write-Host ""
