package com.statcosol.attendance.ui

import android.app.Activity
import android.os.Build
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.widget.Toast
import com.statcosol.attendance.R
import com.statcosol.attendance.facedesk.PinKeypadDialog

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

    /** Best-effort screen pinning. Fully blocks Home/Recents/Back only when the
     *  package is a Device Owner or whitelisted via a DPC's setLockTaskPackages;
     *  otherwise it enters the standard "pinned app" mode. No-ops (rather than
     *  crashing) on un-provisioned devices. */
    fun startLockTaskSafe(activity: Activity) {
        try {
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

    /** Prompt for the device's admin PIN (set during registration); on the
     *  correct PIN, leave lock task and close the app back to the launcher. */
    fun showExitDialog(activity: Activity, expectedPin: String) {
        if (dialogActive) return
        dialogActive = true
        PinKeypadDialog.show(
            activity = activity,
            title = activity.getString(R.string.kiosk_admin_exit_title),
            message = activity.getString(R.string.kiosk_admin_exit_message),
            fixedLength = null,
            cancelable = true,
            onSubmit = { entered ->
                dialogActive = false
                if (expectedPin.isNotBlank() && entered == expectedPin) {
                    try { activity.stopLockTask() } catch (_: Exception) {}
                    activity.finishAffinity()
                } else {
                    Toast.makeText(
                        activity,
                        R.string.kiosk_admin_exit_wrong_pin,
                        Toast.LENGTH_SHORT,
                    ).show()
                }
            },
            onCancel = { dialogActive = false },
        )
    }
}
