package com.statcosol.attendance.prefs

import android.annotation.SuppressLint
import android.content.Context
import android.content.SharedPreferences
import android.provider.Settings
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.statcosol.attendance.BuildConfig

/**
 * Persists per-install device settings (install token, API base, cached mode).
 *
 * The install token is the device's only long-lived credential, so it lives
 * in an [EncryptedSharedPreferences] store keyed off an AndroidKeyStore-backed
 * master key. Non-sensitive settings (API base, mode, deviceId, employeeId
 * binding) stay in the regular SharedPreferences store so we don't blow up
 * the whole config if encryption fails on a quirky OEM build.
 */
class DeviceConfig(context: Context) {

    private val appContext: Context = context.applicationContext

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private val securePrefs: SharedPreferences = openSecurePrefs(appContext, prefs)

    /**
     * Stable per-device id used by the server to bind an install token to a
     * single physical device. ANDROID_ID is per-app-signing-key on Android 8+
     * (sufficient for our purpose: pasting the same token on a second tablet
     * will produce a different id and be rejected by the backend).
     */
    @get:SuppressLint("HardwareIds")
    val androidId: String by lazy {
        Settings.Secure.getString(appContext.contentResolver, Settings.Secure.ANDROID_ID).orEmpty()
    }

    var installToken: String?
        get() = securePrefs.getString(KEY_TOKEN, null)
        set(value) = securePrefs.edit().putString(KEY_TOKEN, value).apply()

    var apiBase: String
        get() = prefs.getString(KEY_API_BASE, BuildConfig.DEFAULT_API_BASE) ?: BuildConfig.DEFAULT_API_BASE
        set(value) = prefs.edit().putString(KEY_API_BASE, value).apply()

    /** Cached after a successful `/roster` call so we know which Activity to launch. */
    var mode: String?
        get() = prefs.getString(KEY_MODE, null)
        set(value) = prefs.edit().putString(KEY_MODE, value).apply()

    var deviceId: String?
        get() = prefs.getString(KEY_DEVICE_ID, null)
        set(value) = prefs.edit().putString(KEY_DEVICE_ID, value).apply()

    /** ESS-only: the single employeeId this device is bound to. */
    var essEmployeeId: String?
        get() = prefs.getString(KEY_ESS_EMP, null)
        set(value) = prefs.edit().putString(KEY_ESS_EMP, value).apply()

    fun isRegistered(): Boolean = !installToken.isNullOrBlank()

    fun clear() {
        prefs.edit().clear().apply()
        securePrefs.edit().clear().apply()
    }

    companion object {
        private const val TAG = "DeviceConfig"
        private const val PREFS = "statco_attendance_prefs"
        private const val SECURE_PREFS = "statco_attendance_secure"
        private const val KEY_TOKEN = "install_token"
        private const val KEY_API_BASE = "api_base"
        private const val KEY_MODE = "device_mode"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_ESS_EMP = "ess_employee_id"

        /**
         * Try to open the encrypted prefs file; on any failure (some OEMs ship
         * broken keystores) fall back to the plaintext store so the app still
         * works — better than bricking attendance for an entire site. On the
         * first successful open we also migrate any token that was previously
         * saved in plaintext under [KEY_TOKEN].
         */
        private fun openSecurePrefs(
            ctx: Context,
            legacyPrefs: SharedPreferences,
        ): SharedPreferences {
            return try {
                val masterKey = MasterKey.Builder(ctx)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build()
                val secure = EncryptedSharedPreferences.create(
                    ctx,
                    SECURE_PREFS,
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
                )
                // One-time migration of any pre-existing plaintext token.
                val legacy = legacyPrefs.getString(KEY_TOKEN, null)
                if (!legacy.isNullOrBlank() && secure.getString(KEY_TOKEN, null).isNullOrBlank()) {
                    secure.edit().putString(KEY_TOKEN, legacy).apply()
                }
                if (legacy != null) {
                    legacyPrefs.edit().remove(KEY_TOKEN).apply()
                }
                secure
            } catch (e: Exception) {
                Log.w(TAG, "EncryptedSharedPreferences unavailable; falling back to plain store", e)
                legacyPrefs
            }
        }
    }
}
