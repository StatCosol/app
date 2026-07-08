package com.statcosol.attendance.facedesk

import com.statcosol.attendance.prefs.DeviceConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.util.concurrent.TimeUnit

class FaceDeskApiException(val code: Int, val body: String) :
    Exception("FaceDesk API $code: $body")

/**
 * HTTP client for the FaceDesk V2 endpoints. Sends the device Bearer token,
 * matching the existing ApiClient. (Backend follow-up: the facedesk endpoints
 * still need device-token auth wired — today they expect a user JWT.)
 */
class FaceDeskApiClient(private val config: DeviceConfig) {

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }
    private val mediaType = "application/json; charset=utf-8".toMediaType()

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private fun builder(path: String): Request.Builder {
        val b = Request.Builder()
            .url("${config.apiBase.trimEnd('/')}$path")
            .header("Authorization", "Bearer ${config.deviceToken}")
            .header("Content-Type", "application/json")
        if (config.androidId.isNotBlank()) b.header("X-Android-Id", config.androidId)
        return b
    }

    private suspend fun <T> execute(request: Request, parse: (String) -> T): T =
        withContext(Dispatchers.IO) {
            val response: Response = http.newCall(request).execute()
            val body = response.body?.string() ?: ""
            if (!response.isSuccessful) throw FaceDeskApiException(response.code, body)
            parse(body)
        }

    /** Bind androidId to a FaceDesk install token (public endpoint). */
    suspend fun register(req: FaceDeskRegisterRequest): FaceDeskRegisterResponse {
        val body = json.encodeToString(req).toRequestBody(mediaType)
        val request = Request.Builder()
            .url("${config.apiBase.trimEnd('/')}/api/v1/facedesk/device/register")
            .post(body)
            .header("Content-Type", "application/json")
            .build()
        return execute(request) { json.decodeFromString(it) }
    }

    suspend fun markAttendance(req: MarkAttendanceRequest): MarkAttendanceResponse {
        val body = json.encodeToString(req).toRequestBody(mediaType)
        val request = builder("/api/v1/facedesk/device/attendance/mark").post(body).build()
        return execute(request) { json.decodeFromString(it) }
    }

    suspend fun offlineSync(req: OfflineSyncRequest): OfflineSyncResponse {
        val body = json.encodeToString(req).toRequestBody(mediaType)
        val request = builder("/api/v1/facedesk/device/attendance/offline-sync").post(body).build()
        return execute(request) { json.decodeFromString(it) }
    }

    suspend fun pendingEnrollment(): List<PendingEmployee> {
        val request = builder("/api/v1/facedesk/device/enrollment/pending").get().build()
        return execute(request) { json.decodeFromString(it) }
    }

    suspend fun validateQuality(req: ValidateQualityRequest): ValidateQualityResponse {
        val body = json.encodeToString(req).toRequestBody(mediaType)
        val request = builder("/api/v1/facedesk/device/enrollment/validate-quality").post(body).build()
        return execute(request) { json.decodeFromString(it) }
    }

    suspend fun saveEnrollment(req: SaveEnrollmentRequest): SaveEnrollmentResponse {
        val body = json.encodeToString(req).toRequestBody(mediaType)
        val request = builder("/api/v1/facedesk/device/enrollment/save").post(body).build()
        return execute(request) { json.decodeFromString(it) }
    }
}
