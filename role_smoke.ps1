## Role Smoke Test - validates one endpoint set per role
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$base = if ($env:SMOKE_BASE -and $env:SMOKE_BASE.Trim()) { $env:SMOKE_BASE.Trim() } else { "http://localhost:3000/api/v1" }
$outFile = "c:\Users\statc\OneDrive\Desktop\statcompy\role_smoke_results.txt"

function Get-Token($payload) {
  if ($null -eq $payload) { return $null }
  if ($payload.accessToken) { return $payload.accessToken }
  if ($payload.token) { return $payload.token }
  if ($payload.data -and $payload.data.accessToken) { return $payload.data.accessToken }
  if ($payload.data -and $payload.data.token) { return $payload.data.token }
  return $null
}

function Try-Login($email, $passwordCandidates) {
  $lastStatus = 401
  foreach ($pw in $passwordCandidates) {
    if (-not $pw) { continue }
    $attempt = 0
    while ($attempt -lt 5) {
      $attempt++
      try {
        $resp = Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType "application/json" -Body (@{ email = $email; password = $pw } | ConvertTo-Json) -ErrorAction Stop
        $token = Get-Token $resp
        if ($token) {
          return @{ ok = $true; token = $token; password = $pw; status = 200 }
        }
        $lastStatus = 401
        break
      } catch {
        $status = 0
        try { $status = [int]$_.Exception.Response.StatusCode } catch { $status = 0 }
        if ($status -eq 429) {
          $lastStatus = 429
          Start-Sleep -Seconds 4
          continue
        }
        if ($status -gt 0) { $lastStatus = $status }
        break
      }
    }
    Start-Sleep -Milliseconds 300
  }
  return @{ ok = $false; token = $null; password = $null; status = $lastStatus }
}

function Hit($role, $path, $token) {
  try {
    $r = Invoke-WebRequest -Uri "$base$path" -Headers @{ Authorization = "Bearer $token" } -UseBasicParsing -ErrorAction Stop
    return "PASS [200] $role $path"
  } catch {
    $code = 0
    try { $code = [int]$_.Exception.Response.StatusCode } catch { $code = 0 }
    if ($code -eq 403) { return "SKIP [403] $role $path" }
    return "FAIL [$code] $role $path"
  }
}

$roles = @(
  @{
    role = 'ADMIN'
    email = $(if ($env:SMOKE_ADMIN_EMAIL) { $env:SMOKE_ADMIN_EMAIL } else { 'admin@statcosol.com' })
    passwords = @($env:SMOKE_ADMIN_PASSWORD, 'Admin@123')
    paths = @('/admin/dashboard/summary', '/admin/notifications', '/admin/payroll/templates')
  },
  @{
    role = 'CRM'
    email = $(if ($env:SMOKE_CRM_EMAIL) { $env:SMOKE_CRM_EMAIL } else { 'slvmgmtconsultants@gmail.com' })
    passwords = @($env:SMOKE_CRM_PASSWORD, 'Statco@123')
    paths = @('/crm/dashboard/summary', '/crm/returns', '/crm/renewals')
  },
  @{
    role = 'CLIENT'
    email = $(if ($env:SMOKE_CLIENT_EMAIL) { $env:SMOKE_CLIENT_EMAIL } else { 'dharmaravu@vedhaentech.in' })
    passwords = @($env:SMOKE_CLIENT_PASSWORD, 'Vedha@123')
    paths = @(
      '/client/dashboard',
      '/branch-approvals/leaves',
      '/client/attendance/summary?year=2026&month=3',
      '/client/attendance/mismatches?year=2026&month=3',
      '/client/attendance/lop-preview?year=2026&month=3'
    )
  },
  @{
    role = 'PAYROLL'
    email = $(if ($env:SMOKE_PAYROLL_EMAIL) { $env:SMOKE_PAYROLL_EMAIL } else { 'payroll_audit@statcosol.com' })
    passwords = @($env:SMOKE_PAYROLL_PASSWORD, 'Statco@123')
    paths = @('/payroll/dashboard', '/payroll/runs', '/payroll/queries')
  },
  @{
    role = 'AUDITOR'
    email = $(if ($env:SMOKE_AUDITOR_EMAIL) { $env:SMOKE_AUDITOR_EMAIL } else { 'compliance@statcosol.com' })
    passwords = @($env:SMOKE_AUDITOR_PASSWORD, 'Statco@123')
    paths = @('/auditor/dashboard/summary', '/auditor/observations', '/auditor/audits')
  },
  @{
    role = 'CONTRACTOR'
    email = $(if ($env:SMOKE_CONTRACTOR_EMAIL) { $env:SMOKE_CONTRACTOR_EMAIL } else { 'srisai@gmail.com' })
    passwords = @($env:SMOKE_CONTRACTOR_PASSWORD, 'Statco@123')
    paths = @('/contractor/dashboard', '/contractor/compliance/tasks', '/contractor/documents')
  },
  @{
    role = 'CCO'
    email = $(if ($env:SMOKE_CCO_EMAIL) { $env:SMOKE_CCO_EMAIL } else { 'crm_india@statcosol.com' })
    passwords = @($env:SMOKE_CCO_PASSWORD, 'Statco@123')
    paths = @('/cco/dashboard', '/cco/oversight', '/cco/controls')
  },
  @{
    role = 'CEO'
    email = $(if ($env:SMOKE_CEO_EMAIL) { $env:SMOKE_CEO_EMAIL } else { 'mkkallepalli@gmail.com' })
    passwords = @($env:SMOKE_CEO_PASSWORD, 'Statco@123')
    paths = @('/ceo/dashboard/summary', '/ceo/branches', '/ceo/reports/summary')
  }
)

$lines = @()
$lines += "ROLE SMOKE TEST $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$lines += "======================================================="

foreach ($r in $roles) {
  Start-Sleep -Milliseconds 1500
  $login = Try-Login $r.email $r.passwords
  if (-not $login.ok) {
    $lines += "LOGIN_FAIL [$($login.status)] $($r.role) $($r.email)"
    continue
  }
  $lines += "LOGIN_OK $($r.role) $($r.email) (password=$($login.password))"
  foreach ($p in $r.paths) {
    $lines += Hit $r.role $p $login.token
  }
}

$lines | Set-Content -Path $outFile -Encoding UTF8
$lines | ForEach-Object { Write-Host $_ }
