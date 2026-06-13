# Face Attendance System - Documentation Index

Last updated: 2026-06-13
Status: Production stop in effect until validation is complete

## Start Here

- `FACE_ATTENDANCE_EXECUTIVE_SUMMARY.md` - leadership summary, current status, and decisions.
- `FACE_ATTENDANCE_ANALYSIS.md` - root cause analysis and technical remediation plan.
- `FACE_ATTENDANCE_IMPLEMENTATION.md` - code/config changes included in the hotfix and remaining engineering work.
- `FACE_ATTENDANCE_OPS_GUIDE.md` - operations checklist, testing steps, and rollback guidance.

## Current Production Position

Shared-kiosk live face attendance must remain disabled until:

1. Known duplicate/wrong-template records are cleaned.
2. Problem employees are re-enrolled under controlled lighting.
3. The kiosk APK and backend hotfix are deployed together.
4. Acceptance testing confirms no wrong-person attendance capture.

The hotfix intentionally defaults `FACE_KIOSK_LIVE_ATTENDANCE_ENABLED=false`.

## Immediate Configuration

Use this safe configuration while validating:

```bash
FACE_KIOSK_LIVE_ATTENDANCE_ENABLED=false
FACE_KIOSK_ACTIVATION_DELAY_MIN=15
FACE_MIN_MATCH_SCORE=0.90
FACE_MIN_QUALITY_SCORE=0.75
FACE_DUPLICATE_THRESHOLD=0.88
FACE_LIVENESS_CHALLENGE_REQUIRED=true
FACE_PUNCH_REQUIRE_SERVER_PROBE=true
FACE_POST_LOGOUT_COOLDOWN_HOURS=8
MOBILE_DEVICE_INSTALL_TOKEN_TTL_MIN=60
FACE_MAX_OFFLINE_BACKLOG_HOURS=24
FACE_REJECTION_ALERT_WINDOW_MIN=15
FACE_REJECTION_ALERT_THRESHOLD=5
FACE_DEVICE_REJECTION_ALERT_THRESHOLD=10
```

Only set `FACE_KIOSK_LIVE_ATTENDANCE_ENABLED=true` after staging and live kiosk testing pass.

## Decision Checklist

- [ ] Operations confirms alternate attendance method is active.
- [ ] HR confirms affected attendance records are manually reviewed.
- [ ] Engineering confirms backend and kiosk APK versions match.
- [ ] QA completes the checklist in `FACE_ATTENDANCE_OPS_GUIDE.md`.
- [ ] Management approves live kiosk re-enable.
