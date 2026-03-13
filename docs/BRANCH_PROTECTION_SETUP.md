# Branch Protection Setup

This repository now has CI checks:
- `backend`
- `frontend`
- `payroll-transition-smoke` (runs only when payroll-related files change; skipped otherwise)
- `docker` (runs only on `main`)

Use two separate branch rules.

## Rule 1: `main`
Configure in GitHub:
`Settings -> Branches -> Add branch protection rule`

- Branch name pattern: `main`
- Enable: `Require a pull request before merging`
- Enable: `Require status checks to pass before merging`
- Required checks:
  - `backend`
  - `frontend`
  - `payroll-transition-smoke`
  - `docker`
- Enable: `Require branches to be up to date before merging`
- Optional recommended:
  - `Require conversation resolution before merging`
  - `Require linear history`
  - `Do not allow bypassing the above settings`

## Rule 2: `develop`
Configure in GitHub:
`Settings -> Branches -> Add branch protection rule`

- Branch name pattern: `develop`
- Enable: `Require a pull request before merging`
- Enable: `Require status checks to pass before merging`
- Required checks:
  - `backend`
  - `frontend`
  - `payroll-transition-smoke`
- Do **not** require `docker` here (it only runs on `main`)
- Enable: `Require branches to be up to date before merging`

## Notes
- `payroll-transition-smoke` is gated by path filter in CI. If payroll files are not touched, the job is skipped and should not block merge.
- If a required check name does not appear in GitHub UI initially, run one PR once so GitHub registers the check name.

## Optional: Configure via `gh` CLI
Replace `<owner>` and `<repo>`:

```bash
# main
gh api -X PUT repos/<owner>/<repo>/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -f required_status_checks.strict=true \
  -f required_status_checks.contexts[]="backend" \
  -f required_status_checks.contexts[]="frontend" \
  -f required_status_checks.contexts[]="payroll-transition-smoke" \
  -f required_status_checks.contexts[]="docker" \
  -F enforce_admins=true \
  -f required_pull_request_reviews.dismiss_stale_reviews=true \
  -f required_pull_request_reviews.required_approving_review_count=1 \
  -F restrictions=

# develop
gh api -X PUT repos/<owner>/<repo>/branches/develop/protection \
  -H "Accept: application/vnd.github+json" \
  -f required_status_checks.strict=true \
  -f required_status_checks.contexts[]="backend" \
  -f required_status_checks.contexts[]="frontend" \
  -f required_status_checks.contexts[]="payroll-transition-smoke" \
  -F enforce_admins=true \
  -f required_pull_request_reviews.dismiss_stale_reviews=true \
  -f required_pull_request_reviews.required_approving_review_count=1 \
  -F restrictions=
```

## Optional: Use Repo Script
From repository root:

```powershell
# Dry-run (shows payloads and resolved owner/repo)
.\apply_branch_protection.ps1

# Read current protection (gh mode)
.\apply_branch_protection.ps1 -Owner <owner> -Repo <repo> -ReadOnly

# Read current protection (REST token mode)
.\apply_branch_protection.ps1 -Owner <owner> -Repo <repo> -ReadOnly -UseRest -GitHubToken <token>

# Verify current required checks match expected (gh mode)
.\apply_branch_protection.ps1 -Owner <owner> -Repo <repo> -Verify

# Verify current required checks match expected (REST token mode)
.\apply_branch_protection.ps1 -Owner <owner> -Repo <repo> -Verify -UseRest -GitHubToken <token>

# Apply rules via gh CLI mode
.\apply_branch_protection.ps1 -Apply

# Or explicitly pass repository
.\apply_branch_protection.ps1 -Owner <owner> -Repo <repo> -Apply

# Apply rules via REST token mode (no gh dependency)
.\apply_branch_protection.ps1 -Owner <owner> -Repo <repo> -Apply -UseRest -GitHubToken <token>

# Or set environment token and run REST mode
$env:GITHUB_TOKEN="<token>"
.\apply_branch_protection.ps1 -Owner <owner> -Repo <repo> -Apply -UseRest
```

Prerequisites:
- Either:
  - `gh` installed and authenticated (`gh auth login`), or
  - a GitHub token with repository admin permission (`repo` + branch protection admin scope)
- permission to manage branch protection settings
