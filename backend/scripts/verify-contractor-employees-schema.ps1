# verify-contractor-employees-schema.ps1
# Verifies that the Phase 1 migration columns exist on contractor_employees.
# Mirrors run-contractor-employees-migration.ps1 (executes via az containerapp exec).

if (-not $env:DB_PASS) { throw "DB_PASS env var is required (do not hardcode credentials)" }

$DB_HOST  = if ($env:DB_HOST) { $env:DB_HOST } else { "statcompy-db.postgres.database.azure.com" }
$DB_USER  = if ($env:DB_USER) { $env:DB_USER } else { "Statcocompy" }
$DB_PASS  = $env:DB_PASS
$DB_NAME  = if ($env:DB_NAME) { $env:DB_NAME } else { "statcompy" }
$APP_NAME = if ($env:APP_NAME) { $env:APP_NAME } else { "statcompy-backend" }
$RG       = if ($env:RG) { $env:RG } else { "statcompy-rg" }

$sql = @"
SELECT column_name || ':' || data_type AS col
FROM information_schema.columns
WHERE table_name = 'contractor_employees'
  AND column_name IN ('skill_category','monthly_salary','daily_wage','state_code','status')
ORDER BY column_name;
"@

$sqlB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($sql))
$nodeScript = "const {Client}=require('pg');const c=new Client({host:'$DB_HOST',user:'$DB_USER',password:'$DB_PASS',database:'$DB_NAME',ssl:{rejectUnauthorized:false}});const sql=Buffer.from('$sqlB64','base64').toString('utf8');c.connect().then(()=>c.query(sql)).then(r=>{r.rows.forEach(x=>console.log(x.col));c.end();}).catch(e=>{console.log('ERR:'+e.message);c.end();});"

Write-Host "Verifying contractor_employees schema..."
az containerapp exec --name $APP_NAME --resource-group $RG --command "node -e `"$nodeScript`""
