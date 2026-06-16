package com.statcosol.attendance.api

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

class ApiClient(private val config: DeviceConfig) {

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

    private fun baseUrl(): String = config.apiBase.trimEnd('/')

    private fun authedRequestBuilder(path: String): Request.Builder {
        val url = "${baseUrl()}$path"
        return Request.Builder()
            .url(url)
            .header("Authorization", "Bearer ${config.deviceToken}")
            .header("Content-Type", "application/json")
    }

    private suspend fun <T> execute(request: Request, parse: (String) -> T): T =
        withContext(Dispatchers.IO) {
            val response: Response = http.newCall(request).execute()
            val body = response.body?.string() ?: ""
            if (!response.isSuccessful) {
                throw ApiException(response.code, body)
            }
            parse(body)
        }

    suspend fun registerDevice(req: RegisterDeviceRequest): RegisterDeviceResponse {
        val body = json.encodeToString(req).toRequestBody(JSON_MEDIA_TYPE)
        val request = Request.Builder()
            .url("${baseUrl()}/api/mobile-attendance/register-device")
            .post(body)
            .header("Content-Type", "application/json")
            .build()
        return execute(request) { json.decodeFromString(it) }
    }

    suspend fun getRoster(): RosterResponse {
        val request = authedRequestBuilder("/api/mobile-attendance/roster").get().build()
        return execute(request) { json.decodeFromString(it) }
    }

    suspend fun issueLivenessChallenge(employeeId: String?): LivenessChallengeResponse {
        val reqBody = json.encodeToString(LivenessChallengeRequest(employeeId)).toRequestBody(JSON_MEDIA_TYPE)
        val request = authedRequestBuilder("/api/mobile-attendance/liveness-challenge")
            .post(reqBody)
            .build()
        return execute(request) { json.decodeFromString(it) }
    }

    suspend fun recordPunch(req: MobilePunchRequest): MobilePunchResponse {
        val body = json.encodeToString(req).toRequestBody(JSON_MEDIA_TYPE)
        val request = authedRequestBuilder("/api/mobile-attendance/punch")
            .post(body)
            .build()
        return execute(request) { json.decodeFromString(it) }
    }

    suspend fun getPendingEnrollTicket(): KioskEnrollTicketResponse? {
        val request = authedRequestBuilder("/api/mobile-attendance/kiosk-enroll-ticket/pending")
            .get()
            .build()
        return withContext(Dispatchers.IO) {
            val response = http.newCall(request).execute()
            if (response.code == 404) return@withContext null
            val body = response.body?.string() ?: ""
            if (!response.isSuccessful) throw ApiException(response.code, body)
            if (body.isBlank() || body == "null") null
            else json.decodeFromString(body)
        }
    }

    suspend fun submitEnrollTicket(ticketId: String, req: SubmitKioskEnrollRequest): Result<Unit> {
        val body = json.encodeToString(req).toRequestBody(JSON_MEDIA_TYPE)
        val request = authedRequestBuilder("/api/mobile-attendance/kiosk-enroll-ticket/$ticketId/submit")
            .post(body)
            .build()
        return withContext(Dispatchers.IO) {
            runCatching {
                val response = http.newCall(request).execute()
                val respBody = response.body?.string() ?: ""
                if (!response.isSuccessful) throw ApiException(response.code, respBody)
            }
        }
    }
}

class ApiException(val code: Int, val body: String) : Exception("HTTP $code: $body")
