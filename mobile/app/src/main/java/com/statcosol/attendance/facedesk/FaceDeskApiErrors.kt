package com.statcosol.attendance.facedesk

import android.content.Context
import com.statcosol.attendance.R
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
private data class ApiErrorBody(val message: String? = null)

/** Parsed `message` field from a FaceDesk API error JSON body, if present. */
fun FaceDeskApiException.serverMessageOrNull(): String? {
    if (body.isBlank()) return null
    val parsed = runCatching {
        Json { ignoreUnknownKeys = true }.decodeFromString<ApiErrorBody>(body)
    }.getOrNull()
    return parsed?.message?.trim()?.takeIf { it.isNotBlank() }
}

/**
 * True when the server rejected enrollment because the face matched another worker.
 * Other 409s (PIN clash, offline ref unique, FK constraints) must not use this.
 */
fun FaceDeskApiException.isEnrollmentDuplicateConflict(): Boolean {
    if (code != 409) return false
    val msg = serverMessageOrNull()?.lowercase() ?: return false
    return msg.contains("duplicate")
}

/** Human-readable text from a FaceDesk API error (never raw JSON or HTTP metadata). */
fun FaceDeskApiException.userMessage(
    context: Context,
    fallbackRes: Int = R.string.facedesk_request_failed,
): String {
    val serverMsg = serverMessageOrNull()
    return when {
        serverMsg != null -> serverMsg
        body.trimStart().startsWith("{") -> context.getString(fallbackRes)
        body.isNotBlank() -> body
        else -> context.getString(fallbackRes)
    }
}

/** Enrollment flow: map face-duplicate 409s to the kiosk duplicate string; otherwise [userMessage]. */
fun FaceDeskApiException.enrollmentUserMessage(
    context: Context,
    fallbackRes: Int = R.string.facedesk_enroll_failed,
): String {
    if (isEnrollmentDuplicateConflict()) {
        return context.getString(R.string.facedesk_enroll_duplicate)
    }
    return userMessage(context, fallbackRes)
}
