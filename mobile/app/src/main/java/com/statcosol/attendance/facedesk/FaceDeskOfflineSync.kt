package com.statcosol.attendance.facedesk

import android.util.Log

/**
 * Shared offline-queue flush logic used by [FaceDeskAttendanceActivity] and
 * [com.statcosol.attendance.sync.FaceDeskOfflineSyncWorker].
 */
object FaceDeskOfflineSync {

    private const val TAG = "FaceDeskOfflineSync"

    data class Result(
        val synced: Int,
        val dropped: Int,
        val remaining: Int,
    ) {
        companion object {
            val EMPTY = Result(0, 0, 0)
        }
    }

    suspend fun flush(
        api: FaceDeskApiClient,
        store: FaceDeskOfflineStore,
        appVersion: String? = null,
    ): Result {
        val pending = store.peekAll()
        if (pending.isEmpty()) return Result.EMPTY

        val retryRefs = mutableSetOf<String>()
        var synced = 0
        var dropped = 0

        try {
            val res = api.offlineSync(
                OfflineSyncRequest(
                    punches = pending,
                    appVersion = appVersion,
                    offlineQueueDepth = pending.size,
                ),
            )
            for (item in res.results) {
                when (item.status) {
                    "RETRY" -> item.offlineRef?.let { retryRefs.add(it) }
                    "DROPPED" -> dropped++
                    else -> synced++
                }
            }
            // Backward compat: older backends omit per-punch results.
            if (res.results.isEmpty()) {
                if (res.failed == 0) {
                    store.finishFlush(pending, emptySet())
                    synced = pending.size
                    logOutcome(synced, 0, 0)
                    return Result(synced, 0, 0)
                }
                return Result(0, 0, pending.size)
            }
            store.finishFlush(pending, retryRefs)
            logOutcome(synced, dropped, retryRefs.size)
            return Result(synced, dropped, retryRefs.size)
        } catch (e: Exception) {
            Log.w(TAG, "batch offline sync failed, falling back to per-punch: ${e.message}")
        }

        return flushPerPunch(api, store, pending)
    }

    private suspend fun flushPerPunch(
        api: FaceDeskApiClient,
        store: FaceDeskOfflineStore,
        pending: List<MarkAttendanceRequest>,
    ): Result {
        val retryRefs = mutableSetOf<String>()
        var synced = 0
        var dropped = 0
        for (req in pending) {
            try {
                when (api.markAttendance(req).status) {
                    "RETRY" -> req.offlineRef?.let { retryRefs.add(it) }
                    else -> synced++
                }
            } catch (e: FaceDeskApiException) {
                if (isTransientHttp(e.code)) {
                    req.offlineRef?.let { retryRefs.add(it) }
                    Log.w(TAG, "offline punch deferred ref=${req.offlineRef}: HTTP ${e.code}")
                } else {
                    dropped++
                    Log.w(TAG, "dropped offline punch ref=${req.offlineRef}: HTTP ${e.code}")
                }
            } catch (e: Exception) {
                req.offlineRef?.let { retryRefs.add(it) }
                Log.w(TAG, "offline punch deferred ref=${req.offlineRef}: ${e.message}")
            }
        }
        store.finishFlush(pending, retryRefs)
        logOutcome(synced, dropped, retryRefs.size)
        return Result(synced, dropped, retryRefs.size)
    }

    private fun isTransientHttp(code: Int): Boolean =
        code == 408 || code == 429 || code >= 500

    private fun logOutcome(synced: Int, dropped: Int, remaining: Int) {
        when {
            remaining == 0 ->
                Log.i(TAG, "offline queue drained: synced=$synced dropped=$dropped")
            synced > 0 || dropped > 0 ->
                Log.i(TAG, "offline queue partial: synced=$synced dropped=$dropped remaining=$remaining")
            else ->
                Log.w(TAG, "offline flush deferred: $remaining punch(es) still pending")
        }
    }
}
