# Security Operations Runbooks — statcompy

> **Audience:** Platform owner / DevOps engineer with `Owner` rights on RG `statcompy-rg` and write access to the GitHub repo.
>
> **Tone:** every command in this file is destructive in production. Read the whole runbook first, then execute step by step. Do **not** copy-paste blocks larger than a single command.

---

## 0. Pre-flight (run once, before any of the below)

```powershell
# Backup current Container App revisions (lets you roll back env vars)
az containerapp revision list -g statcompy-rg -n statcompy-backend  -o table > backup-be-revisions.txt
az containerapp revision list -g statcompy-rg -n statcompy-frontend -o table > backup-fe-revisions.txt

# Snapshot current secrets (names only — values are not exported)
az containerapp secret list -g statcompy-rg -n statcompy-backend  --query "[].name" -o tsv > backup-be-secret-names.txt
az containerapp secret list -g statcompy-rg -n statcompy-frontend --query "[].name" -o tsv > backup-fe-secret-names.txt

# Take a logical backup of the Postgres DB (point-in-time backup is also auto-enabled
# for Azure Flexible Server; this is an extra safety net)
$ts = Get-Date -Format "yyyyMMdd-HHmm"
pg_dump --host=<DB_HOST> --port=5432 --username=Statcocompy --dbname=statcompy `
        --no-owner --no-privileges --format=custom `
        --file=statcompy-backup-$ts.dump

# Mirror-clone the repo (full history snapshot before any rewrite)
git clone --mirror https://github.com/<org>/statcompy.git statcompy-mirror-$ts.git
```

Verify backups exist before proceeding.

---

## 1. TLS hardening verification (NO destructive action — already in code)

Code change is in [Dockerfile](../backend/Dockerfile) (adds `ca-certificates`, sets default `DB_SSL_CA_PATH=/etc/ssl/certs/ca-certificates.crt`). On the next image rebuild, node-postgres will validate the Azure Postgres server cert chain.

**Verify after next deploy:**

```powershell
# Tail backend logs and look for either:
#   - normal startup ("Nest application successfully started")  → TLS works
#   - "self-signed certificate in chain" / "unable to verify"   → CA bundle missing
az containerapp logs show -g statcompy-rg -n statcompy-backend --tail 200 --follow
```

If verification fails, immediate rollback:

```powershell
az containerapp update -g statcompy-rg -n statcompy-backend `
    --set-env-vars DB_SSL_CA_PATH=""
```

(Empty value falls back to the legacy `rejectUnauthorized:false` path while you debug.)

---

## 2. Secret rotation (DESTRUCTIVE — affects production)

> **Confirmed leaks (commit `1994886`, file `backend-app.yaml`):**
> | Env var | Leaked value (must be rotated) | Section |
> |---------|-------------------------------|---------|
> | `DB_PASS` | `Statco@123` | 2a |
> | `JWT_SECRET` | `MDQ0YmRhYzEt…` (full base64 string in commit) | 2b |
> | `AI_ENCRYPTION_KEY` | `3ad671a3965c…` (64-char hex in commit) | 2c |
> | `SMTP_PASS` | `SX8xUKrhXzwS` (Zoho `it_admin@statcosol.com`) | 2d |
>
> The current `backend-app.yaml` (commit `6e4c44d`) is sanitized — only `secretRef:` references remain. The leak risk is **historical** and is closed permanently only by completing both (a) rotation below AND (b) the §3 git history purge.

### 2a. Rotate Postgres password

```powershell
# 1. Generate a strong password (32 chars, no shell-special chars)
$newDbPass = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})

# 2. Update the password on the Flexible Server
az postgres flexible-server update -g statcompy-rg -n <pg-server-name> `
    --admin-password "$newDbPass"

# 3. Update the Container App secret
az containerapp secret set -g statcompy-rg -n statcompy-backend `
    --secrets db-pass="$newDbPass"

# 4. Trigger a new revision so the env picks up the secret
az containerapp update -g statcompy-rg -n statcompy-backend `
    --revision-suffix rot-$(Get-Date -Format yyyyMMddHHmm)
```

### 2b. Rotate `JWT_SECRET`

> **Side effect:** every issued access + refresh token is invalidated. All users (including ESS) must log in again. Schedule for low-usage window.

```powershell
$newJwt = -join ((48..57)+(65..90)+(97..122)+(33..47) | Get-Random -Count 64 | % {[char]$_})

az containerapp secret set -g statcompy-rg -n statcompy-backend `
    --secrets jwt-secret="$newJwt"

az containerapp update -g statcompy-rg -n statcompy-backend `
    --revision-suffix jwt-rot-$(Get-Date -Format yyyyMMddHHmm)
```

### 2c. Rotate `AI_ENCRYPTION_KEY`

> **WARNING:** if any data at rest is encrypted with the current key, rotating without re-encrypting the data will make it unrecoverable. Audit usages of this key first:
>
> ```powershell
> Select-String -Path "backend/src/**/*.ts" -Pattern "AI_ENCRYPTION_KEY" -SimpleMatch
> ```
>
> If only used for in-flight payloads (no persisted ciphertext) → safe to rotate. Otherwise build a re-encrypt migration first.

```powershell
$newAiKey = -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 32 | % {[char]$_})
az containerapp secret set -g statcompy-rg -n statcompy-backend `
    --secrets ai-encryption-key="$newAiKey"
