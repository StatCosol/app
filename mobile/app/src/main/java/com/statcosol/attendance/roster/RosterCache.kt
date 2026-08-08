package com.statcosol.attendance.roster

import android.content.Context
import com.statcosol.attendance.prefs.DeviceConfig
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.time.Instant

/**
 * Persists the last valid roster payload so the kiosk can match offline after
 * reboot or process death until [RosterResponse.expiresAt].
 */
object RosterCache {
    private const val CACHE_FILE = "roster_cache_v1.json"
    private val json = Json { ignoreUnknownKeys = true }

    fun save(config: DeviceConfig, response: RosterResponse, context: Context) {
        if (response.enrollments.isEmpty()) return
        val payload = CachedRoster(
            authTokenFingerprint = tokenFingerprint(config.mobileAttendanceAuthToken()),
            rosterDeviceId = response.deviceId,
            response = response,
        )
        cacheFile(context).writeText(json.encodeToString(payload))
    }

    fun loadValid(config: DeviceConfig, context: Context): RosterResponse? {
        val file = cacheFile(context)
        if (!file.exists()) return null
        val cached = runCatching {
            json.decodeFromString<CachedRoster>(file.readText())
        }.getOrNull() ?: return null

        if (cached.rosterDeviceId != config.rosterDeviceId) return null
        if (cached.authTokenFingerprint != tokenFingerprint(config.mobileAttendanceAuthToken())) {
            return null
        }

        val expiresAt = cached.response.expiresAt ?: return cached.response
        val expiry = runCatching { Instant.parse(expiresAt) }.getOrNull() ?: return cached.response
        if (Instant.now().isAfter(expiry)) {
            file.delete()
            return null
        }
        return cached.response
    }

    fun clear(context: Context) {
        cacheFile(context).delete()
    }

    private fun cacheFile(context: Context): File =
        File(context.applicationContext.filesDir, CACHE_FILE)

    private fun tokenFingerprint(token: String): String =
        if (token.length <= 16) token else "${token.take(8)}:${token.takeLast(8)}"

    @kotlinx.serialization.Serializable
    private data class CachedRoster(
        val authTokenFingerprint: String,
        val rosterDeviceId: String,
        val response: RosterResponse,
    )
}
