param(
  [string]$Owner = "",
  [string]$Repo = "",
  [switch]$Apply,
  [switch]$ReadOnly,
  [switch]$Verify,
  [switch]$UseRest,
  [string]$GitHubToken = ""
)

$ErrorActionPreference = "Stop"

function Resolve-RepoFromRemote {
  $url = (git remote get-url origin 2>$null)
  if (-not $url) { return $null }
  $pattern = "github\.com[:/](?<owner>[^/]+)/(?<repo>[^/.]+)(?:\.git)?$"
  $m = [regex]::Match($url, $pattern)
  if (-not $m.Success) { return $null }
  return [pscustomobject]@{
    Owner = $m.Groups["owner"].Value
    Repo = $m.Groups["repo"].Value
  }
}

function New-ProtectionPayload {
  param([string[]]$Contexts)

  return @{
    required_status_checks = @{
      strict = $true
      contexts = $Contexts
    }
    enforce_admins = $true
    required_pull_request_reviews = @{
      dismiss_stale_reviews = $true
      require_code_owner_reviews = $false
      required_approving_review_count = 1
    }
    restrictions = $null
    required_linear_history = $true
    allow_force_pushes = $false
    allow_deletions = $false
    block_creations = $false
    required_conversation_resolution = $true
    lock_branch = $false
    allow_fork_syncing = $true
  }
}

function Show-Plan {
  param(
    [string]$Owner,
    [string]$Repo,
    [string]$Branch,
    [hashtable]$Payload
  )
  $json = $Payload | ConvertTo-Json -Depth 10
  Write-Host ""
  Write-Host "Branch: $Branch"
  Write-Host "Endpoint: repos/$Owner/$Repo/branches/$Branch/protection"
  Write-Host "Payload:"
  Write-Host $json
}

function Apply-Rule {
  param(
    [string]$Owner,
    [string]$Repo,
    [string]$Branch,
    [hashtable]$Payload
  )

  $tmp = [System.IO.Path]::GetTempFileName()
  try {
    $Payload | ConvertTo-Json -Depth 10 | Set-Content -Path $tmp -Encoding UTF8
    $null = & gh api --method PUT "repos/$Owner/$Repo/branches/$Branch/protection" --header "Accept: application/vnd.github+json" --input $tmp
    if ($LASTEXITCODE -ne 0) {
      throw "gh api failed for branch '$Branch'"
    }
  } finally {
    if (Test-Path $tmp) { Remove-Item $tmp -Force }
  }
}

function Resolve-Token {
  param([string]$ExplicitToken)
  if ($ExplicitToken) { return $ExplicitToken }
  if ($env:GITHUB_TOKEN) { return $env:GITHUB_TOKEN }
  if ($env:GH_TOKEN) { return $env:GH_TOKEN }
  return ""
}

function Apply-RuleRest {
  param(
    [string]$Owner,
    [string]$Repo,
    [string]$Branch,
    [hashtable]$Payload,
    [string]$Token
  )

  $uri = "https://api.github.com/repos/$Owner/$Repo/branches/$Branch/protection"
  $headers = @{
    Authorization = "Bearer $Token"
    Accept = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
  }
  $body = $Payload | ConvertTo-Json -Depth 10
  $null = Invoke-RestMethod -Method Put -Uri $uri -Headers $headers -ContentType "application/json" -Body $body
}

function Get-RuleGh {
  param(
    [string]$Owner,
    [string]$Repo,
    [string]$Branch
  )
  $raw = & gh api "repos/$Owner/$Repo/branches/$Branch/protection" --header "Accept: application/vnd.github+json"
  if ($LASTEXITCODE -ne 0) {
    throw "gh api read failed for branch '$Branch'"
  }
  return ($raw | ConvertFrom-Json)
}

function Get-RuleRest {
  param(
    [string]$Owner,
    [string]$Repo,
    [string]$Branch,
    [string]$Token
  )
  $uri = "https://api.github.com/repos/$Owner/$Repo/branches/$Branch/protection"
  $headers = @{
    Authorization = "Bearer $Token"
    Accept = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
  }
  return (Invoke-RestMethod -Method Get -Uri $uri -Headers $headers)
}

