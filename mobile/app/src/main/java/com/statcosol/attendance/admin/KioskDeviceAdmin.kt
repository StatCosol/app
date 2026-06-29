package com.statcosol.attendance.admin

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Device admin receiver required for silent lock-task / kiosk pinning.
 *
 * One-time ADB setup per device (use full component name with kiosk flavor package):
 *   adb shell dpm set-device-owner \
 *     com.statcosol.attendance.kiosk/com.statcosol.attendance.admin.KioskDeviceAdmin
 *
 * After device-owner is set, onEnabled() calls setLockTaskPackages() so
 * KioskActivity.startLockTask() enters full lock-task mode silently (no user prompt).
 *
 * Without device-owner mode the app falls back to Android screen-pinning
 * (startLockTask() works but shows a one-time user confirmation).
 */
class KioskDeviceAdmin : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        Log.i(TAG, "Device admin enabled — allowlisting package for lock-task")
        allowlistForLockTask(context)
    }

    override fun onDisabled(context: Context, intent: Intent) {
        Log.w(TAG, "Device admin disabled")
    }

    companion object {
        private const val TAG = "KioskDeviceAdmin"

        fun allowlistForLockTask(context: Context) {
            try {
                val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
                val admin = ComponentName(context, KioskDeviceAdmin::class.java)
                if (dpm.isDeviceOwnerApp(context.packageName)) {
                    dpm.setLockTaskPackages(admin, arrayOf(context.packageName))
                    Log.i(TAG, "Lock-task allowlist set for ${context.packageName}")
                } else {
                    Log.w(TAG, "Not device owner — lock-task will use screen-pinning fallback")
                }
            } catch (e: Exception) {
                Log.e(TAG, "setLockTaskPackages failed: ${e.message}")
            }
        }
    }
}
