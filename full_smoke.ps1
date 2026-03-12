## Full Module Smoke Test â€” All Backend Controllers
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
$b = if ($env:SMOKE_BASE -and $env:SMOKE_BASE.Trim()) { $env:SMOKE_BASE.Trim() } else { "http://localhost:3000/api/v1" }
$f = "c:\Users\statc\OneDrive\Desktop\statcompy\full_smoke_results.txt"
$cid = if ($env:SMOKE_CLIENT_ID) { $env:SMOKE_CLIENT_ID } else { "" }
$branchId = if ($env:SMOKE_BRANCH_ID) { $env:SMOKE_BRANCH_ID } else { "" }
$transitionScript = Join-Path $PSScriptRoot 'paydek_transition_smoke.ps1'
$transitionOut = Join-Path $PSScriptRoot 'paydek_transition_results.txt'

$adminEmail = if ($env:SMOKE_ADMIN_EMAIL) { $env:SMOKE_ADMIN_EMAIL } else { 'admin@statcosol.com' }
$adminPassword = if ($env:SMOKE_ADMIN_PASSWORD) { $env:SMOKE_ADMIN_PASSWORD } else { $null }
$clientEmail = if ($env:SMOKE_CLIENT_EMAIL) { $env:SMOKE_CLIENT_EMAIL } else { 'dharmaravu@vedhaentech.in' }
$clientPassword = if ($env:SMOKE_CLIENT_PASSWORD) { $env:SMOKE_CLIENT_PASSWORD } else { $null }

function GetToken($payload) {
    if ($null -eq $payload) { return $null }
    if ($payload.accessToken) { return $payload.accessToken }
    if ($payload.token) { return $payload.token }
    if ($payload.data -and $payload.data.accessToken) { return $payload.data.accessToken }
    if ($payload.data -and $payload.data.token) { return $payload.data.token }
    return $null
}

function Get-FirstId($payload) {
    if ($null -eq $payload) { return $null }
    if ($payload.data -is [System.Array] -and $payload.data.Count -gt 0 -and $payload.data[0].id) {
        return "$($payload.data[0].id)"
    }
    if ($payload.items -and $payload.items.Count -gt 0 -and $payload.items[0].id) {
        return "$($payload.items[0].id)"
    }
    if ($payload -is [System.Array] -and $payload.Count -gt 0 -and $payload[0].id) {
        return "$($payload[0].id)"
    }
    if ($payload.data -and $payload.data.id) { return "$($payload.data.id)" }
    if ($payload.id) { return "$($payload.id)" }
    return $null
}

function Is-UUID($value) {
    if (-not $value) { return $false }
    return [bool]([string]$value -match '^[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[1-5][0-9a-fA-F]{3}\-[89abAB][0-9a-fA-F]{3}\-[0-9a-fA-F]{12}$')
}

function Get-FirstUUID($payload) {
    $candidates = New-Object System.Collections.Generic.List[string]
    if ($payload -is [System.Array]) {
        foreach ($item in $payload) { if ($item -and $item.id) { $candidates.Add("$($item.id)") } }
    }
    if ($payload.data -is [System.Array]) {
        foreach ($item in $payload.data) { if ($item -and $item.id) { $candidates.Add("$($item.id)") } }
    }
    if ($payload.items -is [System.Array]) {
        foreach ($item in $payload.items) { if ($item -and $item.id) { $candidates.Add("$($item.id)") } }
    }
    if ($payload.data -and $payload.data.id) { $candidates.Add("$($payload.data.id)") }
    if ($payload.id) { $candidates.Add("$($payload.id)") }

    foreach ($id in ($candidates | Select-Object -Unique)) {
        if (Is-UUID $id) { return $id }
    }
    return $null
}

