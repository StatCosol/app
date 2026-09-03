# Face Attendance System - Documentation Index

Last updated: 2026-09-03

> **Current system:** **FaceDesk V2** is the supported shared-kiosk product.
> See `docs/ATTENDANCE_SYSTEMS.md` for the full architecture (FaceDesk, eSSL,
> ESS, legacy V1). The documents below describe the **June 2026 V1 kiosk hotfix**
> and remain useful for roster-matcher thresholds and production safety defaults.

## Start Here

- `FACE_ATTENDANCE_EXECUTIVE_SUMMARY.md` - leadership summary, current status, and decisions.
- `FACE_ATTENDANCE_ANALYSIS.md` - root cause analysis and technical remediation plan.
- `FACE_ATTENDANCE_IMPLEMENTATION.md` - code/config changes included in the hotfix and remaining engineering work.
- `FACE_ATTENDANCE_OPS_GUIDE.md` - operations checklist, testing steps, and rollback guidance.

## Current Production Position

**FaceDesk V2** (`/api/v1/facedesk/*`, kiosk APK 0.7.x) is the primary shared-kiosk path. Identification modes: `PIN_THEN_FACE` (default), `FACE_ONLY`, `FACE_THEN_BIOMETRIC`, `BIOMETRIC_ONLY`.

The **V1 roster kiosk** hotfix controls below (`FACE_KIOSK_LIVE_ATTENDANCE_ENABLED`) apply only to legacy `KioskActivity` / mobile-attendance roster matching — not FaceDesk V2 mark-attendance.

## Immediate Configuration

Use this safe configuration while validating:

```bash
FACE_KIOSK_LIVE_ATTENDANCE_ENABLED=false
FACE_KIOSK_ACTIVATION_DELAY_MIN=15
FACE_MIN_MATCH_SCORE=0.90
FACE_MIN_QUALITY_SCORE=0.75
FACE_DUPLICATE_THRESHOLD=0.88
FACE_LIVENESS_CHALLENGE_REQUIRED=true
FACE_PUNCH_REQUIRE_PROBE=true
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
