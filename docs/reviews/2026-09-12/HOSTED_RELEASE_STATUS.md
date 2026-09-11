# Hosted release status — PR 642

Release: https://github.com/StatCosol/app/pull/642
Production has not been changed.

The first hosted pass succeeded for backend, frontend, Android build, face-service tests, Semgrep and CodeQL. Dependency audits, filesystem/image vulnerability scans and the history secret scan failed. Main also requires one approving review.

Security findings require remediation before deployment:
- Backend/frontend dependencies and container OS packages have reported vulnerabilities. Do not force npm's suggested major upgrades/downgrades without compatibility validation.
- The frontend image runs as root; a non-root container change needs runtime/ingress validation.
- Face-service Pillow is flagged; the report lists 12.3.0 as the patched release.
- Nine history-scan findings include JWTs, a private-key file in historical commit 3ced35a1, report credentials, and a newly added placeholder. No detected credential values are included here. The example encryption-key placeholder is changed to an empty required value to eliminate that false positive. Real historical credentials need owner verification and revocation/rotation if still valid. Do not rewrite shared history or suppress findings to force a pass.

Compatible npm remediation updated frontend and root lockfiles. Frontend build and 217 browser tests passed. A backend attempt broke the sanitizer suite because its parser dependency switched module format; that attempted backend lock update was reverted to the reviewed release version. Remaining backend remediation requires targeted dependency work.

Local scanner artifacts are retained in hosted-audit/ and are excluded from the pull request. No auto-merge or review bypass was enabled. The existing production images remain on commit 488fed40ba33189b9cebf0ccbc8d881e300649fe.
