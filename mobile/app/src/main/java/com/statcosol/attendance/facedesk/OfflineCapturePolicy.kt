package com.statcosol.attendance.facedesk

import java.io.IOException

/** Queued captures are unverified. The server still identifies and verifies them on sync. */
object OfflineCapturePolicy {
    fun canQueue(
        enabled: Boolean,
        identificationMode: String,
        request: MarkAttendanceRequest,
        failure: Throwable,
    ): Boolean {
        if (!enabled || failure !is IOException) return false
        if (request.offlineRef.isNullOrBlank() || request.frames.isEmpty()) return false
        if (request.frames.any { it.embeddingB64.isBlank() }) return false
        return when (identificationMode) {
            "FACE_ONLY", "FACE_THEN_BIOMETRIC" -> true
            "PIN_THEN_FACE" -> !request.pin.isNullOrBlank()
            else -> false
        }
    }
}
