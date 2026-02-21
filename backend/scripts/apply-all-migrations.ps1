param(
    [string]$DbHost = "localhost",
    [string]$DbPort = "5432",
    [string]$Database = "statco_dev",
    [string]$User = "postgres",
    [switch]$IncludeSeeds
)

Write-Host "=== StatCo: Apply All Pending Migrations ===" -ForegroundColor Cyan
Write-Host "Database: $Database @ ${DbHost}:${DbPort}" -ForegroundColor Yellow
Write-Host "User: $User" -ForegroundColor Yellow

# Ensure psql exists before continuing
$psql = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psql) {
    Write-Host "ERROR: psql command not found. Install PostgreSQL client tools." -ForegroundColor Red
    exit 1
}

# Resolve migration folder
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$migrationsPath = Join-Path $repoRoot "migrations"
if (-not (Test-Path $migrationsPath)) {
    Write-Host "ERROR: migrations folder not found at $migrationsPath" -ForegroundColor Red
    exit 1
}

# Ordered list of dated migrations (rollback and seeds are excluded)
$migrationFiles = @(
    "20260127_hrms_phase1_schema.sql",
    "20260201_notification_reads.sql",
    "20260201_payroll_runs_and_payslips.sql",
    "20260202_perf_and_scope_indexes.sql",
    "20260203_payroll_templates_and_settings.sql",
    "20260205_approval_requests.sql",
    "20260205_audit_observations.sql",
    "20260205_audit_observations_update.sql",
    "20260205_audit_observation_categories.sql",
    "20260205_contractor_document_status.sql",
    "20260205_fix_audits_schema.sql",
    "20260206_governance_model_complete_schema.sql",
    "20260206_notification_inbox_indexes.sql",
    "20260207_add_audit_code.sql",
    "20260207_entity_schema_reconciliation.sql",
    "20260207_fix_audit_type_enum.sql",
    "20260207_migrate_client_assignments.sql",
    "20260208_seed_compliance_tasks.sql",
    "20260209_add_evidence_columns.sql",
    "20260209_add_mcd_items.sql",
    "20260209_audit_workflow_schema.sql",
    "20260209_expand_file_type.sql",
    "20260210_add_branch_city_pincode.sql",
    "20260210_branch_applicable_compliances.sql",
    "20260210_branch_documents_and_establishment.sql",
    "20260210_contractor_required_documents.sql",
    "20260210_user_type_master_branch.sql",
    "20260211_add_branch_auditor_assignments.sql",
    "20260212_legitx_compliance_returns_audit_reports.sql",
    "20260217_payroll_statutory_engine.sql"
)

function Invoke-Migration {
    param(
        [string]$FileName
    )

    $filePath = Join-Path $migrationsPath $FileName
    if (-not (Test-Path $filePath)) {
        Write-Host "✗ Missing migration: $FileName" -ForegroundColor Red
        exit 1
    }

    Write-Host "→ Applying $FileName" -ForegroundColor White
    $cmd = "psql -h $DbHost -p $DbPort -U $User -d $Database -f `"$filePath`""
    Invoke-Expression $cmd
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ Failed on $FileName (exit $LASTEXITCODE)" -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "✓ Applied $FileName" -ForegroundColor Green
}

foreach ($file in $migrationFiles) {
    Invoke-Migration -FileName $file
}

if ($IncludeSeeds) {
    $seedFiles = @("statco_seed_min.sql", "statco_seed_roles.sql")
    foreach ($seed in $seedFiles) {
        Write-Host "→ Seeding via $seed" -ForegroundColor White
        $seedPath = Join-Path $migrationsPath $seed
        if (-not (Test-Path $seedPath)) {
            Write-Host "✗ Missing seed file: $seed" -ForegroundColor Red
            exit 1
        }
        $seedCmd = "psql -h $DbHost -p $DbPort -U $User -d $Database -f `"$seedPath`""
        Invoke-Expression $seedCmd
        if ($LASTEXITCODE -ne 0) {
            Write-Host "✗ Failed on seed $seed (exit $LASTEXITCODE)" -ForegroundColor Red
            exit $LASTEXITCODE
        }
        Write-Host "✓ Seeded via $seed" -ForegroundColor Green
    }
}

Write-Host "=== All migrations applied successfully ===" -ForegroundColor Cyan
