package com.statcosol.attendance.admin

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Device admin receiver required for lock-task / kiosk pinning.
 *
 * To activate as device owner (one-time ADB setup per device):
 *   adb shell dpm set-device-owner com.statcosol.attendance.kiosk/.admin.KioskDeviceAdmin
 *
 * Without device-owner mode the app falls back to Android screen-pinning
 * (startLockTask() still works, but shows a user confirmation on first use).
 */
class KioskDeviceAdmin : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        Log.i(TAG, "Device admin enabled")
    }

    override fun onDisabled(context: Context, intent: Intent) {
        Log.w(TAG, "Device admin disabled")
    }

    companion object {
        private const val TAG = "KioskDeviceAdmin"
    }
}
