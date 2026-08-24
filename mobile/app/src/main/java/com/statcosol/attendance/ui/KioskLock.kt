package com.statcosol.attendance.ui

import android.app.Activity
import android.os.Build
import android.text.InputType
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.widget.EditText
import android.widget.Toast
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.statcosol.attendance.BuildConfig
import com.statcosol.attendance.R

/**
 * Shared kiosk lock-down used by the FaceDesk attendance and enrollment screens:
 * full-screen immersive mode, best-effort screen pinning (lock task), and a
 * PIN-gated exit hatch. The app is meant to be un-closable by ordinary users;
 * only someone with the admin PIN (long-press the client name) can leave it.
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
     */
    fun bindExitTrigger(activity: Activity, vararg triggers: View?) {
        val listener = View.OnLongClickListener {
            showExitDialog(activity)
            true
        }
        triggers.forEach { it?.setOnLongClickListener(listener) }
    }

    /** Prompt for the admin PIN; on the correct PIN, leave lock task and close
     *  the app back to the device launcher. */
    fun showExitDialog(activity: Activity) {
        if (dialogActive) return
        val configuredPin = BuildConfig.ADMIN_EXIT_PIN
        dialogActive = true
        val input = EditText(activity).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            hint = activity.getString(R.string.kiosk_admin_exit_hint)
            setPadding(48, 32, 48, 32)
        }
        MaterialAlertDialogBuilder(activity)
            .setTitle(R.string.kiosk_admin_exit_title)
            .setMessage(R.string.kiosk_admin_exit_message)
            .setView(input)
            .setPositiveButton(R.string.kiosk_admin_exit_confirm) { d, _ ->
                val entered = input.text?.toString()?.trim().orEmpty()
                // An empty configured PIN can never be matched — the exit hatch
                // stays locked until a real PIN is baked into the build.
                if (configuredPin.isNotEmpty() && entered == configuredPin) {
                    try { activity.stopLockTask() } catch (_: Exception) {}
                    d.dismiss()
                    dialogActive = false
                    activity.finishAffinity()
                } else {
                    Toast.makeText(
                        activity,
                        R.string.kiosk_admin_exit_wrong_pin,
                        Toast.LENGTH_SHORT,
                    ).show()
                    dialogActive = false
                }
            }
            .setNegativeButton(R.string.kiosk_admin_exit_cancel) { d, _ ->
                d.dismiss()
                dialogActive = false
            }
            .setOnCancelListener { dialogActive = false }
            .show()
    }
}
