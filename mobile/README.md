## statcompy-attendance — Android Face Attendance App

Companion native Android app for the statcompy mobile-attendance backend module.

### Operating modes

- **KIOSK** (`:app` kiosk flavor) — a shared tablet placed at the gate. Any employee walks up, looks at the camera, and is identified using 1:N face matching against the local roster (offline-capable). Replacement for the eSSL MB20 fingerprint reader.
- **ESS (Employee Self-Service)** (`:app` ess flavor) — installed on an employee's personal phone. Performs 1:1 face verification for that employee only, plus a geofence check against the workplace coordinates. Native attendance-only.
- **ESS Portal** (`:essportal` module) — full Angular ESS portal (login, dashboard, attendance with Face ID, leave, payslips, helpdesk, etc.) wrapped in a hardened WebView. Loads `https://app.statcosol.com/ess/login` by default. Lets employees install the entire ESS web app as a single icon on their phone — the web app at the same URL stays available unchanged. Long-press the offline banner to point it at staging.

### Architecture

```
[ Camera (CameraX) ]
        |
        v
[ ML Kit Face Detection + Liveness signals ]
        |
        v
[ MobileFaceNet TFLite ] → 192-D embedding
        |
        v
[ Local match against /roster cache (KIOSK) ]
[ Local match against this user's embedding (ESS) ]
        |
        v
[ Room offline queue ] → [ WorkManager sync ] → POST /api/v1/mobile-attendance/punch
                                                Header: X-Device-Token: <install token>
```

### Configuration

The app stores per-install:

- `installToken` (64 hex chars) — issued by the admin web UI when the device is registered.
- `mode` (KIOSK | ESS) — read from the `/roster` response.
- `apiBase` — defaults to `https://app.statcosol.com`. Configurable in Settings.

### Permissions

- `android.permission.CAMERA` (always)
- `android.permission.ACCESS_FINE_LOCATION` (ESS mode only — for geofence)
- `android.permission.INTERNET`
- `android.permission.ACCESS_NETWORK_STATE`

### Build

```
cd mobile
./gradlew :app:assembleKioskDebug :app:assembleEssDebug :essportal:assembleDebug
```

Min SDK 26 (Android 8.0), Target SDK 34 (Android 14), Kotlin 1.9, AGP 8.4.

### Status

This is the **initial scaffold**. The following pieces are stubbed and need
implementation in a follow-up:

- TFLite MobileFaceNet integration (model file `app/src/main/assets/mobilefacenet.tflite` not yet checked in — download from https://github.com/sirius-ai/MobileFaceNet_TF or equivalent).
- Real liveness detector (currently always returns 0.9 — Phase 2 will use Google ML Kit Face Detection eye-blink + head-pose deltas, or an Azure Face liveness client when Limited Access is approved).
- Azure Face server-side path (waiting on Limited Access approval).
- WorkManager retry policy tuning.

See the parent repo memory `/memories/repo/mobile-attendance.md` for backend details.