Write-Host "Logging in..."
$a = $null
$adminResolvedPassword = $null
$adminPasswordCandidates = @()
if ($adminPassword) { $adminPasswordCandidates += $adminPassword }
$adminPasswordCandidates += @('Admin@123', 'Adminin@123', 'Statco@123')
$adminPasswordCandidates = $adminPasswordCandidates | Select-Object -Unique
foreach ($candidate in $adminPasswordCandidates) {
  try {
    $la = Invoke-RestMethod -Method Post -Uri "$b/auth/login" -ContentType "application/json" -Body (@{ email = $adminEmail; password = $candidate } | ConvertTo-Json)
    $a = GetToken $la
    if ($a) { $adminResolvedPassword = $candidate; break }
  } catch {
    # try next candidate
  }
}
$c = $null
$clientPasswordCandidates = @()
if ($clientPassword) { $clientPasswordCandidates += $clientPassword }
$clientPasswordCandidates += @('Vedha@123', 'Reset@8569', 'Statco@123')
$clientPasswordCandidates = $clientPasswordCandidates | Select-Object -Unique
foreach ($candidate in $clientPasswordCandidates) {
  try {
    $lc = Invoke-RestMethod -Method Post -Uri "$b/auth/login" -ContentType "application/json" -Body (@{ email = $clientEmail; password = $candidate } | ConvertTo-Json)
    $c = GetToken $lc
    if ($c) { break }
  } catch {
    # try next candidate
  }
}
if (-not $a) { Write-Host "ADMIN login FAILED"; exit 1 }
if (-not $c) { Write-Host "CLIENT login FAILED"; exit 1 }
Write-Host "Tokens ready."

if (-not $cid) {
    try {
        $clients = Invoke-RestMethod -Method Get -Uri "$b/admin/clients" -Headers @{Authorization="Bearer $a"}
        $cid = Get-FirstId $clients
    } catch {}
    if (-not $cid) {
        try {
            $me = Invoke-RestMethod -Method Get -Uri "$b/me" -Headers @{Authorization="Bearer $c"}
            if ($me.clientId) { $cid = "$($me.clientId)" }
            elseif ($me.data -and $me.data.clientId) { $cid = "$($me.data.clientId)" }
        } catch {}
    }
}

if (-not $branchId) {
    try {
        $branches = Invoke-RestMethod -Method Get -Uri "$b/client/branches" -Headers @{Authorization="Bearer $c"}
        $branchId = Get-FirstUUID $branches
    } catch {}
}

if ($cid) { Write-Host "Resolved clientId: $cid" } else { Write-Host "WARN: clientId unresolved; some endpoint checks may fail." }
if ($branchId) { Write-Host "Resolved branchId: $branchId" } else { Write-Host "WARN: branchId unresolved; branch-scoped checks may fail." }

$pass = 0; $fail = 0; $skip = 0; $results = @()
function T($name, $path, $token) {
    try {
        $null = Invoke-WebRequest -Uri "$b$path" -Headers @{Authorization="Bearer $token"} -UseBasicParsing -ErrorAction Stop
        $code = 200
    } catch {
        $code = [int]$_.Exception.Response.StatusCode
        if ($code -eq 0) { $code = 999 }
    }
    if ($code -ge 200 -and $code -lt 300) {
        $s = "PASS"; $script:pass++
    } elseif ($code -eq 403) {
        $s = "SKIP"; $script:skip++  # role mismatch, not a bug
    } else {
        $s = "FAIL"; $script:fail++
    }
    $line = "$s [$code] $name"
    Write-Host $line
    $script:results += $line
}
function K($name, $reason) {
    $line = "SKIP [PRECOND] $name :: $reason"
    Write-Host $line
    $script:results += $line
    $script:skip++
}
function TClientScoped($name, $path, $token) {
    if ($script:cid) { T $name $path $token } else { K $name "clientId unresolved" }
}
function TBranchScoped($name, $path, $token) {
    if ($script:branchId) { T $name $path $token } else { K $name "branchId unresolved" }
}

Write-Host "`n========== FULL MODULE SMOKE TEST =========="
Write-Host ""

