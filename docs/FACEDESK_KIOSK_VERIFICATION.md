# FaceDesk Kiosk — Verification Checklist

Use this when connecting a tablet to verify the FaceDesk V2 path end-to-end.

## Before you start

1. **Portal:** Client → Kiosk Attendance → Settings — note `identificationMode` (default `PIN_THEN_FACE`).
2. **Portal:** Provision a device (name, branch, **admin PIN** 4–12 digits, not all same digit).
3. **Copy the 64-char install token** shown once after provision.
4. **Mobile build:** `mobile/secrets.properties` with `statco.adminExitPin=...` for release; debug OK without.
5. **Backend:** For `FACE_ONLY` / `FACE_THEN_BIOMETRIC`, Azure Face synced (Admin → Clients → Azure Face Sync).

## Register the tablet

1. Install kiosk APK (`com.statcosol.attendance.kiosk`).
2. Open app → paste install token + **same admin PIN** entered at provision.
3. API base: `https://app.statcosol.com` (or staging).
4. Leave **Offline roster kiosk** unchecked (that is legacy V1).
5. After register, app should land on full-screen attendance camera.

## Mode-specific checks

| Mode | Expected kiosk behaviour |
|------|--------------------------|
| `PIN_THEN_FACE` | 4-digit PIN keypad first, then camera |
| `FACE_ONLY` | Camera immediately (no PIN); needs network + Azure |
| `FACE_THEN_BIOMETRIC` | Camera immediately; server expects eSSL fingerprint corroboration |
| `BIOMETRIC_ONLY` | Kiosk should reject face punches; use eSSL device only |

## Punch test

1. Enroll at least one employee (Enrollment tab → ticket or on-device enrollment mode).
2. Set employee attendance PIN if using `PIN_THEN_FACE`.
3. Stand at kiosk — confirm success screen or review-queue item (not silent failure).
4. Portal → Review Queue / Dashboard — punch appears.

## Logs (debug builds)

```text
adb logcat -s FaceDeskAttendance DeviceConfig
```

After config fetch you should **not** see a PIN keypad stuck open on `FACE_ONLY`.

## Common failures

| Symptom | Likely cause |
|---------|----------------|
| PIN keypad on face-only site | Old APK or config fetch failed — re-open app after network OK |
| "Face not recognized" for everyone | No enrollments or Azure list empty |
| 401 after portal revoke | Expected — re-register with new token |
| Wrong person marked (V1 only) | Accidentally on offline roster path — re-provision as FaceDesk |

## Exit kiosk

Long-press **brand label** in header → admin PIN (from setup) or build `ADMIN_EXIT_PIN`.
