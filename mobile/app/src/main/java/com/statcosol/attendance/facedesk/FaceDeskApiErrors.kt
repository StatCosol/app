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

/** Human-readable text from a FaceDesk API error (never raw JSON or HTTP metadata). */
fun FaceDeskApiException.userMessage(
    context: Context,
    fallbackRes: Int = R.string.facedesk_request_failed,
): String {
    if (code == 409) {
        return context.getString(R.string.facedesk_enroll_duplicate)
    }
    val serverMsg = serverMessageOrNull()
    return when {
        serverMsg != null -> serverMsg
        body.trimStart().startsWith("{") -> context.getString(fallbackRes)
        body.isNotBlank() -> body
        else -> context.getString(fallbackRes)
    }
}
