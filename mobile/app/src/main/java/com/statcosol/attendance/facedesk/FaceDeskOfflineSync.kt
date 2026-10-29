package com.statcosol.attendance.facedesk

import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * Shared offline-queue flush logic used by [FaceDeskAttendanceActivity] and
 * [com.statcosol.attendance.sync.FaceDeskOfflineSyncWorker].
 */
object FaceDeskOfflineSync {

    private const val TAG = "FaceDeskOfflineSync"
    private val replayLock = Mutex()

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
    ): Result = replayLock.withLock {
        // Activity and workers must share one replay, including its queue snapshot.
        val pending = withContext(Dispatchers.IO) { store.peekAll() }
        if (pending.isEmpty()) return@withLock Result.EMPTY

        val retryRefs = mutableSetOf<String>()
        var synced = 0
        var dropped = 0

        // A capture contains multiple JPEGs. Sending the entire queue breaches
        // the API body limit and parallel workers multiply cloud verification calls.
        for (req in pending) {
          try {
            val res = api.offlineSync(
                OfflineSyncRequest(
                    punches = listOf(req),
                    appVersion = appVersion,
                    offlineQueueDepth = pending.size,
                ),
            )
            val item = res.results.singleOrNull { it.offlineRef == req.offlineRef }
            val outcome = if (item != null) {
                OfflineReplayPolicy.classify(item.status, item.message)
            } else if (res.results.isEmpty() && res.failed == 0 &&
                res.synced + res.duplicateSkipped == 1) {
                OfflineReplayPolicy.Outcome.ACCEPTED
            } else OfflineReplayPolicy.Outcome.RETRY
            when (outcome) {
                OfflineReplayPolicy.Outcome.ACCEPTED -> synced++
                OfflineReplayPolicy.Outcome.REJECTED -> {
                    dropped++
                    Log.w(TAG, "offline capture rejected ref=${req.offlineRef}: ${item?.message}")
                }
                OfflineReplayPolicy.Outcome.RETRY -> req.offlineRef?.let { retryRefs.add(it) }
            }
          } catch (e: CancellationException) {
                throw e
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
          // Stop after a transient failure; do not hammer a throttled provider.
          if (req.offlineRef in retryRefs) {
              pending.dropWhile { it !== req }.forEach { it.offlineRef?.let(retryRefs::add) }
              break
          }
        }
        withContext(Dispatchers.IO) { store.finishFlush(pending, retryRefs) }
        logOutcome(synced, dropped, retryRefs.size)
        Result(synced, dropped, retryRefs.size)
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
