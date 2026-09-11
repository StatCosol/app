package com.statcosol.attendance.facedesk

import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files
import java.io.File
import java.io.IOException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class AtomicQueueFileTest {
    @Test fun failedReplacementPreservesExistingPunches() {
        val dir = Files.createTempDirectory("queue-test").toFile()
        try {
            val file = File(dir, "queue.enc").apply { writeText("old punches") }
            try {
                AtomicQueueFile.replace(file) { it.writeText("partial"); throw IOException("disk full") }
                fail("Expected failure")
            } catch (_: IOException) { }
            assertEquals("old punches", file.readText())
            AtomicQueueFile.replace(file) {
                assertEquals(file.name, it.name)
                it.writeText("complete replacement")
            }
            assertEquals("complete replacement", file.readText())
        } finally { dir.deleteRecursively() }
    }

    @Test fun independentWritersPreserveAllEntries() {
        val dir = Files.createTempDirectory("queue-race").toFile()
        val file = File(dir, "queue.enc").apply { writeText("") }
        val pool = Executors.newFixedThreadPool(4)
        try {
            val tasks = (0 until 40).map { value -> pool.submit {
                synchronized(AtomicQueueFile.lock) {
                    val old = file.readText()
                    AtomicQueueFile.replace(file) { it.writeText(old + "$value\n") }
                }
            } }
            tasks.forEach { it.get(10, TimeUnit.SECONDS) }
            assertEquals(40, file.readLines().toSet().size)
        } finally { pool.shutdownNow(); dir.deleteRecursively() }
    }
}
