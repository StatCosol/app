param(
    [string]$DbHost = "localhost",
    [string]$DbPort = "5432",
    [string]$Database = "statcompy",
    [string]$User = "postgres",
    [string]$Password = "",
    [switch]$IncludeLegacySeeds
)

Write-Host "=== StatCo: Apply Active Migrations ===" -ForegroundColor Cyan
Write-Host "Database: $Database @ ${DbHost}:${DbPort}" -ForegroundColor Yellow
Write-Host "User: $User" -ForegroundColor Yellow

$psql = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psql) {
    Write-Host "ERROR: psql command not found. Install PostgreSQL client tools." -ForegroundColor Red
    exit 1
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$migrationsPath = Join-Path $repoRoot "migrations"
if (-not (Test-Path $migrationsPath)) {
    Write-Host "ERROR: migrations folder not found at $migrationsPath" -ForegroundColor Red
    exit 1
}

# In CI, prefer explicit -Password; fallback to DB_PASS env when not passed.
if ([string]::IsNullOrWhiteSpace($Password) -and -not [string]::IsNullOrWhiteSpace($env:DB_PASS)) {
    $Password = $env:DB_PASS
}
if (-not [string]::IsNullOrWhiteSpace($Password)) {
    $env:PGPASSWORD = $Password
}

$activeFiles = Get-ChildItem -Path $migrationsPath -File |
    Where-Object {
        $_.Name -match '^(\d{8}|025)_.*\.sql$' -and
        $_.Name -notmatch '_rollback\.sql$'
    } |
    Sort-Object Name

if (-not $IncludeLegacySeeds) {
    $activeFiles = $activeFiles | Where-Object {
        $_.Name -notin @(
            '20260208_seed_compliance_tasks.sql',
            '20260306_sprint1_v2_seed.sql'
        )
    }
}

if ($activeFiles.Count -eq 0) {
    Write-Host "No active migration files found." -ForegroundColor Yellow
    exit 0
}

Write-Host ("Applying {0} migration files..." -f $activeFiles.Count) -ForegroundColor White

$failed = @()
$applied = 0

foreach ($file in $activeFiles) {
    Write-Host ("-> {0}" -f $file.Name) -ForegroundColor White
    # -w disables interactive password prompts; relies on PGPASSWORD/env auth.
    & psql -w -h $DbHost -p $DbPort -U $User -d $Database -v ON_ERROR_STOP=1 -f $file.FullName

    if ($LASTEXITCODE -ne 0) {
        Write-Host ("FAIL: {0}" -f $file.Name) -ForegroundColor Red
        $failed += $file.Name
        continue
    }

    $applied += 1
    Write-Host ("OK: {0}" -f $file.Name) -ForegroundColor Green
}

Write-Host ""
Write-Host ("Applied: {0}" -f $applied) -ForegroundColor Green

if ($failed.Count -gt 0) {
    Write-Host ("Failed: {0}" -f $failed.Count) -ForegroundColor Red
    foreach ($f in $failed) {
        Write-Host (" - {0}" -f $f) -ForegroundColor Red
    }
    exit 2
}

Write-Host "All active migrations applied successfully." -ForegroundColor Cyan