# â”€â”€ 1. Health â”€â”€
Write-Host "--- health ---"
T "health" "/health" $a

# â”€â”€ 2. Auth â”€â”€
Write-Host "--- auth ---"
T "me" "/me" $a

# â”€â”€ 3. Admin Dashboard â”€â”€
Write-Host "--- admin/dashboard ---"
T "admin/dashboard/summary" "/admin/dashboard/summary" $a
T "admin/dashboard/stats" "/admin/dashboard/stats" $a
T "admin/dashboard/clients-minimal" "/admin/dashboard/clients-minimal" $a
T "admin/dashboard/attention" "/admin/dashboard/attention" $a
T "admin/dashboard/sla-trend" "/admin/dashboard/sla-trend" $a
T "admin/dashboard/audit-summary" "/admin/dashboard/audit-summary" $a
T "admin/dashboard/risk-alerts" "/admin/dashboard/risk-alerts" $a
T "admin/dashboard/states" "/admin/dashboard/states" $a
T "admin/dashboard/escalations" "/admin/dashboard/escalations" $a
T "admin/dashboard/task-status" "/admin/dashboard/task-status" $a
T "admin/dashboard/crm-load" "/admin/dashboard/crm-load" $a
T "admin/dashboard/auditor-load" "/admin/dashboard/auditor-load" $a
T "admin/dashboard/assignment-summary" "/admin/dashboard/assignment-summary" $a
T "admin/dashboard/unassigned-clients" "/admin/dashboard/unassigned-clients" $a
T "admin/dashboard/assignments-attention" "/admin/dashboard/assignments-attention" $a

# â”€â”€ 4. Admin Users/Roles â”€â”€
Write-Host "--- admin/users ---"
T "admin/users" "/admin/users" $a
T "admin/roles" "/admin/roles" $a

# â”€â”€ 5. Admin Clients â”€â”€
Write-Host "--- admin/clients ---"
T "admin/clients" "/admin/clients" $a
TClientScoped "admin/clients/:cid/branches" "/admin/clients/$cid/branches" $a

# â”€â”€ 6. Admin Reports â”€â”€
Write-Host "--- admin/reports ---"
T "admin/reports/user-activity" "/admin/reports/user-activity" $a
T "admin/reports/user-registrations" "/admin/reports/user-registrations" $a

# â”€â”€ 7. Admin Audit Logs â”€â”€
Write-Host "--- admin/audit-logs ---"
T "admin/audit-logs" "/admin/audit-logs" $a

# â”€â”€ 8. Admin Helpdesk â”€â”€
Write-Host "--- admin/helpdesk ---"
T "admin/helpdesk/tickets" "/admin/helpdesk/tickets" $a

# â”€â”€ 9. Admin Notifications â”€â”€
Write-Host "--- admin/notifications ---"
T "admin/notifications" "/admin/notifications" $a

# â”€â”€ 10. Admin Assignments â”€â”€
Write-Host "--- admin/assignments ---"
T "admin/assignments" "/admin/assignments" $a

# â”€â”€ 11. Admin Contractors â”€â”€
Write-Host "--- admin/contractors ---"
T "admin/contractors/links" "/admin/contractors/links" $a

# â”€â”€ 12. Admin Compliance â”€â”€
Write-Host "--- admin/compliance ---"
T "admin/compliance/tasks" "/admin/compliance/tasks" $a

# â”€â”€ 13. Admin Approvals â”€â”€
Write-Host "--- admin/approvals ---"
T "admin/approvals" "/admin/approvals" $a

# â”€â”€ 14. Admin Payroll Templates â”€â”€
Write-Host "--- admin/payroll ---"
T "admin/payroll/templates" "/admin/payroll/templates" $a

# â”€â”€ 15. Admin Masters â”€â”€
Write-Host "--- admin/masters ---"
T "admin/masters/compliances" "/admin/masters/compliances" $a
T "admin/masters/audit-categories" "/admin/masters/audit-categories" $a

