package com.statcosol.attendance

import android.app.Application
import android.util.Log
import androidx.work.Configuration
import com.statcosol.attendance.api.MobileAttendanceApiClient
import com.statcosol.attendance.db.AppDatabase
import com.statcosol.attendance.face.FaceEmbedder
import com.statcosol.attendance.facedesk.DeviceSession
import com.statcosol.attendance.facedesk.FaceDeskOfflineStore
import com.statcosol.attendance.prefs.DeviceConfig
import com.statcosol.attendance.security.IntegrityCheck
import com.statcosol.attendance.ui.SetupActivity

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

        // If the server revokes this device (portal removal), any device call
        // returns 401 → DeviceSession fires this once: drop the local
        // registration and return to the setup screen so a removed device stops
        // capturing instead of trusting its stale token.
        DeviceSession.onRevoked = {
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                deviceConfig.clearRegistration()
                // Purge any queued offline punches (frames, photo, plaintext PIN)
                // captured under the revoked registration — never replay them under
                // a subsequent registration, which could belong to a different
                // client (biometric leak + wrong-tenant attribution).
                runCatching { FaceDeskOfflineStore(this).clear() }
                val intent = android.content.Intent(this, SetupActivity::class.java)
                    .addFlags(
                        android.content.Intent.FLAG_ACTIVITY_NEW_TASK
                            or android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK,
                    )
                startActivity(intent)
            }
        }
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
