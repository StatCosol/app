# Leaked credentials in git history

Status: **revocation outstanding**. Last reviewed 2026-09-12.

This repository is public. Eight secrets were committed between 2026-02-01 and
2026-03-13. All but one are deleted from the tip of `main`, but every commit
that carries them is reachable from `main`, so anyone who clones the repository
still receives them.

They were not detected at the time because the secret scan was not running.

## Why they were not caught

From 2026-06-08 (`0abd88c7`) until 2026-09-12 (#642), every job in
`.github/workflows/security.yml` was a stub:

```yaml
- name: Gitleaks check
  run: echo "gitleaks reporting disabled for required-check stability"
```

Six jobs were stubbed this way: npm audit, Semgrep, gitleaks, Trivy filesystem,
Trivy image and CodeQL. Each reported success for about three months while
scanning nothing. #642 restored them, and gitleaks failed on its first real run.

The lesson worth keeping: a required check keeps its name and its green tick
when its body is replaced by an `echo`. The status list is not evidence that a
tool ran.

## What leaked

| # | Item | Commit | Date | Severity |
|---|---|---|---|---|
| 1 | `statco-branch-protection-app.2026-03-11.private-key.pem` | `3ced35a1` | 2026-03-13 | **Critical** |
| 2 | Access and refresh tokens in `paydek_transition_results.txt` | `3ced35a1` | 2026-03-13 | Medium |
| 3 | Session token in `.claude/settings.local.json` | `4a7e2987` | 2026-02-21 | Medium |
| 4 | Session token in `.claude/settings.local.json` | `cd430a31` | 2026-02-17 | Medium |
| 5 | Access token in `ENDPOINT_TESTING_REPORT.md` | `cd430a31` | 2026-02-17 | Medium |
| 6 | Access token in `THOROUGH_TESTING_REPORT.md` | `cd430a31` | 2026-02-17 | Medium |
| 7 | NestJS starter README CircleCI badge | `8949cb49` | 2026-02-01 | False positive |

Item 1 is a complete 2048-bit RSA private key, 1679 bytes, for the GitHub App
named `statco-branch-protection-app`. Judging by that name it administers the
branch protection rules that gate every merge in this project. Anyone holding
this key can mint installation tokens for that App and act with its permissions.

Items 2 to 6 are signed JWTs captured in test output and pasted into committed
reports. They do not expose the signing secret and have long since expired, but
they show credentials were routinely written into tracked files.

Item 7 is the stock NestJS starter README's shields.io badge URL. It is not a
secret. It is baselined rather than excluded so that the rule stays active for
real findings in README files.

## Required actions

- [ ] **Regenerate the `statco-branch-protection-app` private key.** GitHub App
      settings, "Private keys", generate a new one and delete the old. This is
      the only action that actually retracts item 1, and it takes effect
      immediately. Update wherever the App's key is configured.
- [ ] **Rotate the JWT signing secret** (`jwt-secret` in Azure Container Apps).
      Already outstanding from the September external review as F09. Rotating
      invalidates every refresh token, so expect users to sign in again.
- [ ] **Decide whether this repository should be public.** It serves payroll and
      statutory compliance data. Public visibility is what turns each item above
      from an internal mistake into a disclosure.

## What was deliberately not done

History was not rewritten. For a public repository, rewriting breaks every
existing clone and fork while retracting nothing, because the blobs have already
been distributed. Revocation at the source is the fix; removing evidence of the
leak is not.

## How the scan stays useful

`.gitleaks-baseline.json` records these eight findings so the job can pass on a
clean tree. Anything added from now on produces a different fingerprint and
fails the build. The baseline is generated with `--redact`, so it contains no
secret material.

To regenerate it after a legitimate new baseline decision:

```bash
gitleaks git --redact --report-format json --report-path .gitleaks-baseline.json .
```

Review every entry before committing a regenerated baseline. Adding a finding
here is a decision not to fix it.
