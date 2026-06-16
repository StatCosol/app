package com.statcosol.attendance.security

import android.content.Context
import android.location.Location
import android.location.LocationManager
import android.os.Build
import java.io.File

object IntegrityCheck {

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
            val result = process.inputStream.bufferedReader().readLine()
            !result.isNullOrBlank()
        } catch (e: Exception) {
            false
        }
    }
}
