package com.statcosol.attendance.facedesk

import org.junit.Assert.assertEquals
import org.junit.Test

class OfflineQueueReconciliationTest {
    private fun capture(ref: String?) = MarkAttendanceRequest(
        frames = listOf(FaceFrame("frame")), offlineRef = ref,
    )

    @Test fun captureAddedDuringSuccessfulReplayRequiresAnotherDrain() {
        val first = capture("first")
        val addedDuringReplay = capture("new")
        val snapshot = listOf(first)
        val current = snapshot + addedDuringReplay
        val remaining = OfflineQueueReconciliation.keep(current, snapshot, emptySet())
        assertEquals(listOf(addedDuringReplay), remaining)
        assertEquals(1, remaining.size) // Worker retries despite zero snapshot retries.
        assertEquals(emptyList<MarkAttendanceRequest>(),
            OfflineQueueReconciliation.keep(remaining, remaining.toList(), emptySet()))
    }

    @Test fun failedSnapshotAndNewCapturesBothRemainPending() {
        val accepted = capture("accepted")
        val retry = capture("retry")
        val added = capture("new")
        assertEquals(listOf(retry, added), OfflineQueueReconciliation.keep(
            listOf(accepted, retry, added), listOf(accepted, retry), setOf("retry"),
        ))
    }

    @Test fun capturesWithoutReferencesAreNeverSilentlyRemoved() {
        val legacy = capture(null)
        assertEquals(listOf(legacy), OfflineQueueReconciliation.keep(
            listOf(legacy), listOf(legacy), emptySet(),
        ))
    }
}
