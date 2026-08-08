package com.statcosol.attendance.api

import com.statcosol.attendance.prefs.DeviceConfig
import com.statcosol.attendance.roster.MobileAttendanceRegisterResponse
import com.statcosol.attendance.roster.RosterResponse
import com.statcosol.attendance.roster.applyRosterResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

class MobileAttendanceApiClient(private val config: DeviceConfig) {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val mediaType = "application/json; charset=utf-8".toMediaType()
    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private fun bearerBuilder(path: String): Request.Builder {
        val token = config.mobileAttendanceAuthToken().ifBlank {
            throw IllegalStateException("device not registered")
        }
        return Request.Builder()
            .url("${config.apiBase.trimEnd('/')}$path")
            .header("Authorization", "Bearer $token")
            .header("Content-Type", "application/json")
            .also { if (config.androidId.isNotBlank()) it.header("X-Android-Id", config.androidId) }
    }

    suspend fun register(installToken: String, androidId: String): MobileAttendanceRegisterResponse =
        withContext(Dispatchers.IO) {
            val body = json.encodeToString(
                mapOf(
                    "installToken" to installToken,
                    "androidId" to androidId,
                ),
            )
            val request = Request.Builder()
                .url("${config.apiBase.trimEnd('/')}/api/v1/mobile-attendance/devices/register")
                .post(body.toRequestBody(mediaType))
                .header("Content-Type", "application/json")
                .build()
            execute(request) { json.decodeFromString<MobileAttendanceRegisterResponse>(it) }
        }

    suspend fun fetchRoster(): RosterResponse = withContext(Dispatchers.IO) {
        val request = bearerBuilder("/api/v1/mobile-attendance/punches/roster").get().build()
        val response = execute(request) { json.decodeFromString<RosterResponse>(it) }
        config.applyRosterResponse(response)
        response
    }

    suspend fun postPunch(body: RecordPunchRequest): RecordPunchResponse = withContext(Dispatchers.IO) {
        val jsonBody = json.encodeToString(body)
        val request = bearerBuilder("/api/v1/mobile-attendance/punches")
            .post(jsonBody.toRequestBody(mediaType))
            .build()
        execute(request) { json.decodeFromString<RecordPunchResponse>(it) }
    }

    suspend fun requestLivenessChallenge(employeeId: String?, offline: Boolean = false): LivenessChallengeResponse =
        withContext(Dispatchers.IO) {
            val jsonBody = json.encodeToString(LivenessChallengeRequest(employeeId, offline))
            val request = bearerBuilder("/api/v1/mobile-attendance/liveness/challenge")
                .post(jsonBody.toRequestBody(mediaType))
                .build()
            execute(request) { json.decodeFromString<LivenessChallengeResponse>(it) }
        }

    suspend fun fetchPendingKioskTicket(): KioskEnrollTicket? = withContext(Dispatchers.IO) {
        val request = bearerBuilder("/api/v1/mobile-attendance/enrollment/kiosk/pending").get().build()
        val body = executeRaw(request)
        if (body.isBlank() || body == "null") return@withContext null
        return@withContext json.decodeFromString<KioskEnrollTicket>(body)
    }

    suspend fun submitKioskTicket(body: SubmitKioskTicketRequest): KioskEnrollTicket =
        withContext(Dispatchers.IO) {
            val jsonBody = json.encodeToString(body)
            val request = bearerBuilder("/api/v1/mobile-attendance/enrollment/kiosk/submit")
                .post(jsonBody.toRequestBody(mediaType))
                .build()
            execute(request) { json.decodeFromString<KioskEnrollTicket>(it) }
        }

    private inline fun <T> execute(request: Request, parse: (String) -> T): T {
        val body = executeRaw(request)
        return parse(body)
    }

    private fun executeRaw(request: Request): String {
        http.newCall(request).execute().use { resp ->
            val body = resp.body?.string() ?: throw IOException("empty body")
            if (!resp.isSuccessful) throw IOException("${request.url.encodedPath} ${resp.code}: $body")
            return body
        }
    }
}
