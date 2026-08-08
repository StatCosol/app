## statcompy-attendance — Android Face Attendance App

Companion native Android app for the statcompy mobile-attendance / FaceDesk backend modules.

### Operating modes (main branch)

- **FaceDesk Kiosk** (`:app` kiosk flavor) — shared tablet at the gate. Registers via `POST /api/v1/facedesk/devices/register`, then runs attendance (`FACEDESK_ATTENDANCE`) or enrollment (`FACEDESK_ENROLLMENT`) flows. Frames carry on-device embeddings (and optional JPEG crops for server-side ArcFace re-embed).
- **ESS Portal** (`:essportal` module) — full Angular ESS portal in a hardened WebView (`https://app.statcosol.com/ess/login` by default).

Legacy **V1 KIOSK** (1:N offline roster match against `GET /api/v1/mobile-attendance/punches/roster`) lives only in a maintenance worktree today; main ships FaceDesk V2 only.

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
[ Offline queue ] → sync → POST /api/v1/facedesk/...
                           Header: X-Device-Token: <device token>
```

### V1 roster encryption (`encrypted-v1`)

When the offline 1:N kiosk path is used, roster embeddings are AES-256-GCM ciphertexts:

- **Endpoint:** `GET /api/v1/mobile-attendance/punches/roster` (KIOSK device auth)
- **Key:** `SHA-256("statcompy-roster-v1:{deviceId}:{installToken}")` — no server secret on device
- **Wire:** base64(`iv[12] + authTag[16] + ciphertext`)
- **Client:** `com.statcosol.attendance.roster.RosterCrypto` — `deviceId` is persisted at FaceDesk register time

Set `MOBILE_ROSTER_PLAIN_EMBEDDINGS=true` on the server for legacy `plain-v1` responses during migration.

### Configuration

Per install (encrypted prefs):

- `installToken` — issued when the device is registered in the admin UI
- `deviceToken` + `deviceId` — returned by FaceDesk register; used for API auth and roster decrypt
- `apiBase` — defaults to `https://app.statcosol.com` (Settings override)

### Permissions

- `android.permission.CAMERA`
- `android.permission.INTERNET`
- `android.permission.ACCESS_NETWORK_STATE`

### Build

```
cd mobile
./gradlew :app:assembleKioskDebug :essportal:assembleDebug
```

Min SDK 26, Target SDK 34, Kotlin 1.9.

See the parent repo `docs/GOD_SERVICE_REFACTOR.md` and backend `mobile-attendance` module for API details.
