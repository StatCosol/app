package com.statcosol.attendance.facedesk

import android.content.Context
import com.statcosol.attendance.R
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
private data class ApiErrorBody(val message: String? = null)

/** Human-readable text from a FaceDesk API error body (never raw JSON). */
fun FaceDeskApiException.userMessage(context: Context): String {
    if (body.isBlank()) return context.getString(R.string.facedesk_enroll_failed)
    if (code == 409) {
        return context.getString(R.string.facedesk_enroll_duplicate)
    }
    val parsed = runCatching {
        Json { ignoreUnknownKeys = true }.decodeFromString<ApiErrorBody>(body)
    }.getOrNull()
    val serverMsg = parsed?.message?.trim().orEmpty()
    return when {
        serverMsg.isNotBlank() -> serverMsg
        body.trimStart().startsWith("{") -> context.getString(R.string.facedesk_enroll_failed)
        else -> body
    }
}
