<#
.SYNOPSIS
  End-to-end deploy of statcompy frontend + backend to Azure Container Apps.

.DESCRIPTION
  1. Builds frontend (ng build --configuration production) and backend (nest build).
  2. Builds Docker images tagged for ACR.
  3. Pushes images to statcompyacr001.
  4. Updates the two container apps in statcompy-rg.
  5. Backend container CMD runs `node scripts/apply-migrations.mjs || true`
     before `node dist/src/main.js`, so any new SQL migrations are applied
     to the live DB on startup.

.PARAMETER Tag
  Image tag, e.g. 20260430a. Defaults to today + 'a'. Use -Tag explicitly to
  bump letters for same-day re-deploys (b, c, ...).

.PARAMETER Component
  Which side to deploy: frontend, backend, or both (default).

.PARAMETER SkipBuild
  Skip the local npm/ng build step (use when you've already built).

.PARAMETER SkipPush
  Build images locally but don't push or update container apps. Useful for smoke testing.

.PARAMETER WhatIf
  Print every command without executing.

.EXAMPLE
  ./scripts/deploy.ps1                 # both, today's first deploy ('a')
  ./scripts/deploy.ps1 -Tag 20260430b  # same-day re-deploy
  ./scripts/deploy.ps1 -Component backend
  ./scripts/deploy.ps1 -WhatIf         # dry-run
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$Tag,
    [ValidateSet('frontend', 'backend', 'both')]
    [string]$Component = 'both',
    [switch]$SkipBuild,
    [switch]$SkipPush
)

$ErrorActionPreference = 'Stop'

# -- Constants -------------------------------------------------------------
$Acr            = 'statcompyacr001'
$AcrLoginServer = "$Acr.azurecr.io"
$ResourceGroup  = 'statcompy-rg'
$FrontendApp    = 'statcompy-frontend'
$BackendApp     = 'statcompy-backend'
$RepoRoot       = Split-Path -Parent $PSScriptRoot

if (-not $Tag) { $Tag = (Get-Date -Format 'yyyyMMdd') + 'a' }

$FrontendImage = "$AcrLoginServer/statcompy-frontend:$Tag"
$BackendImage  = "$AcrLoginServer/statcompy-backend:$Tag"

function Invoke-Step {
    param([string]$Name, [scriptblock]$Block)
    Write-Host ""
    Write-Host "==> $Name" -ForegroundColor Cyan
    if ($PSCmdlet.ShouldProcess($Name)) {
        # Native tools (docker, az, nest, ng) write progress to stderr.
        # Relax EAP locally so PowerShell does not turn those lines into
        # terminating errors. We still gate on $LASTEXITCODE.
        $prev = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            $LASTEXITCODE = 0
            & $Block
            if ($LASTEXITCODE -ne 0) {
                throw "Step '$Name' failed (exit $LASTEXITCODE)."
            }
        }
        finally {
            $ErrorActionPreference = $prev
        }
    }
}

function Assert-Tool {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required tool '$Name' is not on PATH."
    }
}

# -- Preflight -------------------------------------------------------------
Write-Host "Tag       : $Tag"
Write-Host "Component : $Component"
Write-Host "Repo root : $RepoRoot"

Assert-Tool docker
Assert-Tool az
if (-not $SkipBuild) {
    Assert-Tool node
    Assert-Tool npm
}

$buildFrontend = $Component -in @('frontend', 'both')
$buildBackend  = $Component -in @('backend',  'both')

# -- 1. Local builds -------------------------------------------------------
if (-not $SkipBuild) {
    if ($buildFrontend) {
        Invoke-Step "Frontend production build (ng build)" {
            Push-Location (Join-Path $RepoRoot 'frontend')
            try { npm run build -- --configuration production } finally { Pop-Location }
        }
    }
    if ($buildBackend) {
        Invoke-Step "Backend build (nest build)" {
            Push-Location (Join-Path $RepoRoot 'backend')
            try { npm run build } finally { Pop-Location }
        }
    }
}

# -- 2. Docker builds ------------------------------------------------------
if ($buildFrontend) {
    Invoke-Step "Docker build frontend -> $FrontendImage" {
        docker build -t $FrontendImage (Join-Path $RepoRoot 'frontend')
    }
}
if ($buildBackend) {
    Invoke-Step "Docker build backend -> $BackendImage" {
        docker build -t $BackendImage (Join-Path $RepoRoot 'backend')
    }
}

if ($SkipPush) {
    Write-Host ""
    Write-Host "-SkipPush set. Stopping after local image build." -ForegroundColor Yellow
    return
}

# -- 3. ACR login + push ---------------------------------------------------
Invoke-Step "az acr login --name $Acr" {
    az acr login --name $Acr
}
if ($buildFrontend) {
    Invoke-Step "Push $FrontendImage" { docker push $FrontendImage }
}
if ($buildBackend) {
    Invoke-Step "Push $BackendImage" { docker push $BackendImage }
}

# -- 4. Container Apps update ---------------------------------------------
if ($buildFrontend) {
    Invoke-Step "Update Container App: $FrontendApp -> $FrontendImage" {
        az containerapp update `
            --name $FrontendApp `
            --resource-group $ResourceGroup `
            --image $FrontendImage `
            --output table
    }
}
if ($buildBackend) {
    Invoke-Step "Update Container App: $BackendApp -> $BackendImage  (migrations run on container start)" {
        az containerapp update `
            --name $BackendApp `
            --resource-group $ResourceGroup `
            --image $BackendImage `
            --output table
    }
}

Write-Host ""
Write-Host "Deploy complete. Tag: $Tag" -ForegroundColor Green
