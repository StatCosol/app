package com.statcosol.attendance.prefs

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

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
        // Fallback to plain prefs only if keystore is unavailable (e.g. emulator without keystore).
        // This should never happen on a production device.
        context.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
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

    fun isRegistered(): Boolean = deviceToken.isNotBlank()

    fun clear() = prefs.edit().clear().apply()

    companion object {
        private const val PREF_FILE = "device_config_enc"
        private const val KEY_API_BASE = "api_base"
        private const val KEY_DEVICE_TOKEN = "device_token"
        private const val KEY_INSTALL_TOKEN = "install_token"
        private const val KEY_DEVICE_MODE = "device_mode"
        private const val KEY_ANDROID_ID = "android_id"
        private const val DEFAULT_API_BASE = "https://app.statcosol.com"
    }
}
