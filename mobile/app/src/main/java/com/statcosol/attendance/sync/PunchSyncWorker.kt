package com.statcosol.attendance.sync

import android.content.Context
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.statcosol.attendance.api.ApiClient
import com.statcosol.attendance.api.MobilePunchRequest
import com.statcosol.attendance.db.AppDatabase
import com.statcosol.attendance.prefs.DeviceConfig
import kotlinx.serialization.json.Json
import java.util.concurrent.TimeUnit

class PunchSyncWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun doWork(): Result {
        val config = DeviceConfig(applicationContext)
        if (!config.isRegistered()) return Result.success()

        val db = AppDatabase.getInstance(applicationContext)
        val dao = db.queuedPunchDao()
        val apiClient = ApiClient(config)

        val queued = dao.getAll()
        if (queued.isEmpty()) return Result.success()

        Log.i(TAG, "Syncing ${queued.size} queued punch(es)")

        var anyFailed = false
        for (queuedPunch in queued) {
            try {
                val req = json.decodeFromString<MobilePunchRequest>(queuedPunch.payloadJson)
                val syncReq = req.copy(offlineSync = true)
                apiClient.recordPunch(syncReq)
                dao.deleteById(queuedPunch.id)
                Log.i(TAG, "Synced punch id=${queuedPunch.id}")
            } catch (e: Exception) {
                Log.w(TAG, "Failed to sync punch id=${queuedPunch.id}: ${e.message}")
                anyFailed = true
            }
        }

        return if (anyFailed) Result.retry() else Result.success()
    }

    companion object {
        private const val TAG = "PunchSyncWorker"
        private const val WORK_NAME = "punch_sync_periodic"

        fun schedulePeriodicSync(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = PeriodicWorkRequestBuilder<PunchSyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
        }
    }
}
