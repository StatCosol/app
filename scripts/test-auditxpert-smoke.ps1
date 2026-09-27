$ErrorActionPreference = 'Stop'
$smokeScript = Join-Path $PSScriptRoot '../auditxpert_smoke.ps1'
$smokeState = @{ Requests = 0; FailApi = $false; BadShell = $false }
function Invoke-RestMethod {
    $smokeState.Requests++
    return @{ accessToken = 'local-test-token' }
}
function Invoke-WebRequest {
    param($Uri)
    $smokeState.Requests++
    if ($smokeState.FailApi) { throw 'Sensitive response must not be printed' }
    if ($Uri -match '/api/') { return @{ StatusCode = 200; Content = '[]' } }
    return @{ StatusCode = 200; Content = $(if ($smokeState.BadShell) { 'wrong app' } else { '<app-root></app-root>' }) }
}
function Assert-Throws($Action, $Pattern) {
    try { & $Action } catch {
        if ($_.Exception.Message -notmatch $Pattern) { throw "Unexpected smoke failure: $($_.Exception.Message)" }
        return
    }
    throw 'Expected smoke failure was not raised'
}
$saved = @{}
try {
    foreach ($role in @('ADMIN', 'AUDITOR')) {
        foreach ($field in @('EMAIL', 'PASSWORD')) {
            $name = "AUDITXPERT_TEST_${role}_${field}"
            $saved[$name] = [Environment]::GetEnvironmentVariable($name)
            [Environment]::SetEnvironmentVariable($name, $null)
        }
    }
    Assert-Throws { & $smokeScript -BackendUrl 'https://example.invalid' } 'local HTTP'
    Assert-Throws { & $smokeScript } 'Set AUDITXPERT_TEST'
    if ($smokeState.Requests -ne 0) { throw 'Unsafe request before validation' }
    foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, 'disposable-fixture') }
    & $smokeScript
    if ($smokeState.Requests -ne 9) { throw 'Expected two logins and seven checks' }
    $smokeState.FailApi = $true
    Assert-Throws { & $smokeScript } '7 smoke check'
    $smokeState.FailApi = $false
    $smokeState.BadShell = $true
    Assert-Throws { & $smokeScript } '1 smoke check'
    Write-Host 'PASS smoke safety: remote target, missing credentials, success, API failure, invalid shell'
} finally {
    foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name]) }
}
