package com.statcosol.attendance.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.statcosol.attendance.BuildConfig
import com.statcosol.attendance.facedesk.FaceDeskApiClient
import com.statcosol.attendance.facedesk.FaceDeskOfflineStore
import com.statcosol.attendance.facedesk.FaceDeskOfflineSync
import com.statcosol.attendance.prefs.DeviceConfig
import java.util.concurrent.TimeUnit

/** Background retry for the FaceDesk encrypted offline attendance queue. */
class FaceDeskOfflineSyncWorker(ctx: Context, params: WorkerParameters) :
    CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val config = DeviceConfig(applicationContext)
        if (!config.isRegistered()) return Result.success()
        val store = FaceDeskOfflineStore(applicationContext)
        if (store.size() == 0) return Result.success()

        val api = FaceDeskApiClient(config)
        val flush = FaceDeskOfflineSync.flush(
            api = api,
            store = store,
            appVersion = BuildConfig.VERSION_NAME,
        )
        return if (flush.remaining == 0) Result.success() else Result.retry()
    }

    companion object {
        fun enqueue(ctx: Context) {
            val req = OneTimeWorkRequestBuilder<FaceDeskOfflineSyncWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(ctx).enqueue(req)
        }
    }
}
