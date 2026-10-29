package com.statcosol.attendance.facedesk

import org.junit.Assert.assertEquals
import org.junit.Test

class OfflineReplayPolicyTest {
    @Test fun onlyExplicitAttendanceAcknowledgementsCountAsAccepted() {
        for (status in listOf("MARKED", "SYNCED", "DUPLICATE", "REVIEW")) {
            assertEquals(OfflineReplayPolicy.Outcome.ACCEPTED, OfflineReplayPolicy.classify(status, null))
        }
    }

    @Test fun rejectionsCannotMasqueradeAsAttendance() {
        for (status in listOf("REJECTED", "DROPPED")) {
            assertEquals(OfflineReplayPolicy.Outcome.REJECTED, OfflineReplayPolicy.classify(status, "Face not recognised"))
        }
    }

    @Test fun legacyCloudOutagesRetainCapturesEvenWhenServerSaysDropped() {
        for (status in listOf("REJECTED", "DROPPED")) {
            for (message in listOf("Face recognition failed — please try again", "Face recognition is unavailable — please try again shortly")) {
                assertEquals(OfflineReplayPolicy.Outcome.RETRY, OfflineReplayPolicy.classify(status, message))
            }
        }
    }

    @Test fun missingAndUnknownAcknowledgementsNeverConsumeCapture() {
        for (status in listOf("RETRY", "", "FUTURE_STATUS")) {
            assertEquals(OfflineReplayPolicy.Outcome.RETRY, OfflineReplayPolicy.classify(status, null))
        }
    }
}
