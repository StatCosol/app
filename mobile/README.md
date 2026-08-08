## statcompy-attendance — Android Face Attendance App

Companion native Android app for the statcompy mobile-attendance / FaceDesk backend modules.

### Operating modes (main branch)

- **FaceDesk Kiosk** (`:app` kiosk flavor) — shared tablet at the gate. Registers via `POST /api/v1/facedesk/device/register`, then runs attendance (`FACEDESK_ATTENDANCE`) or enrollment (`FACEDESK_ENROLLMENT`) flows. Frames carry on-device embeddings (and optional JPEG crops for server-side ArcFace re-embed).
- **ESS Portal** (`:essportal` module) — full Angular ESS portal in a hardened WebView (`https://app.statcosol.com/ess/login` by default).

Legacy **V1 KIOSK** (1:N offline roster match) is available again: check **Offline roster kiosk** on the setup screen when provisioning a `mobile-attendance` KIOSK device.

### Architecture (FaceDesk V2)

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
[ FaceDesk mark-attendance / enroll APIs ]
        |
        v
[ Offline queue ] → sync → POST /api/v1/facedesk/device/attendance/...
                           Header: Authorization: Bearer <deviceToken>
```

### V1 roster encryption (`encrypted-v1`)

When the offline 1:N kiosk path is used, roster embeddings are AES-256-GCM ciphertexts:

- **Register:** `POST /api/v1/mobile-attendance/devices/register` → returns `deviceId` (`mobile_attendance_devices.id`)
- **Roster:** `GET /api/v1/mobile-attendance/punches/roster` with `Authorization: Bearer <deviceToken>` (and `X-Android-Id`) — response `deviceId` must match register
- **Key:** `SHA-256("statcompy-roster-v1:{rosterDeviceId}:{deviceToken}")` — uses the rotated bearer token returned at register
- **Wire:** base64(`iv[12] + authTag[16] + ciphertext`)
- **Client:** `RosterCrypto` + `DeviceConfig.rosterDeviceId` (from V1 register or roster response — **not** the FaceDesk kiosk UUID)

Set `MOBILE_ROSTER_PLAIN_EMBEDDINGS=true` on the server for legacy `plain-v1` responses during migration.

### Configuration

Per install (encrypted prefs):

- `installToken` — issued when the device is registered in the admin UI
- `deviceToken` — FaceDesk bearer token from `/api/v1/facedesk/device/register`
- `rosterDeviceId` — V1 mobile-attendance device id (only when using offline roster)
- `apiBase` — defaults to `https://app.statcosol.com` (Settings override)

### Permissions

- `android.permission.CAMERA`
- `android.permission.INTERNET`
- `android.permission.ACCESS_NETWORK_STATE`

### Build

```
cd mobile
./gradlew :app:assembleKioskDebug :essportal:assembleDebug
./gradlew :app:testKioskDebugUnitTest
```

Min SDK 26, Target SDK 34, Kotlin 1.9.

See the parent repo `docs/GOD_SERVICE_REFACTOR.md` and backend `mobile-attendance` module for API details.
