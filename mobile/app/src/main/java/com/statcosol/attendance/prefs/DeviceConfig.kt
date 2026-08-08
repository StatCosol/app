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
        // Fallback to plain prefs only if keystore is unavailable (e.g. emulator without keystore).
        // This should never happen on a production device.
        Log.w(TAG, "EncryptedSharedPreferences unavailable, falling back to plain prefs: ${e.message}")
        context.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
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
                legacy.getString(KEY_DEVICE_ID, "")?.takeIf { it.isNotBlank() }?.let { editor.putString(KEY_DEVICE_ID, it) }
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

    /** Server-issued device UUID (needed for roster ciphertext decryption). */
    var deviceId: String
        get() = prefs.getString(KEY_DEVICE_ID, "") ?: ""
        set(value) = prefs.edit().putString(KEY_DEVICE_ID, value).apply()

    /** FaceDesk admin PIN — gates switching this device into enrollment mode. */
    var faceDeskAdminPin: String
        get() = prefs.getString(KEY_FD_ADMIN_PIN, "0000") ?: "0000"
        set(value) = prefs.edit().putString(KEY_FD_ADMIN_PIN, value).apply()

    fun isRegistered(): Boolean = deviceToken.isNotBlank()

    fun clear() = prefs.edit().clear().apply()

    companion object {
        private const val TAG = "DeviceConfig"
        private const val PREF_FILE = "device_config_enc"
        private const val LEGACY_PREF_FILE = "device_config"
        private const val KEY_API_BASE = "api_base"
        private const val KEY_DEVICE_TOKEN = "device_token"
        private const val KEY_INSTALL_TOKEN = "install_token"
        private const val KEY_DEVICE_MODE = "device_mode"
        private const val KEY_ANDROID_ID = "android_id"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_FD_ADMIN_PIN = "fd_admin_pin"
        private const val DEFAULT_API_BASE = "https://app.statcosol.com"
    }
}