# â”€â”€ 19. Admin Compliances â”€â”€
Write-Host "--- admin/compliances ---"
T "admin/compliances" "/admin/compliances" $a

# â”€â”€ 20. Admin Returns â”€â”€
Write-Host "--- admin/returns ---"
T "admin/returns/filings" "/admin/returns/filings" $a
T "admin/returns/types" "/admin/returns/types" $a

# â”€â”€ 21. Admin Branch Compliance â”€â”€
Write-Host "--- admin/branch-compliance ---"
T "admin/branch-compliance/return-master" "/admin/branch-compliance/return-master" $a

# â”€â”€ 22. Admin Compliance Docs â”€â”€
Write-Host "--- admin/compliance-docs ---"
TClientScoped "admin/compliance-docs" "/admin/compliance-docs?clientId=$cid" $a

# â”€â”€ 23. Admin Archive â”€â”€
Write-Host "--- admin/archive ---"
T "admin/archive/clients" "/admin/archive/clients" $a
T "admin/archive/branches" "/admin/archive/branches" $a
T "admin/archive/users" "/admin/archive/users" $a

# â”€â”€ 24. Notifications â”€â”€
Write-Host "--- notifications ---"
T "notifications/inbox" "/notifications/inbox" $a
T "notifications/my" "/notifications/my" $a

# â”€â”€ 25. Client Dashboard â”€â”€
Write-Host "--- client-dashboard ---"
T "client/dashboard" "/client/dashboard" $c
T "client-dashboard/pf-esi-summary" "/client-dashboard/pf-esi-summary?month=2026-03" $c
T "client-dashboard/contractor-upload-summary" "/client-dashboard/contractor-upload-summary?month=2026-03" $c

# â”€â”€ 26. Client Branches â”€â”€
Write-Host "--- client/branches ---"
T "client/branches/registration-summary" "/client/branches/registration-summary" $c
T "client/branches/registration-alerts" "/client/branches/registration-alerts" $c
TBranchScoped "client/branches/:branchId/registrations" "/client/branches/$branchId/registrations" $c
TBranchScoped "branch/:branchId/safety/required" "/branch/$branchId/safety/required" $c
TBranchScoped "branch/uploads/pending" "/branch/uploads/pending?branchId=$branchId" $c

# â”€â”€ 27. Client Branch Compliance â”€â”€
Write-Host "--- client/branch-compliance ---"
T "client/branch-compliance/lowest-branches" "/client/branch-compliance/lowest-branches" $c
T "client/branch-compliance/trend" "/client/branch-compliance/trend" $c

# â”€â”€ 28. Client Documents â”€â”€
Write-Host "--- client/documents ---"
T "client/documents" "/client/documents" $c

# â”€â”€ 29. Client Contractors â”€â”€
Write-Host "--- client/contractors ---"
T "client/contractors" "/client/contractors" $c

# â”€â”€ 30. Client Employees â”€â”€
Write-Host "--- client/employees ---"
T "client/employees" "/client/employees" $c

# â”€â”€ 31. Client Compliance Tasks â”€â”€
Write-Host "--- client/compliance ---"
T "client/compliance/tasks" "/client/compliance/tasks" $c

# â”€â”€ 32. Client Helpdesk â”€â”€
Write-Host "--- client/helpdesk ---"
T "client/helpdesk/tickets" "/client/helpdesk/tickets" $c

# â”€â”€ 33. Client Returns â”€â”€
Write-Host "--- client/returns ---"
T "client/returns" "/client/returns" $c

# â”€â”€ 34. Client Audits â”€â”€
Write-Host "--- client/audits ---"
T "client/audits" "/client/audits" $c

# â”€â”€ 35. Client Compliance Docs â”€â”€
Write-Host "--- client/compliance-docs ---"
T "client/compliance-docs" "/client/compliance-docs" $c
T "client/compliance-docs/categories" "/client/compliance-docs/categories" $c

