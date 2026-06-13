# Face Attendance System - Quick Operations Guide

Last updated: 2026-06-13
Status: Stop live shared-kiosk attendance until fixes are validated

## Current System Status

Shared-kiosk face attendance is blocked for production use.

Issue: one employee's face has been accepted for another employee, and some employees are failing due to beard/moustache changes, dark lighting, or stale duplicate data.

Action: keep `FACE_KIOSK_LIVE_ATTENDANCE_ENABLED=false` until the backend, kiosk APK, lighting, cleanup, and re-enrollment validation all pass.

## What Employees Use During Stop

- ESS/mobile app if already approved.
- Manual attendance in web/admin process.
- Fingerprint/PIN/device attendance if available.
- Temporary paper sign-in only if approved by HR.

## Immediate Stop

Set:

```bash
FACE_KIOSK_LIVE_ATTENDANCE_ENABLED=false
```

Expected result:

- Kiosk roster contains no usable shared-kiosk face enrollments.
- Kiosk punch submission is rejected by the backend.
- No shared-kiosk face attendance reaches payroll.

## Safe Validation Configuration

Use this while testing the hotfix:

```bash
FACE_KIOSK_LIVE_ATTENDANCE_ENABLED=false
FACE_KIOSK_ACTIVATION_DELAY_MIN=15
FACE_MIN_MATCH_SCORE=0.90
FACE_MIN_QUALITY_SCORE=0.75
FACE_DUPLICATE_THRESHOLD=0.88
FACE_LIVENESS_CHALLENGE_REQUIRED=true
FACE_PUNCH_REQUIRE_SERVER_PROBE=true
```

Do not set `FACE_KIOSK_LIVE_ATTENDANCE_ENABLED=true` until the acceptance checklist passes.

## Kiosk Setup Checklist

- Camera at face height.
- Employee stands 0.6 to 1.2 meters from camera.
- Floor standing mark applied.
- Plain background behind employee.
- Front LED fill light installed.
- No sunlight or backlight behind employee.
- No strong shadows on face.
- Camera focus verified before enrollment.
- Same lighting used for all employees.

## Enrollment Checklist

- Capture 7 frames.
- Face centered and clear.
- Both eyes visible.
- No mask, cap, hand, or heavy shadow covering the face.
- One face only.
- No dark, blurred, or overexposed frame.
- Current appearance captured: beard, moustache, spectacles if applicable.
- Admin reviews enrollment quality before live use.

## Re-Enroll Problem Employees

Prioritize:

- Employees wrongly matched as another employee.
- Employees with duplicate warnings.
- Employees with dark-skin false duplicate failures.
- Employees with beard, moustache, or spectacles changes.
- Employees enrolled immediately before wrong attendance capture.

Re-enrollment steps:

1. Delete wrong/stale enrollment only after backup and admin review.
2. Bring employee to kiosk under fixed lighting.
3. Capture with current appearance, not forced clean shave unless that is the employee's normal work appearance.
4. Confirm 7 frames are collected.
5. Verify no duplicate warning appears.
6. Keep live kiosk attendance disabled during testing.
7. Test recognition before shift rush.

## VEIHAY Cleanup

Dry run first:

```bash
cd backend
node scripts/cleanup-veihay-pending-face-data.js
```

Execute only after reviewing dry-run output:

```bash
cd backend
node scripts/cleanup-veihay-pending-face-data.js --execute
```

The script protects the enrolled VEIHAY codes and clears only stale face/cache data for pending VEIHAY codes.

## SQL Checks

### Recent Duplicate Attempts

```sql
SELECT
  d.attempted_at,
  ae.employee_code AS attempting_code,
  ae.name AS attempting_name,
  me.employee_code AS matched_code,
  me.name AS matched_name,
  d.match_score,
  d.source
FROM face_duplicate_attempt_logs d
LEFT JOIN employees ae ON ae.id = d.attempting_employee_id
LEFT JOIN employees me ON me.id = d.matched_employee_id
WHERE d.client_id = '<client_id>'
  AND d.attempted_at >= now() - interval '24 hours'
ORDER BY d.attempted_at DESC;
```

