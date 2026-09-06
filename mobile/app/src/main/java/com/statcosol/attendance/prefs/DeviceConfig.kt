package com.statcosol.attendance.prefs

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.io.File

class DeviceConfig(context: Context) {

    private val prefs: SharedPreferences = try {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            PREF_FILE,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    } catch (e: Exception) {
        // Never persist device tokens or admin PINs in plain SharedPreferences on
        // a production kiosk — adb backup and rooted devices can read them.
        Log.e(TAG, "EncryptedSharedPreferences unavailable", e)
        if (com.statcosol.attendance.BuildConfig.DEBUG) {
            Log.w(TAG, "Debug build only: falling back to plain prefs")
            context.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
        } else {
            throw IllegalStateException(
                "Secure credential storage is unavailable on this device",
                e,
            )
        }
    }

    init {
        migrateLegacyPrefs(context)
    }

    // One-time migration: copy values from old plaintext file into the encrypted store, then delete it.
    private fun migrateLegacyPrefs(context: Context) {
        val legacyFile = File(context.applicationInfo.dataDir, "shared_prefs/$LEGACY_PREF_FILE.xml")
        if (!legacyFile.exists()) return
        try {
            val legacy = context.getSharedPreferences(LEGACY_PREF_FILE, Context.MODE_PRIVATE)
            val editor = prefs.edit()
            if (prefs.getString(KEY_DEVICE_TOKEN, "").isNullOrBlank()) {
                legacy.getString(KEY_DEVICE_TOKEN, "")?.takeIf { it.isNotBlank() }?.let { editor.putString(KEY_DEVICE_TOKEN, it) }
                legacy.getString(KEY_INSTALL_TOKEN, "")?.takeIf { it.isNotBlank() }?.let { editor.putString(KEY_INSTALL_TOKEN, it) }
                legacy.getString(KEY_API_BASE, "")?.takeIf { it.isNotBlank() }?.let { editor.putString(KEY_API_BASE, it) }
                legacy.getString(KEY_DEVICE_MODE, "")?.takeIf { it.isNotBlank() }?.let { editor.putString(KEY_DEVICE_MODE, it) }
                legacy.getString(KEY_ANDROID_ID, "")?.takeIf { it.isNotBlank() }?.let { editor.putString(KEY_ANDROID_ID, it) }
                // Do not migrate legacy device_id — it may be a FaceDesk kiosk id, not mobile_attendance_devices.id.
                editor.apply()
                Log.i(TAG, "Migrated legacy prefs to encrypted store")
            }
            legacy.edit().clear().apply()
            legacyFile.delete()
            Log.i(TAG, "Deleted legacy plaintext prefs file")
        } catch (e: Exception) {
            Log.w(TAG, "Legacy prefs migration failed (non-fatal): ${e.message}")
        }
    }

    var apiBase: String
        get() = prefs.getString(KEY_API_BASE, DEFAULT_API_BASE) ?: DEFAULT_API_BASE
        set(value) = prefs.edit().putString(KEY_API_BASE, value).apply()

    var deviceToken: String
        get() = prefs.getString(KEY_DEVICE_TOKEN, "") ?: ""
        set(value) = prefs.edit().putString(KEY_DEVICE_TOKEN, value).apply()

    var installToken: String
        get() = prefs.getString(KEY_INSTALL_TOKEN, "") ?: ""
        set(value) = prefs.edit().putString(KEY_INSTALL_TOKEN, value).apply()

    var deviceMode: String
        get() = prefs.getString(KEY_DEVICE_MODE, "") ?: ""
        set(value) = prefs.edit().putString(KEY_DEVICE_MODE, value).apply()

    var androidId: String
        get() = prefs.getString(KEY_ANDROID_ID, "") ?: ""
        set(value) = prefs.edit().putString(KEY_ANDROID_ID, value).apply()

    /**
     * `mobile_attendance_devices.id` used for roster AES key derivation.
     * Set from V1 `POST /api/v1/mobile-attendance/devices/register` or from the
     * top-level `deviceId` field in `GET .../punches/roster` — not the FaceDesk
     * kiosk device UUID returned by `/api/v1/facedesk/device/register`.
     */
    var rosterDeviceId: String
        get() = prefs.getString(KEY_ROSTER_DEVICE_ID, "") ?: ""
        set(value) = prefs.edit().putString(KEY_ROSTER_DEVICE_ID, value).apply()

