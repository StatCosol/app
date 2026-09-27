# Read-only API smoke checks. Use disposable accounts on a local test server.
[CmdletBinding()]
param(
    [uri]$BackendUrl = 'http://127.0.0.1:3000',
    [uri]$FrontendUrl = 'http://127.0.0.1:4200'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

foreach ($target in @($BackendUrl, $FrontendUrl)) {
    if (-not $target.IsAbsoluteUri -or -not $target.IsLoopback -or
        $target.Scheme -notin @('http', 'https') -or $target.UserInfo -or
        $target.Query -or $target.Fragment) {
        throw 'Smoke checks require a local HTTP(S) server without URL credentials.'
    }
}

# Resolve every credential before making any request; never print response bodies.
$accounts = @{}
foreach ($role in @('ADMIN', 'AUDITOR')) {
    $email = [Environment]::GetEnvironmentVariable("AUDITXPERT_TEST_${role}_EMAIL")
    $password = [Environment]::GetEnvironmentVariable("AUDITXPERT_TEST_${role}_PASSWORD")
    if ([string]::IsNullOrWhiteSpace($email) -or [string]::IsNullOrWhiteSpace($password)) {
        throw "Set AUDITXPERT_TEST_${role}_EMAIL and AUDITXPERT_TEST_${role}_PASSWORD for disposable local accounts."
    }
    $accounts[$role] = @{ email = $email; password = $password }
}

$backend = $BackendUrl.AbsoluteUri.TrimEnd('/')
$headers = @{}
foreach ($role in @('ADMIN', 'AUDITOR')) {
    try {
        $login = Invoke-RestMethod -Method Post -Uri "$backend/api/v1/auth/login" `
            -ContentType 'application/json' -Body ($accounts[$role] | ConvertTo-Json) `
            -MaximumRedirection 0 -TimeoutSec 30
        if (-not $login.accessToken) { throw 'Missing access token' }
        $headers[$role] = @{ Authorization = "Bearer $($login.accessToken)" }
    } catch {
        throw "$role test login failed. Check the local server and disposable test account."
    } finally {
        $accounts[$role] = $null
        $login = $null
    }
}

$checks = @(
    @{ Label = 'Auditor audits'; Role = 'AUDITOR'; Path = '/api/v1/auditor/audits' },
    @{ Label = 'Auditor summary'; Role = 'AUDITOR'; Path = '/api/v1/auditor/audits/dashboard/summary' },
    @{ Label = 'Auditor upcoming'; Role = 'AUDITOR'; Path = '/api/v1/auditor/audits/dashboard/upcoming' },
    @{ Label = 'Auditor observations'; Role = 'AUDITOR'; Path = '/api/v1/auditor/observations' },
    @{ Label = 'Admin reports'; Role = 'ADMIN'; Path = '/api/v1/admin/reports/audit-reports' },
    @{ Label = 'Admin report summary'; Role = 'ADMIN'; Path = '/api/v1/admin/reports/audit-reports/summary' }
)
$failures = 0
foreach ($check in $checks) {
    try {
        $response = Invoke-WebRequest -Method Get -Uri "$backend$($check.Path)" `
            -Headers $headers[$check.Role] -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 30
        if ($response.StatusCode -ne 200) { throw 'Unexpected HTTP status' }
        $null = $response.Content | ConvertFrom-Json
        Write-Host "PASS $($check.Label)"
    } catch {
        $failures++
        Write-Host "FAIL $($check.Label)"
    }
}
try {
    $response = Invoke-WebRequest -Method Get -Uri $FrontendUrl -UseBasicParsing `
        -MaximumRedirection 0 -TimeoutSec 30
    if ($response.StatusCode -ne 200 -or $response.Content -notmatch '<app-root') {
        throw 'Frontend application shell missing'
    }
    Write-Host 'PASS Frontend application shell'
} catch {
    $failures++
    Write-Host 'FAIL Frontend application shell'
} finally {
    $headers.Clear()
}
if ($failures -gt 0) { throw "$failures smoke check(s) failed." }
Write-Host 'All 7 local smoke checks passed.'
