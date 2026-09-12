package com.statcosol.attendance.facedesk

import android.content.Context
import android.util.Log
import androidx.security.crypto.EncryptedFile
import androidx.security.crypto.MasterKey
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File

/**
 * Encrypted, file-backed offline attendance queue. When the kiosk is offline,
 * marks are stored here with a client-generated offlineRef; on reconnect they
 * are flushed via /attendance/offline-sync, which dedupes on (client,
 * offlineRef). The queue is AES-256 encrypted at rest because a PIN_THEN_FACE
 * punch carries the employee's plaintext PIN until it syncs.
 *
 * EncryptedFile has no append, so writes are read-modify-write — fine for the
 * low volume a single kiosk queues between syncs.
 */
class FaceDeskOfflineStore(private val context: Context) {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val encFile = File(context.filesDir, "facedesk_offline_queue.enc")
    private val legacyFile = File(context.filesDir, "facedesk_offline_queue.jsonl")

    private val masterKey: MasterKey =
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()

    init {
        synchronized(AtomicQueueFile.lock) {
            runCatching { migrateLegacyPlaintext() }
                .onFailure { Log.e(TAG, "queue migration deferred", it) }
        }
    }

    private fun crypto(file: File = encFile): EncryptedFile =
        EncryptedFile.Builder(
            context,
            file,
            masterKey,
            EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB,
        ).build()

    private fun readLinesEncrypted(): List<String> {
        if (!encFile.exists()) return emptyList()
        return crypto().openFileInput().bufferedReader().use { r ->
            r.readLines().filter { it.isNotBlank() }
        }
    }

    private fun writeLinesEncrypted(lines: List<String>) {
        AtomicQueueFile.replace(encFile) { pending ->
            crypto(pending).openFileOutput().use { out ->
                out.write(lines.joinToString("\n").toByteArray())
                out.write("\n".toByteArray())
            }
        }
    }

    /** One-time migration of any pre-encryption plaintext queue, then remove it. */
    private fun migrateLegacyPlaintext() {
        if (!legacyFile.exists()) return
        try {
            val old = legacyFile.readLines().filter { it.isNotBlank() }
            if (old.isNotEmpty()) {
                writeLinesEncrypted((readLinesEncrypted() + old).distinct())
            }
            check(legacyFile.delete()) { "Cannot remove migrated queue" }
        } catch (e: Exception) {
            Log.w(TAG, "legacy migrate deferred: ${e.message}")
            throw e
        }
    }

    fun enqueue(req: MarkAttendanceRequest): Boolean = synchronized(AtomicQueueFile.lock) {
        try {
            migrateLegacyPlaintext()
            val line = json.encodeToString(req)
            val lines = readLinesEncrypted()
            writeLinesEncrypted(lines + line)
            true
        } catch (e: Exception) {
            Log.e(TAG, "enqueue failed; previous queue preserved", e)
            false
        }
    }

    fun peekAll(): List<MarkAttendanceRequest> = synchronized(AtomicQueueFile.lock) {
        migrateLegacyPlaintext()
        readLinesEncrypted().map { line ->
            json.decodeFromString<MarkAttendanceRequest>(line)
        }
    }

    // Telemetry only; sync uses peekAll() and retries on read errors.
    fun size(): Int = synchronized(AtomicQueueFile.lock) {
        runCatching { readLinesEncrypted().size }.getOrDefault(0)
    }

    /** Clear the queue after a fully successful sync. */
    fun clear() = synchronized(AtomicQueueFile.lock) {
        writeLinesEncrypted(emptyList())
    }

    /** Replace the queue with only the punches that still need retry. */
    fun replaceAll(keep: List<MarkAttendanceRequest>) = synchronized(AtomicQueueFile.lock) {
        writeLinesEncrypted(
            keep.map { req ->
                json.encodeToString(req)
            },
        )
    }

    /**
     * Apply batch/per-punch flush results without clobbering punches enqueued
     * while the flush was in flight. Only [snapshot] refs are removed unless
     * they appear in [retryRefs].
     */
    fun finishFlush(
        snapshot: List<MarkAttendanceRequest>,
        retryRefs: Set<String>,
    ) = synchronized(AtomicQueueFile.lock) {
        val snapshotRefSet = snapshot.mapNotNull { it.offlineRef }.toSet()
        if (snapshotRefSet.isEmpty()) return@synchronized
        val retryByRef = snapshot
            .filter { it.offlineRef != null && it.offlineRef in retryRefs }
            .associateBy { it.offlineRef!! }
        val kept = mutableListOf<MarkAttendanceRequest>()
        for (req in peekAll()) {
            val ref = req.offlineRef
            when {
                ref == null -> kept.add(req)
                ref !in snapshotRefSet -> kept.add(req)
                ref in retryRefs -> retryByRef[ref]?.let { kept.add(it) }
            }
        }
        replaceAll(kept)
    }

    companion object {
        private const val TAG = "FaceDeskOffline"
    }
}
