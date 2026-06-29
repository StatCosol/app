package com.statcosol.attendance.security

import android.content.Context
import android.location.Location
import android.location.LocationManager
import android.os.Build
import java.io.File
import java.util.concurrent.TimeUnit

object IntegrityCheck {

    @Volatile private var cachedRootResult: Boolean? = null
    @Volatile private var cacheTimestampMs: Long = 0L
    private const val CACHE_TTL_MS = 60_000L

    fun isMockLocation(context: Context, location: Location): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR2) {
            if (location.isFromMockProvider) return true
        }
        return try {
            val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            val providers = lm.getProviders(true)
            providers.any { provider ->
                val lastKnown = lm.getLastKnownLocation(provider)
                lastKnown?.isFromMockProvider == true
            }
        } catch (e: Exception) {
            false
        }
    }

    fun isDeviceRooted(): Boolean {
        val now = System.currentTimeMillis()
        cachedRootResult?.let { cached ->
            if (now - cacheTimestampMs < CACHE_TTL_MS) return cached
        }
        val result = checkRooted()
        cachedRootResult = result
        cacheTimestampMs = now
        return result
    }

    private fun checkRooted(): Boolean {
        val buildTags = Build.TAGS
        if (buildTags != null && buildTags.contains("test-keys")) return true

        val suPaths = listOf(
            "/system/app/Superuser.apk",
            "/sbin/su",
            "/system/bin/su",
            "/system/xbin/su",
            "/data/local/xbin/su",
            "/data/local/bin/su",
            "/system/sd/xbin/su",
            "/system/bin/failsafe/su",
            "/data/local/su",
            "/su/bin/su",
        )

        for (path in suPaths) {
            if (File(path).exists()) return true
        }

        return try {
            val process = Runtime.getRuntime().exec(arrayOf("/system/xbin/which", "su"))
            val exited = process.waitFor(2, TimeUnit.SECONDS)
            if (!exited) {
                process.destroyForcibly()
                return false
            }
            val result = process.inputStream.bufferedReader().readLine()
            !result.isNullOrBlank()
        } catch (e: Exception) {
            false
        }
    }
}
