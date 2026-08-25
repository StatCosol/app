package com.statcosol.attendance.facedesk

import java.util.concurrent.atomic.AtomicBoolean

/**
 * Process-wide signal that the server rejected this device's token as invalid —
 * i.e. the device was revoked/removed in the portal. The API client raises it
 * from any device-authenticated 401; the Application handles it exactly once
 * (until re-armed) by clearing the local registration and returning to the setup
 * screen. Without this, a removed device would keep trusting its stale local
 * token and keep capturing attendance indefinitely.
 */
object DeviceSession {

    /** Set by the Application: clear registration + return to the setup screen. */
    @Volatile
    var onRevoked: (() -> Unit)? = null

    private val handled = AtomicBoolean(false)

    /** Fire the revocation handler at most once until [rearm] is called, so a
     *  burst of failing calls triggers a single reset. */
    fun notifyRevoked() {
        if (handled.compareAndSet(false, true)) {
            onRevoked?.invoke()
        }
    }

    /** Re-arm detection after a successful (re-)registration. */
    fun rearm() {
        handled.set(false)
    }
}