function Show-CurrentProtection {
  param(
    [string]$Branch,
    $Rule
  )

  $checks = @()
  if ($Rule.required_status_checks) { $checks = @($Rule.required_status_checks.contexts) }
  $strict = if ($Rule.required_status_checks) { $Rule.required_status_checks.strict } else { $null }
  $approvals = if ($Rule.required_pull_request_reviews) { $Rule.required_pull_request_reviews.required_approving_review_count } else { $null }

  $enforceAdmins = $false
  if ($Rule.enforce_admins) {
    if ($Rule.enforce_admins.PSObject.Properties.Name -contains "enabled") {
      $enforceAdmins = [bool]$Rule.enforce_admins.enabled
    } else {
      $enforceAdmins = [bool]$Rule.enforce_admins
    }
  }

  $linear = $false
  if ($Rule.required_linear_history) {
    if ($Rule.required_linear_history.PSObject.Properties.Name -contains "enabled") {
      $linear = [bool]$Rule.required_linear_history.enabled
    } else {
      $linear = [bool]$Rule.required_linear_history
    }
  }

  $conversationResolution = $false
  if ($Rule.required_conversation_resolution) {
    if ($Rule.required_conversation_resolution.PSObject.Properties.Name -contains "enabled") {
      $conversationResolution = [bool]$Rule.required_conversation_resolution.enabled
    } else {
      $conversationResolution = [bool]$Rule.required_conversation_resolution
    }
  }

  Write-Host ""
  Write-Host "Branch: $Branch"
  Write-Host ("  strict-status-checks: {0}" -f $strict)
  Write-Host ("  required-checks: {0}" -f ($(if ($checks.Count -gt 0) { $checks -join ", " } else { "<none>" })))
  Write-Host ("  approvals-required: {0}" -f $approvals)
  Write-Host ("  enforce-admins: {0}" -f $enforceAdmins)
  Write-Host ("  linear-history: {0}" -f $linear)
  Write-Host ("  conversation-resolution: {0}" -f $conversationResolution)
}

function Get-RequiredChecks {
  param($Rule)
  if ($null -eq $Rule -or $null -eq $Rule.required_status_checks) { return @() }
  return @($Rule.required_status_checks.contexts)
}

function Compare-Checks {
  param(
    [string[]]$Expected,
    [string[]]$Actual
  )

  $exp = @($Expected | Where-Object { $_ } | Sort-Object -Unique)
  $act = @($Actual | Where-Object { $_ } | Sort-Object -Unique)
  $missing = @($exp | Where-Object { $act -notcontains $_ })
  $extra = @($act | Where-Object { $exp -notcontains $_ })

  return [pscustomobject]@{
    missing = $missing
    extra = $extra
    ok = ($missing.Count -eq 0 -and $extra.Count -eq 0)
  }
}

if (-not $Owner -or -not $Repo) {
  $resolved = Resolve-RepoFromRemote
  if ($resolved) {
    if (-not $Owner) { $Owner = $resolved.Owner }
    if (-not $Repo) { $Repo = $resolved.Repo }
  }
}

if (-not $Owner -or -not $Repo) {
  throw "Could not resolve owner/repo. Pass -Owner and -Repo explicitly."
}

$selectedModes = @($Apply, $ReadOnly, $Verify) | Where-Object { $_ } | Measure-Object
if ($selectedModes.Count -gt 1) {
  throw "Use only one mode at a time: -Apply or -ReadOnly or -Verify."
}

$mainPayload = New-ProtectionPayload -Contexts @(
  "backend",
  "frontend",
  "payroll-transition-smoke",
  "docker"
)

$developPayload = New-ProtectionPayload -Contexts @(
  "backend",
  "frontend",
  "payroll-transition-smoke"
)

if (-not $Apply -and -not $ReadOnly -and -not $Verify) {
  Write-Host "Dry run mode (no API calls)."
  Write-Host "Resolved repo: $Owner/$Repo"
  Show-Plan -Owner $Owner -Repo $Repo -Branch "main" -Payload $mainPayload
  Show-Plan -Owner $Owner -Repo $Repo -Branch "develop" -Payload $developPayload
  Write-Host ""
  Write-Host "To read current protection, run:"
  Write-Host "  .\apply_branch_protection.ps1 -Owner $Owner -Repo $Repo -ReadOnly"
  Write-Host "Or via REST token mode:"
  Write-Host "  .\apply_branch_protection.ps1 -Owner $Owner -Repo $Repo -ReadOnly -UseRest -GitHubToken <token>"
  Write-Host "To verify current settings against expected checks, run:"
  Write-Host "  .\apply_branch_protection.ps1 -Owner $Owner -Repo $Repo -Verify"
  Write-Host "Or via REST token mode:"
  Write-Host "  .\apply_branch_protection.ps1 -Owner $Owner -Repo $Repo -Verify -UseRest -GitHubToken <token>"
  Write-Host ""
  Write-Host "To apply, run:"
  Write-Host "  .\apply_branch_protection.ps1 -Owner $Owner -Repo $Repo -Apply"
  Write-Host "Or via REST token mode:"
  Write-Host "  .\apply_branch_protection.ps1 -Owner $Owner -Repo $Repo -Apply -UseRest -GitHubToken <token>"
  exit 0
}

