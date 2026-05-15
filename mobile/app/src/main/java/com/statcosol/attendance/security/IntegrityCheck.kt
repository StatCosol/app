package com.statcosol.attendance.security

import android.location.Location
import android.os.Build
import java.io.File

/**
 * Lightweight on-device integrity probes used by the mobile-attendance flow.
 *
 * These are heuristics — a determined attacker can hide a rooted device or
 * spoof the mock-location flag — so they're sent to the server as hints
 * rather than treated as authoritative. The server combines them with
 * face-match + liveness scores to decide whether to accept a punch.
 */
object IntegrityCheck {

    /**
     * Returns true if the device is most likely rooted / Magisk-modified.
     * Checks common su binary paths and Magisk artefact files.
     */
    fun isProbablyRooted(): Boolean {
        val suPaths = listOf(
            "/system/bin/su",
            "/system/xbin/su",
            "/sbin/su",
            "/system/su",
            "/system/app/Superuser.apk",
            "/data/adb/magisk",
            "/data/adb/modules",
        )
        for (p in suPaths) {
            try {
                if (File(p).exists()) return true
            } catch (_: SecurityException) {
                // /data paths block reads on non-root – treat as inconclusive.
            }
        }
        // `which su` style probe via PATH lookup.
        val pathEnv = System.getenv("PATH") ?: ""
        for (dir in pathEnv.split(":")) {
            try {
                if (File(dir, "su").exists()) return true
            } catch (_: SecurityException) {
                // ignore
            }
        }
        return false
    }

    /**
     * True when the supplied [Location] is reported as mock by the platform.
     * Uses [Location.isMock] on API 31+, falls back to the deprecated
     * [Location.isFromMockProvider] on older devices.
     */
    @Suppress("DEPRECATION")
    fun isMockLocation(loc: Location?): Boolean {
        if (loc == null) return false
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            loc.isMock
        } else {
            loc.isFromMockProvider
        }
    }
}
