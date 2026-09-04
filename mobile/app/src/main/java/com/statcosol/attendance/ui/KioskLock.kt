package com.statcosol.attendance.ui

import com.statcosol.attendance.prefs.DeviceConfig
import android.content.Intent
import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.widget.Toast
import com.statcosol.attendance.R
import com.statcosol.attendance.facedesk.PinKeypadDialog
import com.statcosol.attendance.kiosk.KioskDeviceAdminReceiver

/**
 * Shared kiosk lock-down used by the FaceDesk attendance and enrollment screens:
 * full-screen immersive mode, best-effort screen pinning (lock task), and a
 * PIN-gated exit hatch. The app is meant to be un-closable by ordinary users;
 * only someone with the admin PIN — the one set for this device during
 * registration (DeviceConfig.faceDeskAdminPin) — can leave it by long-pressing
 * the client name. Same PIN that unlocks enrollment mode.
 */
object KioskLock {

    private var dialogActive = false

    /** Hide the status/nav bars so the kiosk fills the whole screen. Call from
     *  onCreate AND onResume — the system re-shows the bars after dialogs and
     *  power events. */
    fun applyImmersive(activity: Activity) {
        val win = activity.window
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            win.setDecorFitsSystemWindows(false)
            win.insetsController?.let { ic ->
                ic.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                ic.systemBarsBehavior =
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            win.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                )
        }
    }

    /** Screen pinning. When this app is the device's Device Owner it first
     *  whitelists itself via setLockTaskPackages, so startLockTask fully blocks
     *  Home/Recents/Back. Otherwise it falls back to the standard (escapable)
     *  "pinned app" mode. No-ops (rather than crashing) on un-provisioned
     *  devices. */
    fun startLockTaskSafe(activity: Activity) {
        try {
            val dpm = activity.getSystemService(Context.DEVICE_POLICY_SERVICE)
                as? DevicePolicyManager
            if (dpm?.isDeviceOwnerApp(activity.packageName) == true) {
                val admin = ComponentName(activity, KioskDeviceAdminReceiver::class.java)
                dpm.setLockTaskPackages(admin, arrayOf(activity.packageName))
            }
            activity.startLockTask()
        } catch (_: Exception) {
        }
    }

    /**
     * Wire a view (the client-name label) so a long-press opens the PIN prompt.
     * The kiosk blocks Home/Back via immersive + lock task, so this is the only
     * sanctioned way out for an operator doing updates or maintenance.
     *
     * [expectedPin] is resolved at press time (read fresh from device config) so
     * a re-registration that changes the admin PIN takes effect without a restart.
     */
    fun bindExitTrigger(activity: Activity, expectedPin: () -> String, vararg triggers: View?) {
        val listener = View.OnLongClickListener {
            showExitDialog(activity, expectedPin())
            true
        }
        triggers.forEach { it?.setOnLongClickListener(listener) }
    }

    /**
     * How long an admin gets after the PIN before the kiosk takes the device
     * back. Long enough to reach Settings and change something, short enough
     * that a forgotten exit does not leave a gate unattended all day.
     */
    private const val MAINTENANCE_WINDOW_MS = 5 * 60 * 1000L

    /**
     * Actually leave, which finishing alone no longer achieves.
     *
     * Once the kiosk is the selected HOME app, finishAffinity() hands control to
     * HOME — which is this app — and SetupActivity redirects a registered device
     * straight back into the kiosk. The documented maintenance escape became a
     * loop with no way out on a locked device, which is exactly the state a
     * device owner cannot be pulled out of externally: lock task blocks
     * `am start`, and the package is protected against `pm disable-user`.
     *
     * So two things, and both are needed. The window tells SetupActivity to stay
     * out of the way rather than redirect. Handing off to another HOME app is
     * what puts a launcher on screen; without it the admin is left staring at a
     * finished activity.
     */
    fun leaveKiosk(activity: Activity) {
        runCatching {
            DeviceConfig(activity).maintenanceUntilMs =
                System.currentTimeMillis() + MAINTENANCE_WINDOW_MS
        }
        val other = systemLauncher(activity)
        if (other != null) {
            runCatching {
                activity.startActivity(
                    Intent(Intent.ACTION_MAIN).apply {
                        addCategory(Intent.CATEGORY_HOME)
                        component = other
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    },
                )
            }
        }
        activity.finishAffinity()
    }

    /** A HOME activity that is not us, if the device still has one. */
    private fun systemLauncher(activity: Activity): ComponentName? {
        val pm = activity.packageManager
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        return pm.queryIntentActivities(intent, 0)
            .asSequence()
            .map { it.activityInfo }
            .firstOrNull { it.packageName != activity.packageName }
            ?.let { ComponentName(it.packageName, it.name) }
    }

    /** Prompt for the device's admin PIN (set during registration); on the
     *  correct PIN, leave lock task and hand the device to a real launcher. */
    fun showExitDialog(activity: Activity, expectedPin: String) {
        if (dialogActive) return
        dialogActive = true
        val dialog = PinKeypadDialog.show(
            activity = activity,
            title = activity.getString(R.string.kiosk_admin_exit_title),
            message = activity.getString(R.string.kiosk_admin_exit_message),
            fixedLength = null,
            cancelable = true,
            onSubmit = { entered ->
                if (expectedPin.isNotBlank() && entered == expectedPin) {
                    try { activity.stopLockTask() } catch (_: Exception) {}
                    leaveKiosk(activity)
                } else {
                    Toast.makeText(
                        activity,
                        R.string.kiosk_admin_exit_wrong_pin,
                        Toast.LENGTH_SHORT,
                    ).show()
                }
            },
        )
        // Reset the guard on ANY dismissal — including the host activity finishing
        // while the prompt is up (e.g. the enrollment screen's delayed auto-finish).
        // A button/cancel-only reset would leave the guard stuck true and block
        // every later exit prompt until the process restarts.
        dialog.setOnDismissListener { dialogActive = false }
    }
}
