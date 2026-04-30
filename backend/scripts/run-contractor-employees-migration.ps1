# run-contractor-employees-migration.ps1
# Phase 1: skill_category, monthly_salary, daily_wage, state_code, status on contractor_employees.
# Runs each statement via az containerapp exec (mirrors billing-migration.ps1).

$DB_HOST  = "statcompy-db.postgres.database.azure.com"
$DB_USER  = "Statcocompy"
$DB_PASS  = "Statco@123"
$DB_NAME  = "statcompy"
$APP_NAME = "statcompy-backend"
$RG       = "statcompy-rg"

function Run-Sql {
    param([string]$sql, [string]$label = "")
    $sqlB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($sql))
    $nodeScript = "const {Client}=require('pg');const c=new Client({host:'$DB_HOST',user:'$DB_USER',password:'$DB_PASS',database:'$DB_NAME',ssl:{rejectUnauthorized:false}});const sql=Buffer.from('$sqlB64','base64').toString('utf8');c.connect().then(()=>c.query(sql)).then(()=>{console.log('OK: $label');c.end();}).catch(e=>{console.log('ERR($label):'+e.message);c.end();});"
    Write-Host "Running: $label"
    az containerapp exec --name $APP_NAME --resource-group $RG --command "node -e `"$nodeScript`""
    Start-Sleep -Milliseconds 500
}

Run-Sql "ALTER TABLE contractor_employees ADD COLUMN IF NOT EXISTS skill_category VARCHAR(20) NULL" "add skill_category"
Run-Sql "ALTER TABLE contractor_employees ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(12,2) NULL" "add monthly_salary"
Run-Sql "ALTER TABLE contractor_employees ADD COLUMN IF NOT EXISTS daily_wage NUMERIC(10,2) NULL" "add daily_wage"
Run-Sql "ALTER TABLE contractor_employees ADD COLUMN IF NOT EXISTS state_code VARCHAR(10) NULL" "add state_code"
Run-Sql "ALTER TABLE contractor_employees ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'" "add status"

Run-Sql "UPDATE contractor_employees SET status = CASE WHEN is_active = TRUE THEN 'ACTIVE' ELSE 'LEFT' END WHERE status IS NULL OR status = 'ACTIVE'" "backfill status"

Run-Sql "DO `$`$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ce_skill_category') THEN ALTER TABLE contractor_employees ADD CONSTRAINT chk_ce_skill_category CHECK (skill_category IS NULL OR skill_category IN ('UNSKILLED','SEMI_SKILLED','SKILLED','HIGHLY_SKILLED')); END IF; END `$`$" "add chk_ce_skill_category"

Run-Sql "DO `$`$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ce_status') THEN ALTER TABLE contractor_employees ADD CONSTRAINT chk_ce_status CHECK (status IN ('ACTIVE','LEFT','INACTIVE')); END IF; END `$`$" "add chk_ce_status"

Run-Sql "CREATE INDEX IF NOT EXISTS idx_contractor_emp_status ON contractor_employees(status)" "idx status"
Run-Sql "CREATE INDEX IF NOT EXISTS idx_contractor_emp_skill ON contractor_employees(skill_category)" "idx skill"

Write-Host "All migration statements completed."
