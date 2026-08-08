package com.statcosol.attendance

import android.app.Application
import android.util.Log
import androidx.work.Configuration
import com.statcosol.attendance.api.MobileAttendanceApiClient
import com.statcosol.attendance.db.AppDatabase
import com.statcosol.attendance.face.FaceEmbedder
import com.statcosol.attendance.prefs.DeviceConfig
import com.statcosol.attendance.security.IntegrityCheck

class AttendanceApp : Application(), Configuration.Provider {

    lateinit var deviceConfig: DeviceConfig
        private set
    lateinit var mobileApi: MobileAttendanceApiClient
        private set
    lateinit var database: AppDatabase
        private set

    var isDeviceRooted: Boolean = false
        private set

    var faceModelReady: Boolean = false
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        deviceConfig = DeviceConfig(this)
        mobileApi = MobileAttendanceApiClient(deviceConfig)
        database = AppDatabase.build(this)
        isDeviceRooted = runCatching { IntegrityCheck.isProbablyRooted() }.getOrDefault(false)
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
