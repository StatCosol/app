package com.statcosol.attendance.kiosk

import android.app.admin.DeviceAdminReceiver

/**
 * Device-admin receiver that lets this app be set as the device's Device Owner
 * (e.g. `adb shell dpm set-device-owner
 * com.statcosol.attendance.kiosk/com.statcosol.attendance.kiosk.KioskDeviceAdminReceiver`
 * on a factory-fresh device with no accounts, or via an MDM). Once the app is
 * Device Owner, KioskLock whitelists it for lock task so screen pinning fully
 * blocks Home / Recents / Back rather than the escapable soft pinning.
 */
class KioskDeviceAdminReceiver : DeviceAdminReceiver()
