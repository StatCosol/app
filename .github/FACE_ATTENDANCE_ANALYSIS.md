# Face Attendance System - Analysis And Remediation Plan

Date: 2026-06-13
Severity: Critical

## Root Causes

### 1. Wrong Employee Acceptance

The kiosk performs shared-roster matching on device, then submits a claimed employee to the server. If the local best match is wrong or ambiguous, attendance can be recorded against the wrong employee unless the server rejects it.

Mitigations now applied:

- Server-side probe re-verification remains mandatory by default.
- Auto-accept threshold is raised to 0.90.
- Device-side ambiguity margin is raised to 0.08.
- Live kiosk attendance is stopped by default until retesting passes.

### 2. Clean-Shave Dependency

A single face template is weak against appearance changes. Beard, moustache, spectacles, hairstyle, and lighting can move the probe embedding away from the stored enrollment.

Short-term mitigation:

- Capture 7 enrollment frames.
- Re-enroll affected employees with current appearance.
- Use fixed lighting and camera distance.

Long-term remediation:

- Add multi-image enrollment storage for front, slight left, slight right, up/down, spectacles, and current facial-hair state.

### 3. Dark-Skin False Duplicates

The most likely contributors are poor exposure, shadows, face model weakness, and low-quality single-template enrollments. Megapixels alone do not solve this.

Required operational controls:

- Add front LED fill light at kiosk.
- Avoid backlight and strong shadows.
- Keep camera at face height.
- Mark employee standing position.
- Reject dark, blurred, overexposed, and multi-face enrollment captures.

### 4. Immediate Attendance After Enrollment

Immediate activation lets a bad enrollment template cause attendance before an admin can catch it.

Mitigation now applied:

- Kiosk roster filters out enrollments inside activation hold.
- Kiosk punch endpoint rejects enrollments inside activation hold.
- Default hold is 5 minutes, configurable by `FACE_KIOSK_ACTIVATION_DELAY_MIN`.

### 5. Stale Pending Data And Cache

Pending employee codes must not leave stale face enrollment rows, duplicate logs, re-enrollment requests, or kiosk tickets that affect future enrollment.

Mitigation now included:

- `backend/scripts/cleanup-veihay-pending-face-data.js`
- Dry-run by default.
- Protects enrolled VEIHAY codes.
- Clears only pending-code stale face data when run with `--execute`.

## Production Policy

Do not use live shared-kiosk attendance until all of these pass:

- No duplicate enrollment warnings for known distinct employees.
- No wrong-person acceptances in controlled testing.
- Dark-skin employees enroll and punch successfully under kiosk lighting.
- Beard/moustache and spectacles cases are tested.
- Newly enrolled employee cannot punch during activation hold.
- Failed and duplicate logs are reviewed.

## Remaining Engineering Work

- Enrollment liveness enforcement.
- Advanced quality metrics from face service: blur, exposure, multiple faces, face size, head pose, eye visibility.
- Manual review queue for medium-confidence scores.
- Multi-image enrollment schema.
- Appearance drift detection and re-enrollment workflow.

