package com.statcosol.attendance.ui

import com.statcosol.attendance.prefs.DeviceConfig
import android.content.Intent
import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.UserManager
import android.provider.Settings
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

    /**
     * Settings is allowed to run alongside the kiosk under lock task.
     *
     * The operational reality this serves: when attendance stops being captured,
     * the first thing anyone at the gate does is check the network and, if it is
     * down, join another one. That has to be possible without a developer — the
     * admin-PIN exit exists, but a guard on a night shift with no PIN and a dead
     * Wi-Fi link cannot record anyone, and the punches are simply lost.
     *
     * The cost is real and worth stating: anyone who knows the gesture can open
     * Settings on this device. HOME and OVERVIEW are still blocked so the kiosk
     * cannot be backgrounded, and Device Owner cannot be removed from the UI,
     * but a determined person could change device settings or factory reset.
     * That is the trade the deployment asked for — availability over lockdown —
     * and it is a one-line revert if a site decides otherwise.
     */
    private const val SETTINGS_PACKAGE = "com.android.settings"

    /** Restrictions applied while the kiosk is in service; lifted by releaseForService. */
    private val DESTRUCTIVE_RESTRICTIONS = listOf(
        UserManager.DISALLOW_FACTORY_RESET,
        UserManager.DISALLOW_APPS_CONTROL,
        UserManager.DISALLOW_SAFE_BOOT,
    )

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
                dpm.setLockTaskPackages(
                    admin,
                    arrayOf(activity.packageName, SETTINGS_PACKAGE),
                )
                allowStatusBar(dpm, admin)
                blockDestructiveSettings(activity, dpm, admin)
            }
            activity.startLockTask()
        } catch (_: Exception) {
        }
    }

    /**
     * Show the status bar through the lock, so the network state is visible.
     *
     * A fully locked kiosk hides it, which means nobody at the gate can see
     * whether the device still has Wi-Fi — and a kiosk that has quietly dropped
     * off the network looks identical to a working one until the punches are
     * missed. SYSTEM_INFO puts the signal and battery icons back.
     *
     * NOT the notification shade, however much we would like it. The platform
     * rejects LOCK_TASK_FEATURE_NOTIFICATIONS unless LOCK_TASK_FEATURE_HOME is
     * granted alongside it, and setLockTaskFeatures throws on the whole call
     * rather than dropping the offending bit — so asking for the shade without
     * HOME would leave us with NO features at all, silently, and the status bar
     * would stay hidden too. Granting HOME is not an option: it is what stops
     * the kiosk being backgrounded. Reaching Wi-Fi settings is handled instead
     * by [openNetworkSettings], which needs no shade.
     *
     * GLOBAL_ACTIONS is passed explicitly because it is on by default and this
     * call replaces the whole feature set — omitting it would take away the
     * power menu as a side effect.
     */
    private fun allowStatusBar(dpm: DevicePolicyManager, admin: ComponentName) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return
        runCatching {
            dpm.setLockTaskFeatures(
                admin,
                DevicePolicyManager.LOCK_TASK_FEATURE_SYSTEM_INFO or
                    DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS,
            )
        }
    }

    /**
     * Shut the destructive doors that opening Settings left ajar.
     *
     * The app cannot be uninstalled — Device Owner sees to that — but "cannot be
     * uninstalled" is not "cannot be killed", and two cheaper routes reach the
     * same place. Clear data wipes the device token, the admin PIN and any
     * queued punches, leaving the kiosk asking for an install token nobody at a
     * gate can supply. Factory reset does the lot. Both sit a few taps inside
     * Settings, which this kiosk deliberately allows through lock task so staff
     * can fix Wi-Fi without the admin PIN.
     *
     * As Device Owner these are user restrictions the Settings UI then refuses
     * to override, so Wi-Fi stays reachable while the destructive paths close.
     * Safe mode is included because booting into it is the other way to get a
     * device admin out of the way.
     *
     * Deliberately NOT restricted: DISALLOW_DEBUGGING_FEATURES, so adb keeps
     * working for servicing.
     *
     * adb is NOT, however, a way out of these restrictions — an earlier version
     * of this comment claimed it was, and that was wrong. `dpm
     * remove-active-admin` refuses to remove a Device Owner unless the package
     * declares android:testOnly, which a production build does not. The only
     * route back is [releaseForService], which is why it exists: a restriction
     * with no removal path is how a kiosk becomes e-waste.
     */
    private fun blockDestructiveSettings(
        activity: Activity,
        dpm: DevicePolicyManager,
        admin: ComponentName,
    ) {
        // Service mode is the way back out — see releaseForService. Without this
        // check the restrictions would be re-applied on the next kiosk start and
        // the release would last only until someone tapped the icon.
        val released = runCatching { DeviceConfig(activity).serviceMode }.getOrDefault(false)
        if (released) return
        DESTRUCTIVE_RESTRICTIONS.forEach { restriction ->
            runCatching { dpm.addUserRestriction(admin, restriction) }
        }
    }

    /**
     * Hand the device back for servicing: lift the restrictions that block
     * factory reset, app control and safe boot, and remember not to re-apply
     * them.
     *
     * This exists because there is otherwise NO way out. `dpm
     * remove-active-admin` refuses to remove a Device Owner unless the package
     * declares android:testOnly, which a production build does not — so once
     * DISALLOW_FACTORY_RESET is set, nothing outside this app can lift it and
     * the handset could never be reset or repurposed. Applying a restriction
     * with no removal path is how a kiosk becomes e-waste.
     *
     * Gated by the admin PIN because it is only reachable from the maintenance
     * screen, which the PIN is the only way to reach.
     *
     * Device Owner itself is deliberately left in place: clearing it also
     * destroys lock task, and a factory reset from Settings is enough for every
     * case this needs to serve. [clearDeviceOwner] is there for the case that
     * needs the rest.
     */
    fun releaseForService(activity: Activity) {
        val dpm = activity.getSystemService(Context.DEVICE_POLICY_SERVICE)
            as? DevicePolicyManager ?: return
        if (dpm.isDeviceOwnerApp(activity.packageName) != true) return
        val admin = ComponentName(activity, KioskDeviceAdminReceiver::class.java)
        DESTRUCTIVE_RESTRICTIONS.forEach { restriction ->
            runCatching { dpm.clearUserRestriction(admin, restriction) }
        }
        runCatching { DeviceConfig(activity).serviceMode = true }
    }

    /**
     * The full release: give up Device Owner entirely.
     *
     * After this the app is an ordinary app — no lock task, no restrictions, and
     * it can be uninstalled. Needed when the handset is being retired or
     * repurposed rather than merely serviced, and it is the only way to undo
     * Device Owner on a non-testOnly build.
     */
    fun clearDeviceOwner(activity: Activity) {
        val dpm = activity.getSystemService(Context.DEVICE_POLICY_SERVICE)
            as? DevicePolicyManager ?: return
        runCatching { dpm.clearDeviceOwnerApp(activity.packageName) }
        runCatching { DeviceConfig(activity).serviceMode = true }
    }

    /**
     * Open Wi-Fi settings from inside the kiosk.
     *
     * This is the half of the network story the status bar cannot do. Settings
     * is on the lock-task package list (see [SETTINGS_PACKAGE]), so it is
     * allowed to run alongside a locked kiosk — the system returns to the kiosk
     * when it is dismissed, and no other app becomes reachable.
     *
     * Deliberately not PIN-gated. The person who needs this is a guard whose
     * gate has stopped recording anyone, on a shift where nobody with the admin
     * PIN is around; requiring the PIN would put us back where we started.
     */
    fun openNetworkSettings(activity: Activity) {
        val opened = runCatching {
            activity.startActivity(
                Intent(Settings.ACTION_WIFI_SETTINGS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            true
        }.getOrDefault(false)
        if (!opened) {
            Toast.makeText(
                activity,
                R.string.kiosk_network_settings_unavailable,
                Toast.LENGTH_SHORT,
            ).show()
        }
    }

    /** Long-press a view (the on-screen status line) to reach Wi-Fi settings. */
    fun bindNetworkTrigger(activity: Activity, vararg triggers: View?) {
        val listener = View.OnLongClickListener {
            openNetworkSettings(activity)
            true
        }
        triggers.forEach { it?.setOnLongClickListener(listener) }
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
