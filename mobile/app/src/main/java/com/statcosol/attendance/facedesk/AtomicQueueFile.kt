package com.statcosol.attendance.facedesk

import java.io.File
import java.io.FileOutputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/** Keep the original until its complete, synced replacement is ready. */
internal object AtomicQueueFile {
    // Activity and WorkManager use distinct store objects in the same process.
    val lock = Any()

    fun replace(target: File, write: (File) -> Unit) {
        val staging = File(target.parentFile, ".${target.name}.staging")
        check(staging.isDirectory || staging.mkdirs()) { "Cannot create queue staging directory" }
        // EncryptedFile authenticates the basename, so it MUST stay identical.
        val pending = File(staging, target.name)
        Files.deleteIfExists(pending.toPath())
        try {
            write(pending)
            FileOutputStream(pending, true).use { it.fd.sync() }
            Files.move(pending.toPath(), target.toPath(),
                StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
        } finally {
            Files.deleteIfExists(pending.toPath())
        }
    }
}