    /**
     * How this kiosk identifies a worker, mirrored from the server config.
     *
     * Persisted because the PIN keypad is raised in onResume, long before the
     * config fetch completes — reading it from the network would mean showing
     * a PIN prompt on a FACE_ONLY kiosk on every launch. A fresh fetch updates
     * this for next time, and PIN_THEN_FACE is the safe default for a device
     * that has never fetched.
     */
    var faceDeskIdentificationMode: String
        get() = prefs.getString(KEY_FD_ID_MODE, "PIN_THEN_FACE") ?: "PIN_THEN_FACE"
        set(value) = prefs.edit().putString(KEY_FD_ID_MODE, value).apply()

    /**
     * Until when an admin has deliberately left the kiosk, epoch millis.
     *
     * Once the kiosk is the HOME app, finishing it just sends the system back to
     * HOME — which is the kiosk — so the admin PIN exit looped straight back in
     * and there was no way to reach Settings on a locked device. This window is
     * what tells SetupActivity to stay out of the way for a few minutes instead
     * of redirecting.
     */
    var maintenanceUntilMs: Long
        get() = prefs.getLong(KEY_MAINTENANCE_UNTIL, 0L)
        set(value) = prefs.edit().putLong(KEY_MAINTENANCE_UNTIL, value).apply()

    /** True while an admin exit is still in effect. */
    fun inMaintenanceWindow(): Boolean =
        System.currentTimeMillis() < maintenanceUntilMs

    /**
     * Service mode: the kiosk stops re-applying the device-owner restrictions
     * that block factory reset, app control and safe boot.
     *
     * Those restrictions have no route out from adb. `dpm remove-active-admin`
     * refuses to remove a Device Owner unless the package declares
     * android:testOnly, which a production build does not — so once applied,
     * nothing outside the app can lift them and the device could not be reset
     * or repurposed. This flag is that route, and it has to be persistent:
     * lifting the restrictions alone would not survive the next kiosk start,
     * which re-applies them.
     */
    var serviceMode: Boolean
        get() = prefs.getBoolean(KEY_SERVICE_MODE, false)
        set(value) = prefs.edit().putBoolean(KEY_SERVICE_MODE, value).apply()

    /** FaceDesk admin PIN — gates switching this device into enrollment mode. */
    var faceDeskAdminPin: String
        get() = prefs.getString(KEY_FD_ADMIN_PIN, "") ?: ""
        set(value) = prefs.edit().putString(KEY_FD_ADMIN_PIN, value).apply()

    fun isRegistered(): Boolean = deviceToken.isNotBlank()

    /**
     * Bearer token for mobile-attendance device APIs. After V1 register the
     * server rotates the provisioning token; [deviceToken] is the active value.
     */
    fun mobileAttendanceAuthToken(): String = deviceToken.ifBlank { installToken }

    fun clear() = prefs.edit().clear().apply()

    /**
     * Clear the device registration (tokens, mode, admin PIN) so the app falls
     * back to the setup screen — e.g. after the server revokes/removes the
     * device. Keeps api_base and android_id so re-registration is one step.
     */
    fun clearRegistration() = prefs.edit()
        .remove(KEY_DEVICE_TOKEN)
        .remove(KEY_INSTALL_TOKEN)
        .remove(KEY_DEVICE_MODE)
        .remove(KEY_FD_ADMIN_PIN)
        // A de-registered device must not keep a previous client's punch policy:
        // re-registering elsewhere would otherwise start in FACE_ONLY and skip
        // the PIN before any config for the new client had arrived.
        .remove(KEY_FD_ID_MODE)
        .remove(KEY_ROSTER_DEVICE_ID)
        .apply()

    companion object {
        private const val TAG = "DeviceConfig"
        private const val PREF_FILE = "device_config_enc"
        private const val LEGACY_PREF_FILE = "device_config"
        private const val KEY_API_BASE = "api_base"
        private const val KEY_DEVICE_TOKEN = "device_token"
        private const val KEY_INSTALL_TOKEN = "install_token"
        private const val KEY_DEVICE_MODE = "device_mode"
        private const val KEY_ANDROID_ID = "android_id"
        private const val KEY_ROSTER_DEVICE_ID = "roster_device_id"
        private const val KEY_FD_ADMIN_PIN = "fd_admin_pin"
        private const val KEY_FD_ID_MODE = "fd_identification_mode"
        private const val KEY_MAINTENANCE_UNTIL = "maintenance_until_ms"
        private const val KEY_SERVICE_MODE = "service_mode"
        private const val DEFAULT_API_BASE = "https://app.statcosol.com"
    }
}
