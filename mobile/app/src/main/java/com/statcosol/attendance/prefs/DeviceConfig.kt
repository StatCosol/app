package com.statcosol.attendance.prefs

import android.content.Context
import android.content.SharedPreferences
import com.statcosol.attendance.BuildConfig

/**
 * Persists per-install device settings (install token, API base, cached mode).
 *
 * The install token is the only secret; it's stored in regular SharedPreferences
 * for now. For Phase 2 we should switch to EncryptedSharedPreferences once the
 * Jetpack Security artifact pin is finalised.
 */
class DeviceConfig(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    var installToken: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(value) = prefs.edit().putString(KEY_TOKEN, value).apply()

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
    }

    companion object {
        private const val PREFS = "statco_attendance_prefs"
        private const val KEY_TOKEN = "install_token"
        private const val KEY_API_BASE = "api_base"
        private const val KEY_MODE = "device_mode"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_ESS_EMP = "ess_employee_id"
    }
}
