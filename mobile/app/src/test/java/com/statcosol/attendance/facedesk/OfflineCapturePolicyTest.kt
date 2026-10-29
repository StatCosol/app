package com.statcosol.attendance.facedesk

import java.io.IOException
import java.net.SocketTimeoutException
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OfflineCapturePolicyTest {
    private val capture = MarkAttendanceRequest(
        frames = listOf(FaceFrame(embeddingB64 = "test-frame")),
        offlineRef = "test-offline-ref",
        punchTime = "2026-10-29T08:00:00Z",
    )

    @Test fun faceModesQueueTransportFailuresWithoutClaimingAnIdentity() {
        for (mode in listOf("FACE_ONLY", "FACE_THEN_BIOMETRIC")) {
            assertTrue(OfflineCapturePolicy.canQueue(true, mode, capture, IOException()))
            assertTrue(OfflineCapturePolicy.canQueue(true, mode, capture, SocketTimeoutException()))
        }
    }

    @Test fun disabledPolicyAndUnknownModesNeverQueue() {
        for (mode in listOf("FACE_ONLY", "FACE_THEN_BIOMETRIC", "PIN_THEN_FACE")) {
            assertFalse(OfflineCapturePolicy.canQueue(false, mode, capture.copy(pin = "1234"), IOException()))
        }
        assertFalse(OfflineCapturePolicy.canQueue(true, "BIOMETRIC_ONLY", capture, IOException()))
        assertFalse(OfflineCapturePolicy.canQueue(true, "unknown", capture, IOException()))
    }

    @Test fun pinModeStillRequiresTheClaimedPin() {
        assertFalse(OfflineCapturePolicy.canQueue(true, "PIN_THEN_FACE", capture, IOException()))
        assertTrue(OfflineCapturePolicy.canQueue(true, "PIN_THEN_FACE", capture.copy(pin = "1234"), IOException()))
    }

    @Test fun serverRejectionsAndNonNetworkFailuresAreNotQueued() {
        for (code in listOf(400, 401, 403, 409, 429, 500)) {
            assertFalse(OfflineCapturePolicy.canQueue(true, "FACE_ONLY", capture, FaceDeskApiException(code, "")))
        }
        assertFalse(OfflineCapturePolicy.canQueue(true, "FACE_ONLY", capture, IllegalStateException()))
        assertFalse(OfflineCapturePolicy.canQueue(true, "FACE_ONLY", capture, java.util.concurrent.CancellationException()))
    }

    @Test fun incompleteCapturesCannotEnterTheReplayQueue() {
        assertFalse(OfflineCapturePolicy.canQueue(true, "FACE_ONLY", capture.copy(offlineRef = null), IOException()))
        assertFalse(OfflineCapturePolicy.canQueue(true, "FACE_ONLY", capture.copy(frames = emptyList()), IOException()))
        assertFalse(OfflineCapturePolicy.canQueue(true, "FACE_ONLY", capture.copy(frames = listOf(FaceFrame(""))), IOException()))
    }
}
