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
import com.statcosol.attendance.api.PunchBody
import java.util.concurrent.TimeUnit

/**
 * Drains the local punch queue. Scheduled by the Activities after each capture
 * (and periodically by WorkManager). Permanent failures (4xx other than 401/
 * 408/409/429) are dropped so the queue can't grow without bound; transient
 * failures use WorkManager's exponential backoff.
 */
class PunchSyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val app = applicationContext as AttendanceApp
        val dao = app.database.punchDao()
        val api = app.apiClient

        val pending = dao.next()
        if (pending.isEmpty()) return Result.success()

        var transient = 0
        for (q in pending) {
            try {
                val body = PunchBody(
                    employeeId = q.employeeId,
                    employeeCode = q.employeeCode,
                    punchTime = q.punchTimeIso,
                    direction = q.direction,
                    matchScore = q.matchScore,
                    livenessScore = q.livenessScore,
                    captureLat = q.captureLat,
                    captureLng = q.captureLng,
                    captureAccuracyM = q.captureAccuracyM,
                    isRooted = if (app.isDeviceRooted) true else null,
                    offlineSync = true,
                    livenessChallengeType = q.livenessChallengeType,
                    livenessChallengePassedAt = q.livenessChallengePassedAtIso,
                    livenessNonce = q.livenessNonce,
                    probeEmbeddingB64 = q.probeEmbeddingB64,
                )
                val resp = api.postPunch(body)
                if (resp.ok) {
                    dao.delete(q.id)
                } else {
                    dao.bumpAttempts(q.id)
                    transient++
                }
            } catch (e: Exception) {
                val msg = e.message.orEmpty()
                val status = parseHttpStatus(msg)
                when {
                    // Permanent failures — server rejected the payload. No
                    // amount of retrying will succeed, so drop the row.
                    status in 400..499 && status !in PERMANENT_KEEP -> {
                        dao.delete(q.id)
                    }
                    // 401 (token revoked) is fatal for the whole queue; stop
                    // retrying until the user re-pairs in SetupActivity.
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

    private fun parseHttpStatus(msg: String): Int {
        // ApiClient throws IOException("punch 4xx: ...") — pluck the code.
        val re = Regex("""\b(\d{3})\b""")
        return re.find(msg)?.value?.toIntOrNull() ?: 0
    }

    companion object {
        /** 4xx codes worth retrying: timeout, conflict, rate-limit. */
        private val PERMANENT_KEEP = setOf(401, 403, 408, 409, 429)

        /** Schedule a one-shot run with exponential backoff. Callers should
         *  use this instead of OneTimeWorkRequestBuilder directly so all
         *  punch-sync work shares the same retry policy. */
        fun enqueue(ctx: Context) {
            val req = OneTimeWorkRequestBuilder<PunchSyncWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    30, TimeUnit.SECONDS,
                )
                .build()
            WorkManager.getInstance(ctx).enqueue(req)
        }
    }
}
