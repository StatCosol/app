package com.statcosol.attendance

import android.app.Application
import androidx.work.Configuration
import androidx.work.WorkManager
import com.statcosol.attendance.sync.PunchSyncWorker

class AttendanceApp : Application(), Configuration.Provider {

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setMinimumLoggingLevel(android.util.Log.INFO)
            .build()

    override fun onCreate() {
        super.onCreate()
        WorkManager.initialize(this, workManagerConfiguration)
        PunchSyncWorker.schedulePeriodicSync(this)
    }
}