### Recent Failed Face Scans

```sql
SELECT
  attempted_at,
  employee_code,
  employee_id,
  contractor_employee_id,
  reason,
  reason_detail,
  match_score,
  liveness_score,
  device_id
FROM face_failed_scan_logs
WHERE client_id = '<client_id>'
  AND attempted_at >= now() - interval '24 hours'
ORDER BY attempted_at DESC;
```

### Appearance Drift Flags

```sql
SELECT
  e.employee_code,
  e.name,
  fe.appearance_drift_flagged_at,
  fe.appearance_drift_avg_score,
  fe.appearance_drift_sample_count
FROM face_enrollments fe
JOIN employees e ON e.id = fe.employee_id
WHERE fe.client_id = '<client_id>'
  AND fe.appearance_drift_flagged_at IS NOT NULL
ORDER BY fe.appearance_drift_flagged_at DESC;
```

### Activation Hold Check

```sql
SELECT
  e.employee_code,
  e.name,
  fe.enrolled_at,
  now() - fe.enrolled_at AS enrollment_age
FROM face_enrollments fe
JOIN employees e ON e.id = fe.employee_id
WHERE fe.client_id = '<client_id>'
  AND fe.is_active = true
ORDER BY fe.enrolled_at DESC;
```

## Acceptance Tests Before Re-Enable

- Same employee cannot enroll under two employee codes.
- Similar-looking employees do not cross-match.
- Dark-skin employees enroll without false duplicate warning under kiosk lighting.
- Beard/moustache employee enrolls and punches under current appearance.
- Employee cannot punch during activation hold.
- Punch without liveness nonce is rejected.
- Enrollment submit without liveness nonce is rejected.
- Low confidence is rejected, not marked present.
- Failed scans and duplicate attempts are logged.
- Kiosk works during shift-start queue without stale roster matches.

## Not Yet Implemented

The following items are documented as target behavior but are not part of the current hotfix:

- Manual-review punch status for medium confidence scores.
- Multi-image enrollment table with separate angle embeddings.
- Advanced face-svc quality metrics for blur, exposure, face size, head pose, and multiple faces.

Until these are implemented, do not run test cases that expect `MANUAL_REVIEW` punch responses or manual-review endpoints.

## Troubleshooting

### Face Not Recognized

Check:

```sql
SELECT e.employee_code, e.name, fe.is_active, fe.enrolled_at
FROM face_enrollments fe
JOIN employees e ON e.id = fe.employee_id
WHERE fe.employee_id = '<employee_id>';
```

If no active row exists, re-enroll. If the enrollment is inside activation hold, wait or use manual attendance.

### Face Already Registered

Check:

```sql
SELECT
  d.attempted_at,
  ae.employee_code AS attempting_code,
  me.employee_code AS matched_code,
  d.match_score
FROM face_duplicate_attempt_logs d
LEFT JOIN employees ae ON ae.id = d.attempting_employee_id
LEFT JOIN employees me ON me.id = d.matched_employee_id
WHERE d.attempting_employee_id = '<employee_id>'
   OR d.matched_employee_id = '<employee_id>'
ORDER BY d.attempted_at DESC
LIMIT 10;
```

If it is the same person under two codes, delete the wrong enrollment and keep only the correct employee code. If it is two different people, keep kiosk disabled and retest lighting/model thresholds.

## Rollback

If any wrong-person attendance is observed:

```bash
FACE_KIOSK_LIVE_ATTENDANCE_ENABLED=false
```

Then:

1. Stop shared-kiosk use.
2. Export failed-scan and duplicate logs.
3. Identify affected employee codes.
4. Correct or delete stale enrollment data only after backup.
5. Re-enroll affected employees under controlled lighting.
6. Re-run acceptance tests before any re-enable.

## Re-Enable Rule

Only re-enable after written approval from operations, HR, QA, and engineering:

```bash
FACE_KIOSK_LIVE_ATTENDANCE_ENABLED=true
```

Monitor duplicate attempts, failed scans, and payroll attendance for at least 48 hours after re-enable.
