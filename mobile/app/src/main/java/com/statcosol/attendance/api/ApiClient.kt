package com.statcosol.attendance.api

import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import com.statcosol.attendance.prefs.DeviceConfig
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import java.io.IOException
import java.util.concurrent.TimeUnit

private val JSON = "application/json; charset=utf-8".toMediaType()

/**
 * Thin OkHttp wrapper. All requests inject `X-Device-Token` from [DeviceConfig].
 *
 * Endpoints:
 *  - GET  {apiBase}/api/v1/mobile-attendance/roster
 *  - POST {apiBase}/api/v1/mobile-attendance/punch
 */
class ApiClient(private val config: DeviceConfig) {

    private val moshi: Moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()

    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        })
        .build()

    fun fetchRoster(): RosterResponse {
        val token = requireToken()
        val req = Request.Builder()
            .url("${config.apiBase}/api/v1/mobile-attendance/roster")
            .header("X-Device-Token", token)
            .header("X-Android-Id", config.androidId)
            .get()
            .build()
        http.newCall(req).execute().use { resp ->
            val body = resp.body?.string() ?: throw IOException("empty body")
            if (!resp.isSuccessful) throw IOException("roster ${resp.code}: $body")
            return moshi.adapter(RosterResponse::class.java).fromJson(body)
                ?: throw IOException("could not parse roster response")
        }
    }

    fun postPunch(body: PunchBody): PunchResponse {
        val token = requireToken()
        val json = moshi.adapter(PunchBody::class.java).toJson(body)
        val req = Request.Builder()
            .url("${config.apiBase}/api/v1/mobile-attendance/punch")
            .header("X-Device-Token", token)
            .header("X-Android-Id", config.androidId)
            .post(json.toRequestBody(JSON))
            .build()
        http.newCall(req).execute().use { resp ->
            val text = resp.body?.string() ?: throw IOException("empty body")
            if (!resp.isSuccessful) throw IOException("punch ${resp.code}: $text")
            return moshi.adapter(PunchResponse::class.java).fromJson(text)
                ?: throw IOException("could not parse punch response")
        }
    }

    fun enrollSelf(body: EnrollSelfBody): EnrollSelfResponse {
        val token = requireToken()
        val json = moshi.adapter(EnrollSelfBody::class.java).toJson(body)
        val req = Request.Builder()
            .url("${config.apiBase}/api/v1/mobile-attendance/enroll-self")
            .header("X-Device-Token", token)
            .header("X-Android-Id", config.androidId)
            .post(json.toRequestBody(JSON))
            .build()
        http.newCall(req).execute().use { resp ->
            val text = resp.body?.string() ?: throw IOException("empty body")
            if (!resp.isSuccessful) throw IOException("enroll ${resp.code}: $text")
            return moshi.adapter(EnrollSelfResponse::class.java).fromJson(text)
                ?: throw IOException("could not parse enroll response")
        }
    }

    /**
     * Kiosk poll for a pending operator-issued enrollment ticket. Returns
     * null when no ticket is waiting (server returns `{"ticket": null}`).
     */
    fun fetchPendingKioskEnrollTicket(): KioskEnrollTicket? {
        val token = requireToken()
        val req = Request.Builder()
            .url("${config.apiBase}/api/v1/mobile-attendance/kiosk-enroll/pending")
            .header("X-Device-Token", token)
            .header("X-Android-Id", config.androidId)
            .get()
            .build()
        http.newCall(req).execute().use { resp ->
            val text = resp.body?.string() ?: throw IOException("empty body")
            if (!resp.isSuccessful) {
                throw IOException("kiosk-enroll/pending ${resp.code}: $text")
            }
            val env = moshi.adapter(KioskEnrollTicketEnvelope::class.java).fromJson(text)
                ?: throw IOException("could not parse kiosk-enroll pending response")
            return env.ticket
        }
    }

    fun submitKioskEnrollTicket(
        ticketId: String,
        body: KioskEnrollSubmitBody,
    ): KioskEnrollSubmitResponse {
        val token = requireToken()
        val json = moshi.adapter(KioskEnrollSubmitBody::class.java).toJson(body)
        val req = Request.Builder()
            .url("${config.apiBase}/api/v1/mobile-attendance/kiosk-enroll/tickets/$ticketId/submit")
            .header("X-Device-Token", token)
            .header("X-Android-Id", config.androidId)
            .post(json.toRequestBody(JSON))
            .build()
        http.newCall(req).execute().use { resp ->
            val text = resp.body?.string() ?: throw IOException("empty body")
            if (!resp.isSuccessful) {
                throw IOException("kiosk-enroll submit ${resp.code}: $text")
            }
            return moshi.adapter(KioskEnrollSubmitResponse::class.java).fromJson(text)
                ?: throw IOException("could not parse kiosk-enroll submit response")
        }
    }

    private fun requireToken(): String =
        config.installToken ?: throw IllegalStateException("device not registered")
}
