package com.statcosol.attendance.facedesk

import android.content.Context
import android.util.Log
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File

/**
 * File-backed offline attendance queue. When the kiosk is offline, marks are
 * appended here with a client-generated offlineRef; on reconnect they are
 * flushed via /attendance/offline-sync, which dedupes on (client, offlineRef).
 * Simple line-delimited JSON — durable across restarts, no DB dependency.
 */
class FaceDeskOfflineStore(context: Context) {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val file = File(context.filesDir, "facedesk_offline_queue.jsonl")

    @Synchronized
    fun enqueue(req: MarkAttendanceRequest) {
        try {
            file.appendText(json.encodeToString(req) + "\n")
        } catch (e: Exception) {
            Log.e(TAG, "enqueue failed", e)
        }
    }

    @Synchronized
    fun peekAll(): List<MarkAttendanceRequest> {
        if (!file.exists()) return emptyList()
        return file.readLines().mapNotNull { line ->
            if (line.isBlank()) null
            else runCatching { json.decodeFromString<MarkAttendanceRequest>(line) }.getOrNull()
        }
    }

    @Synchronized
    fun size(): Int = if (file.exists()) file.readLines().count { it.isNotBlank() } else 0

    /** Clear the queue after a successful sync. */
    @Synchronized
    fun clear() {
        runCatching { if (file.exists()) file.delete() }
    }

    companion object {
        private const val TAG = "FaceDeskOffline"
    }
}
