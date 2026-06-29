package com.statcosol.attendance.api

import com.statcosol.attendance.prefs.DeviceConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.CertificatePinner
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLPeerUnverifiedException

class ApiClient(private val config: DeviceConfig) {

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    // Certificate pins for app.statcosol.com.
    // Leaf cert expires 2026-09-30. Backup pin is the GeoTrust TLS RSA CA G1 intermediate.
    // Before expiry, add new leaf pin here and release an app update before removing the old one.
    // To regenerate: openssl s_client -connect app.statcosol.com:443 | openssl x509 -pubkey -noout | openssl pkey -pubin -outform DER | openssl dgst -sha256 -binary | base64
    private val certificatePinner = CertificatePinner.Builder()
        .add("app.statcosol.com", "sha256/l+YmAf2o3pqcMWaHzt8Yxd2V0ir9PZTZccVXHMoA700=") // leaf — expires 2026-09-30
        .add("app.statcosol.com", "sha256/SDG5orEv8iX6MNenIAxa8nQFNpROB/6+llsZdXHZNqs=") // GeoTrust TLS RSA CA G1 (backup)
        .build()

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .certificatePinner(certificatePinner)
        .build()

    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

    private fun baseUrl(): String = config.apiBase.trimEnd('/')

    private fun authedRequestBuilder(path: String): Request.Builder {
        val url = "${baseUrl()}$path"
        val builder = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer ${config.deviceToken}")
            .header("Content-Type", "application/json")
        val androidId = config.androidId
        if (androidId.isNotBlank()) {
            builder.header("X-Android-Id", androidId)
        }
        return builder
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

    /** Bind this device's androidId to its pre-provisioned install token. */
    suspend fun registerDevice(req: RegisterDeviceRequest): RegisterDeviceResponse {
        val body = json.encodeToString(req).toRequestBody(JSON_MEDIA_TYPE)
        val request = Request.Builder()
            .url("${baseUrl()}/api/v1/mobile-attendance/devices/register")
            .post(body)
            .header("Content-Type", "application/json")
            .build()
        return execute(request) { json.decodeFromString(it) }
    }

    suspend fun getRoster(): RosterResponse {
        val request = authedRequestBuilder("/api/v1/mobile-attendance/punches/roster").get().build()
        return execute(request) { json.decodeFromString(it) }
    }

    suspend fun issueLivenessChallenge(employeeId: String?): LivenessChallengeResponse {
        val reqBody = json.encodeToString(LivenessChallengeRequest(employeeId)).toRequestBody(JSON_MEDIA_TYPE)
        val request = authedRequestBuilder("/api/v1/mobile-attendance/liveness/challenge")
            .post(reqBody)
            .build()
        return execute(request) { json.decodeFromString(it) }
    }

    suspend fun recordPunch(req: MobilePunchRequest): MobilePunchResponse {
        val body = json.encodeToString(req).toRequestBody(JSON_MEDIA_TYPE)
        val request = authedRequestBuilder("/api/v1/mobile-attendance/punches")
            .post(body)
            .build()
        return execute(request) { json.decodeFromString(it) }
    }

    /** Device-accessible endpoint — returns the single PENDING ticket for this device. */
    suspend fun getPendingEnrollTicket(): KioskEnrollTicketResponse? {
        val request = authedRequestBuilder("/api/v1/mobile-attendance/enrollment/kiosk/pending")
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

    /** ESS self-enrollment — sends face embedding from personal device. */
    suspend fun enrollSelf(embeddingB64: String): Result<Unit> {
        @kotlinx.serialization.Serializable
        data class EssEnrollRequest(val embeddingFrames: List<String>, val embeddingModel: String, val consentGiven: Boolean = true)
        val body = json.encodeToString(EssEnrollRequest(listOf(embeddingB64), "mobilefacenet")).toRequestBody(JSON_MEDIA_TYPE)
        val request = authedRequestBuilder("/api/v1/mobile-attendance/enrollment/self").post(body).build()
        return withContext(Dispatchers.IO) {
            try {
                val response = http.newCall(request).execute()
                val respBody = response.body?.string() ?: ""
                if (!response.isSuccessful) throw ApiException(response.code, respBody)
                Result.success(Unit)
            } catch (e: SSLPeerUnverifiedException) {
                throw e  // certificate pin failure — must not be swallowed
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
    }

    /** ticketId is serialized inside SubmitKioskEnrollRequest body. */
    suspend fun submitEnrollTicket(req: SubmitKioskEnrollRequest): Result<Unit> {
        val body = json.encodeToString(req).toRequestBody(JSON_MEDIA_TYPE)
        val request = authedRequestBuilder("/api/v1/mobile-attendance/enrollment/kiosk/submit")
            .post(body)
            .build()
        return withContext(Dispatchers.IO) {
            try {
                val response = http.newCall(request).execute()
                val respBody = response.body?.string() ?: ""
                if (!response.isSuccessful) throw ApiException(response.code, respBody)
                Result.success(Unit)
            } catch (e: SSLPeerUnverifiedException) {
                throw e  // certificate pin failure — must not be swallowed
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
    }
}

class ApiException(val code: Int, val body: String) : Exception("HTTP $code: $body")
