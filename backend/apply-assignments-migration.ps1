# Apply Client Assignments Migration
# This script safely migrates the old client_assignments structure to the new governance model

Write-Host "=== StatCo Database Migration: Client Assignments ===" -ForegroundColor Cyan
Write-Host ""

# Database connection parameters - adjust as needed
$DB_HOST = "localhost"
$DB_PORT = "5432"
$DB_NAME = "statco_dev"
$DB_USER = "postgres"

Write-Host "Database: $DB_NAME @ ${DB_HOST}:${DB_PORT}" -ForegroundColor Yellow
Write-Host ""

# Check if psql is available
$psqlCheck = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlCheck) {
    Write-Host "ERROR: psql command not found. Please install PostgreSQL client tools." -ForegroundColor Red
    exit 1
}

# Confirmation
Write-Host "WARNING: This will restructure the client_assignments table." -ForegroundColor Yellow
Write-Host "         Make sure you have a backup of your database!" -ForegroundColor Yellow
Write-Host ""
$confirmation = Read-Host "Do you want to proceed? (yes/no)"
if ($confirmation -ne "yes") {
    Write-Host "Migration cancelled." -ForegroundColor Yellow
    exit 0
}

# Create backup first
Write-Host ""
Write-Host "Step 1: Creating backup..." -ForegroundColor Cyan
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = "backup_client_assignments_$timestamp.sql"

$backupCmd = "pg_dump -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t client_assignments -t client_assignment_current -f $backupFile"
Write-Host "Running: $backupCmd" -ForegroundColor Gray
Invoke-Expression $backupCmd

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Backup created: $backupFile" -ForegroundColor Green
} else {
    Write-Host "✗ Backup failed. Aborting migration." -ForegroundColor Red
    exit 1
}

# Apply migration
Write-Host ""
Write-Host "Step 2: Applying migration..." -ForegroundColor Cyan
$migrationFile = ".\migrations\20260207_migrate_client_assignments.sql"

if (-not (Test-Path $migrationFile)) {
    Write-Host "✗ Migration file not found: $migrationFile" -ForegroundColor Red
    exit 1
}

$migrateCmd = "psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f $migrationFile"
Write-Host "Running: $migrateCmd" -ForegroundColor Gray
Invoke-Expression $migrateCmd

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Migration completed successfully!" -ForegroundColor Green
} else {
    Write-Host "✗ Migration failed. Check errors above." -ForegroundColor Red
    Write-Host "  You can restore from backup using:" -ForegroundColor Yellow
    Write-Host "  psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f $backupFile" -ForegroundColor Yellow
    exit 1
}

# Verify
Write-Host ""
Write-Host "Step 3: Verifying migration..." -ForegroundColor Cyan
$verifyQuery = "SELECT assignment_type, COUNT(*) as count FROM client_assignments GROUP BY assignment_type;"
$verifyCmd = "psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c `"$verifyQuery`""
Invoke-Expression $verifyCmd

Write-Host ""
Write-Host "=== Migration Complete ===" -ForegroundColor Green
Write-Host "Backup saved to: $backupFile" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Restart your NestJS backend server" -ForegroundColor White
Write-Host "2. Test the CRM dashboard to verify it works correctly" -ForegroundColor White
Write-Host "3. If everything works, you can delete the backup file" -ForegroundColor White