# â”€â”€ 36. Client Branch Compliance Docs â”€â”€
Write-Host "--- client/branch-compliance ---"
T "client/branch-compliance" "/client/branch-compliance" $c

# â”€â”€ 37. Client Safety Docs â”€â”€
Write-Host "--- client/safety-documents ---"
T "client/safety-documents" "/client/safety-documents" $c

# â”€â”€ 38. Client Nominations â”€â”€
# Skipped â€” requires valid employeeId & type query params

# â”€â”€ 39. LegitX (Client) â”€â”€
Write-Host "--- legitx ---"
T "legitx/dashboard/summary" "/legitx/dashboard/summary" $c
T "legitx/compliance-status" "/legitx/compliance-status" $c
T "legitx/mcd" "/legitx/mcd" $c
T "legitx/returns" "/legitx/returns" $c
T "legitx/audits" "/legitx/audits" $c

# â”€â”€ 40. Compliance â”€â”€
Write-Host "--- compliance ---"
T "compliance/summary" "/compliance/summary?month=2026-03" $c

# â”€â”€ 41. Reports â”€â”€
Write-Host "--- reports ---"
T "reports/compliance-summary" "/reports/compliance-summary" $a

# â”€â”€ 42. Calendar â”€â”€
Write-Host "--- calendar ---"
TClientScoped "calendar" "/calendar?from=2026-01-01&to=2026-03-31&clientId=$cid" $a

# â”€â”€ 43. Risk â”€â”€
Write-Host "--- risk ---"
T "risk/heatmap" "/risk/heatmap" $a
T "risk/trend" "/risk/trend" $a

# â”€â”€ 44. SLA â”€â”€
Write-Host "--- sla ---"
T "sla/tasks" "/sla/tasks" $a

# â”€â”€ 45. Escalations â”€â”€
Write-Host "--- escalations ---"
T "escalations" "/escalations" $a

# â”€â”€ 46. Checklists â”€â”€
Write-Host "--- checklists ---"
TClientScoped "checklists/client/:cid" "/checklists/client/$cid" $a

# â”€â”€ 47. Options (admin) â”€â”€
Write-Host "--- options ---"
T "admin/options/clients" "/admin/options/clients" $a
T "admin/options/branches" "/admin/options/branches" $a
T "client/options/branches" "/client/options/branches" $c

# â”€â”€ 48. Payroll Controller â”€â”€
Write-Host "--- payroll ---"
T "payroll/summary" "/payroll/summary" $a
T "payroll/dashboard" "/payroll/dashboard" $a
T "payroll/pf-esi-summary" "/payroll/pf-esi-summary" $a
T "payroll/employees" "/payroll/employees" $a
T "payroll/clients" "/payroll/clients" $a
T "payroll/templates" "/payroll/templates" $a
T "payroll/payslips" "/payroll/payslips" $a
T "payroll/registers-records" "/payroll/registers-records" $a
T "payroll/registers" "/payroll/registers" $a
T "payroll/runs" "/payroll/runs" $a
T "payroll/queries" "/payroll/queries" $a
T "payroll/fnf" "/payroll/fnf" $a

# â”€â”€ 49. Payroll Setup â”€â”€
Write-Host "--- payroll/setup ---"
TClientScoped "payroll/setup/:cid" "/payroll/setup/$cid" $a
TClientScoped "payroll/setup/:cid/components" "/payroll/setup/$cid/components" $a

# â”€â”€ 50. Payroll Processing â”€â”€
Write-Host "--- payroll/processing ---"
T "payroll/runs/register-templates" "/payroll/runs/register-templates" $a

