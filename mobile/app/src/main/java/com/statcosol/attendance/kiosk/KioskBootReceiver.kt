package com.statcosol.attendance.kiosk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.statcosol.attendance.prefs.DeviceConfig
import com.statcosol.attendance.ui.SetupActivity

/**
 * Bring the kiosk back up after a reboot.
 *
 * Without this the gate simply stays down: a power cut, a flat battery or a
 * system update left the phone on its launcher until somebody noticed and
 * tapped the icon. Nothing on the device or in the portal says the kiosk is not
 * running — the punches just stop.
 *
 * SetupActivity rather than the attendance screen directly, because it already
 * decides which one to show: it routes to FaceDeskAttendanceActivity when the
 * device is registered and shows token entry when it is not. Duplicating that
 * decision here would be a second place to get it wrong.
 *
 * This is the belt, not the braces. Android restricts background activity
 * starts, so a boot receiver is not guaranteed to win on every OEM; the reliable
 * mechanism is the kiosk being the HOME app, which the system starts at boot by
 * definition. Both are wired up — see the HOME intent filter on SetupActivity.
 */
class KioskBootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED &&
            action != Intent.ACTION_LOCKED_BOOT_COMPLETED &&
            action != "android.intent.action.QUICKBOOT_POWERON"
        ) {
            return
        }
        // An unregistered device has nothing to show but token entry, and
        // launching that unprompted on every boot would be noise on a handset
        // that is not a kiosk yet.
        if (!runCatching { DeviceConfig(context).isRegistered() }.getOrDefault(false)) {
            return
        }
        runCatching {
            context.startActivity(
                Intent(context, SetupActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                },
            )
        }.onFailure {
            // A blocked background start is the expected failure on newer
            // Android. Logged rather than swallowed so it is diagnosable, but
            // never allowed to crash the boot broadcast.
            Log.w(TAG, "boot relaunch blocked: ${it.message}")
        }
    }

    private companion object {
        const val TAG = "KioskBootReceiver"
    }
}
