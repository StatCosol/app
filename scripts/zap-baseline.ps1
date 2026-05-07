# OWASP ZAP baseline scan against a deployed staging URL.
#
# Requires Docker Desktop. Generates HTML + JSON reports in ./zap-reports/.
#
# Usage:
#   ./scripts/zap-baseline.ps1 -TargetUrl https://staging.statcosol.com
#
# Optional auth header (e.g. for Bearer token tests):
#   ./scripts/zap-baseline.ps1 -TargetUrl https://staging.statcosol.com `
#       -AuthHeader "Authorization: Bearer eyJ..."
#
# Notes:
#   - "baseline" is non-intrusive (passive only). For active scanning use
#     'owasp/zap2docker-stable zap-full-scan.py' instead.
#   - Run against STAGING, never against production without written consent.

param(
    [Parameter(Mandatory = $true)]
    [string]$TargetUrl,

    [string]$AuthHeader = '',

    [string]$ReportDir = 'zap-reports'
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error 'Docker is not installed or not on PATH.'
    exit 1
}

New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null
$absReportDir = (Resolve-Path $ReportDir).Path
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'

$dockerArgs = @(
    'run', '--rm',
    '-v', "${absReportDir}:/zap/wrk/:rw",
    '-t', 'ghcr.io/zaproxy/zaproxy:stable',
    'zap-baseline.py',
    '-t', $TargetUrl,
    '-r', "report-$timestamp.html",
    '-J', "report-$timestamp.json",
    '-w', "report-$timestamp.md",
    '-I'  # don't fail on warnings (we want the report regardless)
)

if ($AuthHeader) {
    # Persist the header into ZAP via -z replacer rules
    $dockerArgs += '-z'
    $dockerArgs += @"
-config replacer.full_list(0).description=auth -config replacer.full_list(0).enabled=true -config replacer.full_list(0).matchtype=REQ_HEADER -config replacer.full_list(0).matchstr=Authorization -config replacer.full_list(0).regex=false -config replacer.full_list(0).replacement="$($AuthHeader -replace '^Authorization:\s*', '')"
"@
}

Write-Host "→ Running ZAP baseline against $TargetUrl"
Write-Host "→ Reports will be written to $absReportDir"
docker @dockerArgs

Write-Host ''
Write-Host "✓ Done. Open $absReportDir\report-$timestamp.html"
