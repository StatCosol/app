# Face Attendance System - Quick Operations Guide

Last updated: 2026-06-13
Status: Stop live kiosk attendance until fixes are validated

## Immediate Stop

Set:

```bash
FACE_KIOSK_LIVE_ATTENDANCE_ENABLED=false
```

Expected result:

- Kiosk roster contains no usable shared-kiosk face enrollments.
- Kiosk punch submission is rejected.
- Attendance must be handled by manual, ESS, fingerprint, PIN, or another approved fallback.

## Safe Validation Configuration

```bash
FACE_KIOSK_LIVE_ATTENDANCE_ENABLED=false
FACE_KIOSK_ACTIVATION_DELAY_MIN=5
FACE_MIN_MATCH_SCORE=0.90
FACE_MIN_FACE_QUALITY_SCORE=0.75
FACE_DUPLICATE_THRESHOLD=0.88
FACE_LIVENESS_CHALLENGE_REQUIRED=true
FACE_PUNCH_REQUIRE_SERVER_PROBE=true
```

## Kiosk Setup Checklist

- Camera at face height.
- Employee stands 0.6 to 1.2 meters from camera.
- Floor standing mark applied.
- Plain background behind employee.
- Front LED fill light installed.
- No sunlight/backlight behind employee.
- No strong shadows on face.
- Camera focus verified before enrollment.

## Enrollment Checklist

- Capture 7 frames.
- Face centered and clear.
- Both eyes visible.
- No mask/cap/hand obstruction.
- One face only.
- No dark, blurred, or overexposed image.
- Current appearance captured: beard, moustache, spectacles if applicable.
- Admin reviews before live usage.

## Acceptance Tests Before Re-Enable

- Same employee cannot enroll under two employee codes.
- Similar-looking employees do not cross-match.
- Dark-skin employees enroll without false duplicate warnings under kiosk lighting.
- Beard/moustache employee can enroll and punch under current appearance.
- Employee cannot punch during activation hold.
- Punch without liveness nonce is rejected.
- Low confidence is rejected, not marked present.
- Failed scans and duplicate attempts are logged.

## VEIHAY Cleanup

Dry run:

```bash
cd backend
node scripts/cleanup-veihay-pending-face-data.js
```

Execute after reviewing dry-run output:

```bash
cd backend
node scripts/cleanup-veihay-pending-face-data.js --execute
```

The script must show the protected enrolled employee codes before any execute run.

## Rollback

If any wrong-person match is observed:

```bash
FACE_KIOSK_LIVE_ATTENDANCE_ENABLED=false
```

Then:

1. Stop using shared kiosk.
2. Export failed-scan and duplicate logs.
3. Delete wrong/pending enrollment data only after backup and review.
4. Re-enroll affected employees under controlled lighting.

