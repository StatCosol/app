package com.statcosol.attendance.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.statcosol.attendance.AttendanceApp
import com.statcosol.attendance.api.RecordPunchRequest
import java.util.concurrent.TimeUnit

class PunchSyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val app = applicationContext as AttendanceApp
        val dao = app.database.punchDao()
        val api = app.mobileApi
        val pending = dao.next()
        if (pending.isEmpty()) return Result.success()

        var transient = 0
        for (q in pending) {
            try {
                val resp = api.postPunch(
                    RecordPunchRequest(
                        embeddingB64 = q.embeddingB64,
                        embeddingModel = q.embeddingModel,
                        direction = q.direction,
                        livenessNonce = q.livenessNonce,
                        livenessChallengeType = q.livenessChallengeType,
                        livenessScore = q.livenessScore,
                        offlineSync = true,
                        punchTime = q.punchTimeIso,
                        isRooted = if (app.isDeviceRooted) true else null,
                    ),
                )
                if (resp.ok) {
                    dao.delete(q.id)
                } else {
                    dao.bumpAttempts(q.id)
                    transient++
                }
            } catch (e: Exception) {
                val status = parseHttpStatus(e.message.orEmpty())
                when {
                    status in 400..499 && status !in PERMANENT_KEEP -> dao.delete(q.id)
                    status == 401 || status == 403 -> {
                        dao.bumpAttempts(q.id)
                        return Result.failure()
                    }
                    else -> {
                        dao.bumpAttempts(q.id)
                        transient++
                    }
                }
            }
        }
        return if (transient == 0) Result.success() else Result.retry()
    }

    private fun parseHttpStatus(msg: String): Int =
        Regex("""\b(\d{3})\b""").find(msg)?.value?.toIntOrNull() ?: 0

    companion object {
        private val PERMANENT_KEEP = setOf(401, 403, 408, 409, 429)

        fun enqueue(ctx: Context) {
            val req = OneTimeWorkRequestBuilder<PunchSyncWorker>()
                .setConstraints(
                    Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build(),
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(ctx).enqueue(req)
        }
    }
}
