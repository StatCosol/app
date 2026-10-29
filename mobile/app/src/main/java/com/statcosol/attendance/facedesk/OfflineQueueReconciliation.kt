package com.statcosol.attendance.facedesk

/** Acknowledgements apply only to the replay snapshot, never to newer captures. */
internal object OfflineQueueReconciliation {
    fun keep(
        current: List<MarkAttendanceRequest>,
        snapshot: List<MarkAttendanceRequest>,
        retryRefs: Set<String>,
    ): List<MarkAttendanceRequest> {
        val acknowledgedRefs = snapshot.mapNotNull { it.offlineRef }.toSet() - retryRefs
        return current.filter { it.offlineRef == null || it.offlineRef !in acknowledgedRefs }
    }
}