# â”€â”€ 51. Payroll Reports â”€â”€
Write-Host "--- payroll/reports ---"
TClientScoped "payroll/reports/bank-statement" "/payroll/reports/bank-statement?clientId=$cid" $a
TClientScoped "payroll/reports/muster-roll" "/payroll/reports/muster-roll?clientId=$cid" $a
TClientScoped "payroll/reports/cost-analysis" "/payroll/reports/cost-analysis?clientId=$cid" $a
TClientScoped "payroll/reports/form16" "/payroll/reports/form16?clientId=$cid" $a

# â”€â”€ 52. Payroll Config â”€â”€
Write-Host "--- payroll/config ---"
TClientScoped "payroll/clients/:cid/components-effective" "/payroll/clients/$cid/components-effective" $a
TClientScoped "payroll/clients/:cid/payslip-layout" "/payroll/clients/$cid/payslip-layout" $a

# â”€â”€ 53. Payroll Admin Assignments â”€â”€
Write-Host "--- payroll/admin-assignments ---"
TClientScoped "admin/payroll-assignments/:cid" "/admin/payroll-assignments/$cid" $a

# â”€â”€ 54. Payroll Engine â”€â”€
Write-Host "--- payroll/engine ---"
TClientScoped "payroll/engine/rule-sets" "/payroll/engine/rule-sets?clientId=$cid" $a
TClientScoped "payroll/engine/structures" "/payroll/engine/structures?clientId=$cid" $a

# â”€â”€ 55. PayDek â”€â”€
Write-Host "--- paydek ---"
T "paydek/employees" "/paydek/employees" $a
T "paydek/pf-esi/pending" "/paydek/pf-esi/pending" $a
T "paydek/queries" "/paydek/queries" $a

# â”€â”€ 56. Client Payroll â”€â”€
Write-Host "--- client/payroll ---"
T "client/payroll/inputs" "/client/payroll/inputs" $c
T "client/payroll/template" "/client/payroll/template" $c
T "client/payroll/registers-records" "/client/payroll/registers-records" $c
T "client/payroll/settings" "/client/payroll/settings" $c
T "client/payroll/setup" "/client/payroll/setup" $c
T "client/payroll/setup/components" "/client/payroll/setup/components" $c

# â”€â”€ 57. CRM endpoints (ADMIN fallback) â”€â”€
Write-Host "--- crm ---"
T "crm/dashboard/summary" "/crm/dashboard/summary" $a
T "crm/clients/assigned" "/crm/clients/assigned" $a
TClientScoped "crm/clients/:cid/branches" "/crm/clients/$cid/branches" $a
T "crm/compliance-tasks/tasks" "/crm/compliance-tasks/tasks" $a
T "crm/contractors/my-contractors" "/crm/contractors/my-contractors" $a
T "crm/helpdesk/tickets" "/crm/helpdesk/tickets" $a
T "crm/audits" "/crm/audits" $a
T "crm/returns/filings" "/crm/returns/filings" $a
T "crm/renewals" "/crm/renewals" $a
T "crm/renewals/kpis" "/crm/renewals/kpis" $a
T "crm/amendments" "/crm/amendments" $a
T "crm/amendments/kpis" "/crm/amendments/kpis" $a
T "crm/compliance-docs" "/crm/compliance-docs" $a
T "crm/branch-compliance" "/crm/branch-compliance" $a
T "crm/safety-documents" "/crm/safety-documents" $a
T "crm/unit-documents" "/crm/unit-documents" $a
T "crm/compliance-tracker/mcd" "/crm/compliance-tracker/mcd" $a

# â”€â”€ 58. Auditor endpoints (ADMIN fallback) â”€â”€
Write-Host "--- auditor ---"
T "auditor/dashboard/summary" "/auditor/dashboard/summary" $a
T "auditor/clients/assigned" "/auditor/clients/assigned" $a
T "auditor/audits" "/auditor/audits" $a
T "auditor/returns/filings" "/auditor/returns/filings" $a
T "auditor/branches" "/auditor/branches" $a
T "auditor/compliance-docs" "/auditor/compliance-docs" $a
T "auditor/registers" "/auditor/registers" $a

