package com.statcosol.attendance.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.statcosol.attendance.AttendanceApp
import com.statcosol.attendance.api.PunchBody

/**
 * Drains the local punch queue. Scheduled by the Activities after each capture
 * (and periodically by WorkManager). Failed rows stay in the queue and the
 * attempt counter is bumped — production should add an exponential backoff.
 */
class PunchSyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val app = applicationContext as AttendanceApp
        val dao = app.database.punchDao()
        val api = app.apiClient

        val pending = dao.next()
        if (pending.isEmpty()) return Result.success()

        var failures = 0
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
                )
                val resp = api.postPunch(body)
                if (resp.ok) {
                    dao.delete(q.id)
                } else {
                    dao.bumpAttempts(q.id)
                    failures++
                }
            } catch (_: Exception) {
                dao.bumpAttempts(q.id)
                failures++
            }
        }
        return if (failures == 0) Result.success() else Result.retry()
    }
}