if ($ReadOnly) {
  $token = Resolve-Token -ExplicitToken $GitHubToken
  $useGhRead = $false

  if ($UseRest) {
    if (-not $token) {
      throw "REST mode selected, but no token found. Pass -GitHubToken or set GITHUB_TOKEN."
    }
  } else {
    if (Get-Command gh -ErrorAction SilentlyContinue) {
      $useGhRead = $true
    } elseif ($token) {
      Write-Host "gh CLI not found, using REST API mode (token detected)."
    } else {
      throw "GitHub CLI (gh) not found. Install gh and run 'gh auth login', or use -UseRest with -GitHubToken."
    }
  }

  Write-Host "Reading branch protection for $Owner/$Repo ..."
  foreach ($branch in @("main", "develop")) {
    try {
      $rule = $null
      if ($useGhRead) {
        $rule = Get-RuleGh -Owner $Owner -Repo $Repo -Branch $branch
      } else {
        $rule = Get-RuleRest -Owner $Owner -Repo $Repo -Branch $branch -Token $token
      }
      Show-CurrentProtection -Branch $branch -Rule $rule
    } catch {
      $msg = $_.Exception.Message
      Write-Host ""
      Write-Host "Branch: $branch"
      Write-Host ("  error: {0}" -f $msg)
    }
  }
  Write-Host ""
  Write-Host "Done."
  exit 0
}

if ($Verify) {
  $token = Resolve-Token -ExplicitToken $GitHubToken
  $useGhRead = $false

  if ($UseRest) {
    if (-not $token) {
      throw "REST mode selected, but no token found. Pass -GitHubToken or set GITHUB_TOKEN."
    }
  } else {
    if (Get-Command gh -ErrorAction SilentlyContinue) {
      $useGhRead = $true
    } elseif ($token) {
      Write-Host "gh CLI not found, using REST API mode (token detected)."
    } else {
      throw "GitHub CLI (gh) not found. Install gh and run 'gh auth login', or use -UseRest with -GitHubToken."
    }
  }

  $expected = @{
    main = @("backend", "frontend", "payroll-transition-smoke", "docker")
    develop = @("backend", "frontend", "payroll-transition-smoke")
  }

  $allOk = $true
  Write-Host "Verifying branch protection for $Owner/$Repo ..."
  foreach ($branch in @("main", "develop")) {
    try {
      $rule = $null
      if ($useGhRead) {
        $rule = Get-RuleGh -Owner $Owner -Repo $Repo -Branch $branch
      } else {
        $rule = Get-RuleRest -Owner $Owner -Repo $Repo -Branch $branch -Token $token
      }
      $actualChecks = Get-RequiredChecks -Rule $rule
      $cmp = Compare-Checks -Expected $expected[$branch] -Actual $actualChecks
      if ($cmp.ok) {
        Write-Host ("PASS {0} checks match expected: {1}" -f $branch, ($expected[$branch] -join ", "))
      } else {
        $allOk = $false
        Write-Host ("FAIL {0} check mismatch" -f $branch)
        if ($cmp.missing.Count -gt 0) {
          Write-Host ("  missing: {0}" -f ($cmp.missing -join ", "))
        }
        if ($cmp.extra.Count -gt 0) {
          Write-Host ("  extra: {0}" -f ($cmp.extra -join ", "))
        }
      }
    } catch {
      $allOk = $false
      Write-Host ("FAIL {0} verify error: {1}" -f $branch, $_.Exception.Message)
    }
  }

  if (-not $allOk) {
    Write-Host "Verification failed."
    exit 1
  }
  Write-Host "Verification passed."
  exit 0
}

if ($UseRest) {
  $token = Resolve-Token -ExplicitToken $GitHubToken
  if (-not $token) {
    throw "REST mode selected, but no token found. Pass -GitHubToken or set GITHUB_TOKEN."
  }
  Write-Host "Applying branch protection for $Owner/$Repo via REST API ..."
  Apply-RuleRest -Owner $Owner -Repo $Repo -Branch "main" -Payload $mainPayload -Token $token
  Write-Host "Applied: main"
  Apply-RuleRest -Owner $Owner -Repo $Repo -Branch "develop" -Payload $developPayload -Token $token
  Write-Host "Applied: develop"
  Write-Host "Done."
  exit 0
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  $token = Resolve-Token -ExplicitToken $GitHubToken
  if ($token) {
    Write-Host "gh CLI not found, switching to REST API mode (token detected)."
    Write-Host "Applying branch protection for $Owner/$Repo via REST API ..."
    Apply-RuleRest -Owner $Owner -Repo $Repo -Branch "main" -Payload $mainPayload -Token $token
    Write-Host "Applied: main"
    Apply-RuleRest -Owner $Owner -Repo $Repo -Branch "develop" -Payload $developPayload -Token $token
    Write-Host "Applied: develop"
    Write-Host "Done."
    exit 0
  }
  throw "GitHub CLI (gh) not found. Install gh and run 'gh auth login', or use -UseRest with -GitHubToken."
}

Write-Host "Applying branch protection for $Owner/$Repo ..."
Apply-Rule -Owner $Owner -Repo $Repo -Branch "main" -Payload $mainPayload
Write-Host "Applied: main"
Apply-Rule -Owner $Owner -Repo $Repo -Branch "develop" -Payload $developPayload
Write-Host "Applied: develop"
Write-Host "Done."