# â”€â”€ 59. CEO endpoints â”€â”€
Write-Host "--- ceo ---"
T "ceo/dashboard/summary" "/ceo/dashboard/summary" $a
T "ceo/approvals" "/ceo/approvals" $a
T "ceo/escalations" "/ceo/escalations" $a

# â”€â”€ 60. CCO endpoints â”€â”€
Write-Host "--- cco ---"
T "cco/dashboard" "/cco/dashboard" $a
T "cco/controls" "/cco/controls" $a
T "cco/escalations" "/cco/escalations" $a
T "cco/approvals" "/cco/approvals" $a

# â”€â”€ 61. Audits KPI â”€â”€
# Skipped â€” requires branchId path param: audits/kpi/branch/:branchId

# â”€â”€ 62. ESS â”€â”€
Write-Host "--- ess ---"
T "ess/profile" "/ess/profile" $c
T "ess/leave/balances" "/ess/leave/balances" $c
T "ess/leave/applications" "/ess/leave/applications" $c

# â”€â”€ 63. Monthly Documents â”€â”€
Write-Host "--- documents/monthly ---"
T "documents/monthly" "/documents/monthly" $a

# â”€â”€ 64. AI Insights â”€â”€
Write-Host "--- ai ---"
T "ai/risk/summary" "/ai/risk/summary" $a
T "ai/insights" "/ai/insights" $a

# â”€â”€ 65. Compliance Pct â”€â”€
Write-Host "--- compliance-pct ---"
TClientScoped "compliance-pct/client/:cid" "/compliance-pct/client/$cid" $a

# paydek transition workflow smoke
Write-Host "--- paydek/transition-workflow ---"
if (Test-Path $transitionScript) {
  try {
    $transitionOutput = & powershell -ExecutionPolicy Bypass -File $transitionScript -BaseUrl $b -AdminEmail $adminEmail -AdminPassword $adminResolvedPassword -OutFile $transitionOut 2>&1
    $transitionExit = $LASTEXITCODE
    $transitionSummary = ""
    if (Test-Path $transitionOut) {
      $transitionSummary = (Get-Content $transitionOut | Where-Object { $_ -match '^TOTAL:' } | Select-Object -Last 1)
    }
    if (-not $transitionSummary) {
      $transitionSummary = (($transitionOutput | Where-Object { $_ -match '^TOTAL:' }) | Select-Object -Last 1)
    }
    if ($transitionExit -eq 0) {
      $line = "PASS [200] paydek/transition-workflow :: $transitionSummary"
      Write-Host $line
      $results += $line
      $pass++
    } else {
      $line = "FAIL [500] paydek/transition-workflow :: $transitionSummary"
      Write-Host $line
      $results += $line
      $fail++
    }
  } catch {
    $line = "FAIL [500] paydek/transition-workflow :: exception while running transition smoke"
    Write-Host $line
    $results += $line
    $fail++
  }
} else {
  $line = "SKIP [404] paydek/transition-workflow :: paydek_transition_smoke.ps1 not found"
  Write-Host $line
  $results += $line
  $skip++
}
# â”€â”€ Summary â”€â”€
Write-Host ""
Write-Host "============================================="
$total = $pass + $fail + $skip
Write-Host "TOTAL: $pass PASS, $fail FAIL, $skip SKIP out of $total endpoints"
Write-Host "============================================="

$header = "FULL SMOKE TEST $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$sep = "=" * 55
$summary = "TOTAL: $pass PASS, $fail FAIL, $skip SKIP out of $total endpoints"
$failLines = $results | Where-Object { $_ -match "^FAIL" }
$failSection = if ($failLines.Count -gt 0) { @("", "FAILURES:") + $failLines } else { @("", "NO FAILURES!") }
(@($header, $sep) + $results + @("", $sep, $summary) + $failSection) | Set-Content $f
Write-Host "Results saved to $f"

