## PayDek / Payroll Comprehensive Smoke Test
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
$b = "http://localhost:3000/api/v1"
$f = "c:\Users\statc\OneDrive\Desktop\statcompy\paydek_results.txt"
$cid = "512cf437-ef2a-4b87-81ab-905a3f4813fe"

$adminEmail = if ($env:SMOKE_ADMIN_EMAIL) { $env:SMOKE_ADMIN_EMAIL } else { 'admin@statcosol.com' }
$adminPassword = if ($env:SMOKE_ADMIN_PASSWORD) { $env:SMOKE_ADMIN_PASSWORD } else { 'Admin@123' }
$clientEmail = if ($env:SMOKE_CLIENT_EMAIL) { $env:SMOKE_CLIENT_EMAIL } else { 'testclient@test.com' }
$clientPassword = if ($env:SMOKE_CLIENT_PASSWORD) { $env:SMOKE_CLIENT_PASSWORD } else { 'Test@123' }

function GetToken($payload) {
    if ($null -eq $payload) { return $null }
    if ($payload.accessToken) { return $payload.accessToken }
    if ($payload.token) { return $payload.token }
    if ($payload.data -and $payload.data.accessToken) { return $payload.data.accessToken }
    if ($payload.data -and $payload.data.token) { return $payload.data.token }
    return $null
}

# --- Login ---
Write-Host "Logging in..."
$la = Invoke-RestMethod -Method Post -Uri "$b/auth/login" -ContentType "application/json" -Body (@{ email = $adminEmail; password = $adminPassword } | ConvertTo-Json)
$a = GetToken $la
$lc = Invoke-RestMethod -Method Post -Uri "$b/auth/login" -ContentType "application/json" -Body (@{ email = $clientEmail; password = $clientPassword } | ConvertTo-Json)
$c = GetToken $lc

if (-not $a) { Write-Host "ADMIN login failed!"; exit 1 }
if (-not $c) { Write-Host "CLIENT login failed!"; exit 1 }
Write-Host "Tokens ready (admin=$($a.Length) client=$($c.Length))"

# --- Test function ---
$pass = 0; $fail = 0; $results = @()
function T($name, $method, $path, $token) {
    try {
        $h = @{ Authorization = "Bearer $token" }
        if ($method -eq "GET") {
            $null = Invoke-WebRequest -Uri "$b$path" -Headers $h -Method Get -UseBasicParsing -ErrorAction Stop
        } elseif ($method -eq "POST") {
            $null = Invoke-WebRequest -Uri "$b$path" -Headers $h -Method Post -UseBasicParsing -ContentType "application/json" -Body '{}' -ErrorAction Stop
        }
        $code = 200
    } catch {
        $code = [int]$_.Exception.Response.StatusCode
        if ($code -eq 0) { $code = 999 }
    }
    if ($code -ge 200 -and $code -lt 300) {
        $s = "PASS"; $script:pass++
    } else {
        $s = "FAIL"; $script:fail++
    }
    $line = "$s [$code] $name"
    Write-Host $line
    $script:results += $line
}

Write-Host ""
Write-Host "=== PAYDEK / PAYROLL SMOKE TEST ==="
Write-Host ""

# --- 1. PayrollController (admin token, PAYROLL/ADMIN role) ---
Write-Host "--- PayrollController ---"
T "payroll/summary"         "GET" "/payroll/summary" $a
T "payroll/dashboard"       "GET" "/payroll/dashboard" $a
T "payroll/pf-esi-summary"  "GET" "/payroll/pf-esi-summary" $a
T "payroll/employees"       "GET" "/payroll/employees" $a
T "payroll/clients"         "GET" "/payroll/clients" $a
T "payroll/templates"       "GET" "/payroll/templates" $a
T "payroll/payslips"        "GET" "/payroll/payslips" $a
T "payroll/registers-records" "GET" "/payroll/registers-records" $a
T "payroll/registers"       "GET" "/payroll/registers" $a
T "payroll/runs"            "GET" "/payroll/runs" $a
T "payroll/queries"         "GET" "/payroll/queries" $a
T "payroll/fnf"             "GET" "/payroll/fnf" $a

# --- 2. PayrollSetupController ---
Write-Host "--- PayrollSetupController ---"
T "payroll/setup/:cid"              "GET" "/payroll/setup/$cid" $a
T "payroll/setup/:cid/components"   "GET" "/payroll/setup/$cid/components" $a

# --- 3. PayrollProcessingController ---
Write-Host "--- PayrollProcessingController ---"
T "payroll/runs/register-templates" "GET" "/payroll/runs/register-templates" $a

# --- 4. PayrollReportsController ---
Write-Host "--- PayrollReportsController ---"
T "payroll/reports/bank-statement"  "GET" "/payroll/reports/bank-statement?clientId=$cid" $a
T "payroll/reports/muster-roll"     "GET" "/payroll/reports/muster-roll?clientId=$cid" $a
T "payroll/reports/cost-analysis"   "GET" "/payroll/reports/cost-analysis?clientId=$cid" $a
T "payroll/reports/form16"          "GET" "/payroll/reports/form16?clientId=$cid" $a

# --- 5. PayrollConfigController ---
Write-Host "--- PayrollConfigController ---"
T "payroll/clients/:cid/components-effective" "GET" "/payroll/clients/$cid/components-effective" $a
T "payroll/clients/:cid/payslip-layout"       "GET" "/payroll/clients/$cid/payslip-layout" $a

# --- 6. PayrollAssignmentsAdminController ---
Write-Host "--- PayrollAssignmentsAdminController ---"
T "admin/payroll-assignments/:cid"  "GET" "/admin/payroll-assignments/$cid" $a

# --- 7. PayrollEngineController ---
Write-Host "--- PayrollEngineController ---"
T "payroll/engine/rule-sets"    "GET" "/payroll/engine/rule-sets?clientId=$cid" $a
T "payroll/engine/structures"   "GET" "/payroll/engine/structures?clientId=$cid" $a

# --- 8. PaydekListController ---
Write-Host "--- PaydekListController ---"
T "paydek/employees"      "GET" "/paydek/employees" $a
T "paydek/pf-esi/pending"  "GET" "/paydek/pf-esi/pending" $a
T "paydek/queries"         "GET" "/paydek/queries" $a

# --- 9. Client Payroll endpoints (client token) ---
Write-Host "--- Client Payroll ---"
T "client/payroll/inputs"           "GET" "/client/payroll/inputs" $c
T "client/payroll/template"         "GET" "/client/payroll/template" $c
T "client/payroll/registers-records" "GET" "/client/payroll/registers-records" $c
T "client/payroll/settings"         "GET" "/client/payroll/settings" $c
T "client/payroll/setup"            "GET" "/client/payroll/setup" $c
T "client/payroll/setup/components" "GET" "/client/payroll/setup/components" $c

# --- Summary ---
Write-Host ""
Write-Host "============================================="
$total = $pass + $fail
Write-Host "TOTAL: $pass PASS, $fail FAIL out of $total endpoints"
Write-Host "============================================="

# Save results
$header = "PAYDEK SMOKE TEST $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$sep = "=" * 50
$summary = "TOTAL: $pass PASS, $fail FAIL out of $total endpoints"
(@($header, $sep) + $results + @("", $summary)) | Set-Content $f
Write-Host "Results saved to $f"
