package com.statcosol.attendance

import android.app.Application
import androidx.work.Configuration
import com.statcosol.attendance.api.ApiClient
import com.statcosol.attendance.db.AppDatabase
import com.statcosol.attendance.prefs.DeviceConfig
import com.statcosol.attendance.security.IntegrityCheck

/**
 * Single application object. Owns the Room database, the OkHttp/API client,
 * and the device-config (token + API base + mode) singleton.
 */
class AttendanceApp : Application(), Configuration.Provider {

    lateinit var deviceConfig: DeviceConfig
        private set
    lateinit var apiClient: ApiClient
        private set
    lateinit var database: AppDatabase
        private set

    /** Phase 3a: cached at startup, sent to the server with every punch as a hint. */
    var isDeviceRooted: Boolean = false
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        deviceConfig = DeviceConfig(this)
        apiClient = ApiClient(deviceConfig)
        database = AppDatabase.build(this)
        isDeviceRooted = runCatching { IntegrityCheck.isProbablyRooted() }.getOrDefault(false)
    }

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder().build()

    companion object {
        lateinit var instance: AttendanceApp
            private set
    }
}
