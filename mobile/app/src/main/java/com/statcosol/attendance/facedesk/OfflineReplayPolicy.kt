package com.statcosol.attendance.facedesk

/** A response is not proof of attendance: only an explicit accepted result is. */
object OfflineReplayPolicy {
    enum class Outcome { ACCEPTED, REJECTED, RETRY }

    fun classify(status: String, message: String?): Outcome {
        // Compatibility with servers which returned cloud outages as rejections.
        if (message == "Face recognition failed — please try again" ||
            message == "Face recognition is unavailable — please try again shortly") return Outcome.RETRY
        return when (status) {
            "MARKED", "SYNCED", "DUPLICATE", "REVIEW" -> Outcome.ACCEPTED
            "REJECTED", "DROPPED" -> Outcome.REJECTED
            else -> Outcome.RETRY
        }
    }
}
