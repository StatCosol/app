# Face Attendance System - Implementation Notes

Date: 2026-06-13

## Hotfix Scope

This hotfix focuses on immediate production safety:

- Stop shared-kiosk live attendance by default.
- Raise matching and liveness thresholds.
- Improve enrollment capture count.
- Enforce activation hold in roster and punch path.
- Provide safe cleanup tooling for pending VEIHAY face data.
- Fix migration ordering issues found during DB review.

## Backend Changes

File: `backend/src/mobile-attendance/mobile-attendance.service.ts`

- Added `FACE_KIOSK_LIVE_ATTENDANCE_ENABLED`, default `false`.
- Added `FACE_KIOSK_ACTIVATION_DELAY_MIN`, default `15`.
- Raised default `FACE_MIN_MATCH_SCORE` to `0.90`.
- Raised liveness gate to `0.7`.
- Raised duplicate threshold default to `0.88`.
- Kiosk roster returns no live face enrollments while the stop switch is off.
- Kiosk roster hides enrollments inside activation hold.
- Employee and contractor kiosk punches are rejected while the stop switch is off.
- Employee and contractor kiosk punches are rejected inside activation hold.

## Android Kiosk Changes

Files:

- `mobile/app/src/main/java/com/statcosol/attendance/face/RosterMatcher.kt`
- `mobile/app/src/main/java/com/statcosol/attendance/ui/KioskActivity.kt`
- `mobile/app/src/main/java/com/statcosol/attendance/ui/EnrollActivity.kt`

Changes:

- 1:N match threshold: `0.90`.
- Best-vs-second ambiguity margin: `0.08`.
- Liveness threshold: `0.7`.
- Kiosk enrollment frames: `7`.
- Enrollment frame interval: `600 ms`.
- Enrollment consistency cosine: `0.72`.

## Database/Migration Fixes

Files:

- `backend/migrations/20260526_face_appearance_drift.sql`
- `backend/migrations/20260527_face_audit_ip_ua.sql`
- `backend/migrations/20260627_contractor_face_enrollments.sql`
- `backend/migrations/20260712_contractor_biometric_punches.sql`

Changes:

- Guarded older migrations that referenced contractor tables before creation.
- Added contractor drift/audit columns directly to contractor table creation migrations.

## VEIHAY Cleanup

Script:

```bash
node backend/scripts/cleanup-veihay-pending-face-data.js
```

Dry-run only by default.

Execute mode:

```bash
node backend/scripts/cleanup-veihay-pending-face-data.js --execute
```

The script protects enrolled codes and targets only the pending VEIHAY codes listed in the production incident.

## Verification Completed

- Backend build passed.
- Backend Jest suite passed: 60 suites, 136 tests.
- Scoped ESLint passed on changed TypeScript files.
- Android kiosk Kotlin compile passed.
- VEIHAY cleanup dry run passed locally; local DB had no VEIHAY rows.

## Deployment Notes

Deploy backend and kiosk APK together. Keep:

```bash
FACE_KIOSK_LIVE_ATTENDANCE_ENABLED=false
```

until QA signs off.
