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
        migrateLegacyPlaintext()
    }

    private fun crypto(): EncryptedFile =
        EncryptedFile.Builder(
            context,
            encFile,
            masterKey,
            EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB,
        ).build()

    private fun readLinesEncrypted(): List<String> {
        if (!encFile.exists()) return emptyList()
        return try {
            crypto().openFileInput().bufferedReader().use { r ->
                r.readLines().filter { it.isNotBlank() }
            }
        } catch (e: Exception) {
            Log.e(TAG, "read failed", e)
            emptyList()
        }
    }

    private fun writeLinesEncrypted(lines: List<String>) {
        // EncryptedFile refuses to open an existing target for write.
        if (encFile.exists()) encFile.delete()
        if (lines.isEmpty()) return
        try {
            crypto().openFileOutput().use { out ->
                out.write(lines.joinToString("\n").toByteArray())
                out.write("\n".toByteArray())
            }
        } catch (e: Exception) {
            Log.e(TAG, "write failed", e)
        }
    }

    /** One-time migration of any pre-encryption plaintext queue, then remove it. */
    private fun migrateLegacyPlaintext() {
        if (!legacyFile.exists()) return
        try {
            val old = legacyFile.readLines().filter { it.isNotBlank() }
            if (old.isNotEmpty()) {
                writeLinesEncrypted(readLinesEncrypted() + old)
            }
        } catch (e: Exception) {
            Log.w(TAG, "legacy migrate failed: ${e.message}")
        } finally {
            runCatching { legacyFile.delete() }
        }
    }

    @Synchronized
    fun enqueue(req: MarkAttendanceRequest): Boolean {
        val line = runCatching { json.encodeToString(req) }.getOrNull() ?: return false
        val lines = readLinesEncrypted()
        writeLinesEncrypted(lines + line)
        return readLinesEncrypted().size > lines.size
    }

    @Synchronized
    fun peekAll(): List<MarkAttendanceRequest> =
        readLinesEncrypted().mapNotNull { line ->
            runCatching { json.decodeFromString<MarkAttendanceRequest>(line) }.getOrNull()
        }

    @Synchronized
    fun size(): Int = readLinesEncrypted().size

    /** Clear the queue after a fully successful sync. */
    @Synchronized
    fun clear() {
        runCatching { if (encFile.exists()) encFile.delete() }
    }

    /** Replace the queue with only the punches that still need retry. */
    @Synchronized
    fun replaceAll(keep: List<MarkAttendanceRequest>) {
        if (keep.isEmpty()) {
            clear()
            return
        }
        writeLinesEncrypted(
            keep.mapNotNull { req ->
                runCatching { json.encodeToString(req) }.getOrNull()
            },
        )
    }

    /**
     * Apply batch/per-punch flush results without clobbering punches enqueued
     * while the flush was in flight. Only [snapshot] refs are removed unless
     * they appear in [retryRefs].
     */
    @Synchronized
    fun finishFlush(
        snapshot: List<MarkAttendanceRequest>,
        retryRefs: Set<String>,
    ) {
        val snapshotRefSet = snapshot.mapNotNull { it.offlineRef }.toSet()
        if (snapshotRefSet.isEmpty()) return
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
