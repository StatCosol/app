package com.statcosol.attendance

import android.app.Application
import android.util.Log
import androidx.work.Configuration
import com.statcosol.attendance.api.ApiClient
import com.statcosol.attendance.db.AppDatabase
import com.statcosol.attendance.face.FaceEmbedder
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

    /** True if the bundled MobileFaceNet asset loaded successfully at startup.
     *  Lets the UI fail loudly at launch rather than silently at first punch. */
    var faceModelReady: Boolean = false
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        deviceConfig = DeviceConfig(this)
        apiClient = ApiClient(deviceConfig)
        database = AppDatabase.build(this)
        isDeviceRooted = runCatching { IntegrityCheck.isProbablyRooted() }.getOrDefault(false)
        // Preload the TFLite model so a missing/corrupt asset fails at launch
        // (where it's obvious) instead of 30s later at first face capture.
        faceModelReady = runCatching {
            FaceEmbedder.warmup(this)
            true
        }.onFailure { Log.e("AttendanceApp", "face model preload failed", it) }
         .getOrDefault(false)
    }

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder().build()

    companion object {
        lateinit var instance: AttendanceApp
            private set
    }
}
