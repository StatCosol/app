param(
    [string]$DbHost = "localhost",
    [string]$DbPort = "5432",
    [string]$Database = "statcompy",
    [string]$User = "postgres",
    [string]$Password = "",
    [switch]$IncludeLegacySeeds,
    [switch]$BootstrapExisting
)

$ErrorActionPreference = "Stop"

function Escape-SqlLiteral {
    param([string]$Value)
    return $Value.Replace("'", "''")
}

function Invoke-Psql {
    param(
        [Parameter(Mandatory = $true)][string]$Sql,
        [switch]$Quiet
    )

    $args = @(
        "-w",
        "-h", $DbHost,
        "-p", $DbPort,
        "-U", $User,
        "-d", $Database,
        "-v", "ON_ERROR_STOP=1"
    )

    if ($Quiet) {
        $args += @("-t", "-A")
    }

    $args += @("-c", $Sql)

    $result = & psql @args
    if ($LASTEXITCODE -ne 0) {
        throw "psql command failed"
    }
    return $result
}

Write-Host "=== StatCo: Apply Active SQL Migrations ===" -ForegroundColor Cyan
Write-Host "Database: $Database @ ${DbHost}:${DbPort}" -ForegroundColor Yellow
Write-Host "User: $User" -ForegroundColor Yellow
if ($BootstrapExisting) {
    Write-Host "Mode: bootstrap existing database into migration tracking" -ForegroundColor Yellow
}

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

Invoke-Psql @"
CREATE TABLE IF NOT EXISTS sql_migrations (
    filename        TEXT PRIMARY KEY,
    checksum_sha256 TEXT NOT NULL,
    applied_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    execution_mode  VARCHAR(20) NOT NULL DEFAULT 'apply'
);
"@

Write-Host ("Processing {0} migration files..." -f $activeFiles.Count) -ForegroundColor White

$applied = 0
$bootstrapped = 0
$skipped = 0
$failed = @()

foreach ($file in $activeFiles) {
    $hash = (Get-FileHash -Algorithm SHA256 -Path $file.FullName).Hash.ToLowerInvariant()
    $safeName = Escape-SqlLiteral $file.Name
    $existingRows = @(Invoke-Psql -Quiet -Sql "SELECT checksum_sha256 FROM sql_migrations WHERE filename = '$safeName';")
    $existing = ""
    if ($existingRows.Count -gt 0 -and $null -ne $existingRows[0]) {
        $existing = ([string]$existingRows[0]).Trim()
    }

    if (-not [string]::IsNullOrWhiteSpace($existing)) {
        if ($existing -ne $hash) {
            Write-Host ("FAIL: checksum drift for {0}" -f $file.Name) -ForegroundColor Red
            $failed += ("{0} :: checksum drift (recorded {1}, current {2})" -f $file.Name, $existing, $hash)
            continue
        }

        $skipped += 1
        Write-Host ("SKIP: {0}" -f $file.Name) -ForegroundColor DarkYellow
        continue
    }

    if ($BootstrapExisting) {
        Write-Host ("BOOTSTRAP: {0}" -f $file.Name) -ForegroundColor White
        Invoke-Psql "INSERT INTO sql_migrations (filename, checksum_sha256, execution_mode) VALUES ('$safeName', '$hash', 'bootstrap');"
        $bootstrapped += 1
        continue
    }

    Write-Host ("APPLY: {0}" -f $file.Name) -ForegroundColor White
    & psql -w -h $DbHost -p $DbPort -U $User -d $Database -v ON_ERROR_STOP=1 -f $file.FullName
    if ($LASTEXITCODE -ne 0) {
        Write-Host ("FAIL: {0}" -f $file.Name) -ForegroundColor Red
        $failed += $file.Name
        continue
    }

    Invoke-Psql "INSERT INTO sql_migrations (filename, checksum_sha256, execution_mode) VALUES ('$safeName', '$hash', 'apply');"
    $applied += 1
    Write-Host ("OK: {0}" -f $file.Name) -ForegroundColor Green
}

Write-Host ""
Write-Host ("Applied: {0}" -f $applied) -ForegroundColor Green
Write-Host ("Bootstrapped: {0}" -f $bootstrapped) -ForegroundColor Cyan
Write-Host ("Skipped: {0}" -f $skipped) -ForegroundColor DarkYellow

if ($failed.Count -gt 0) {
    Write-Host ("Failed: {0}" -f $failed.Count) -ForegroundColor Red
    foreach ($f in $failed) {
        Write-Host (" - {0}" -f $f) -ForegroundColor Red
    }
    exit 2
}

Write-Host "SQL migration tracking is up to date." -ForegroundColor Cyan