az containerapp update -g statcompy-rg -n statcompy-backend `
    --revision-suffix ai-rot-$(Get-Date -Format yyyyMMddHHmm)
```

### 2d. Rotate SMTP credentials, ACR pull tokens, any other `secretRef:` entries in `backend-app.yaml`

Rotate **`SMTP_PASS`** for `it_admin@statcosol.com` first — generate a new app password in the Zoho admin console, then:

```powershell
az containerapp secret set -g statcompy-rg -n statcompy-backend `
    --secrets smtp-pass="<new-zoho-app-password>"
az containerapp update -g statcompy-rg -n statcompy-backend `
    --revision-suffix smtp-rot-$(Get-Date -Format yyyyMMddHHmm)
```

Same pattern for any per-mailbox SMTP creds (`SMTP_FINANCE_PASS`, `SMTP_AUDIT_PASS`, `SMTP_PAYROLL_PASS`) if they were ever committed.

### 2e. Post-rotation smoke test

```powershell
# Auth still works
curl.exe -X POST https://app.statcosol.com/api/v1/auth/login `
    -H "Content-Type: application/json" `
    -d '{"email":"<test-user>","password":"<test-pass>"}'

# Health
curl.exe https://app.statcosol.com/api/v1/health
```

---

## 3. Git history purge (DESTRUCTIVE — rewrites history, requires force push)

### 3a. Pre-conditions (do not skip)

1. Section 2 (secret rotation) is **complete and verified**. Once secrets are rotated, the leaked plaintext in git history is just an audit-trail entry, not an active vulnerability — but purge is still recommended for compliance/SOC-2.
2. Notify all developers in writing. After force push everyone must re-clone or hard-reset their local copy.
3. Pause CI / deploy pipelines that pull from `main` for the duration.
4. Identify the offending file(s):

```powershell
# Files known to have contained plaintext secrets
$bad = @(
    "backend-app.yaml"
    # add any other .env / .yaml / .ps1 / .json found via:
    # gitleaks detect --report-path gitleaks.json
)
```

### 3b. Execute the purge using `git-filter-repo` (preferred) or BFG

```powershell
# Install git-filter-repo once
pip install git-filter-repo

# Work on a fresh clone (NOT your normal working copy)
git clone --no-local https://github.com/<org>/statcompy.git statcompy-purge
cd statcompy-purge

# Purge the file from all history
git filter-repo --invert-paths --path backend-app.yaml --force

# Optionally replace specific leaked literal strings everywhere
@"
Statco@123==>***REMOVED***
MDQ0YmRhYzEtYjY4Ni00Yzk0LTg0ZWEtOTI5OTA0MTc4MzBmYTkzNmUxZjEtZDE3==>***REMOVED***
3ad671a3965c95e405800ab3fd75813025f2d79b904fafe5d59682270d3308df==>***REMOVED***
SX8xUKrhXzwS==>***REMOVED***
"@ | Out-File -Encoding ascii replacements.txt
git filter-repo --replace-text replacements.txt --force
```

### 3c. Force-push to GitHub

```powershell
# Re-add remote (filter-repo strips it for safety)
git remote add origin https://github.com/<org>/statcompy.git

# Push all branches + tags, overwriting remote history
git push origin --force --all
git push origin --force --tags
```

### 3d. Post-purge

1. **Invalidate forks/PRs:** any open PR built off pre-rewrite commits will need to be rebased.
2. **Purge GitHub caches:** open a support ticket — `https://support.github.com/contact?subject=Sensitive%20Data%20Removal` — to invalidate cached views and pull-request diffs that retain the old SHAs.
3. **Re-clone for every developer:**
   ```powershell
   cd .. ; Remove-Item -Recurse -Force statcompy-old
   git clone https://github.com/<org>/statcompy.git
   ```
4. **Rotate any GitHub PATs, deploy keys, or webhook secrets** that may have been logged alongside.
5. Add `backend-app.yaml` (and any other secret-bearing file) to `.gitignore`; commit a sanitized template (`backend-app.template.yaml`) instead.
6. Enable [GitHub Secret Scanning + Push Protection](https://docs.github.com/en/code-security/secret-scanning/push-protection-for-repositories-and-organizations) on the repo so this can never happen again.

---

## 4. Deferred (do **not** execute now)

* **Redis sidecar / distributed cache** — only needed when scaling backend > 1 replica or adding session-shared state. Current in-memory login lockout (auth.service.ts) is correct for single-replica.
* **ClamAV sidecar for upload AV scan** — current magic-byte + MIME allowlist is sufficient for current threat model. Add ClamAV when accepting uploads from untrusted public users.
* **Azure Blob Storage with SAS URLs** for uploads — current local volume in Container App is durable but does not survive RG deletion. Move to Blob when storage > 50GB or multi-region needed.

---

## 5. Schedule

| Step          | Window                | Approver       |
|---------------|----------------------|----------------|
| Pre-flight backups | Anytime         | DevOps         |
| TLS verify    | Next deploy           | DevOps         |
| 2a DB password | Off-hours (~2 min downtime risk) | CTO       |
| 2b JWT rotate | Off-hours (forces re-login of all users) | CTO |
| 2c AI key     | After audit of usages | CTO            |
| 3 git purge   | After all rotations confirmed | CTO + all devs notified |
