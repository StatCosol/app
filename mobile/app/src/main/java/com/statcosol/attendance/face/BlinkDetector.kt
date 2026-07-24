package com.statcosol.attendance.face

/**
 * Robust blink/liveness detector for kiosk conditions.
 *
 * A fixed absolute threshold on ML Kit's eye-open probability (e.g. "openness
 * < 0.35") is unreliable on kiosk hardware: in dim or backlit scenes even fully
 * open eyes read well below 1.0, so a real blink never crosses a low absolute
 * bar. This detector combines two signals:
 *
 *  - **Absolute floor** ([absThreshold]): eyes clearly closed in any lighting.
 *  - **Relative drop** ([dropDelta]): openness falls sharply from the running
 *    "open" baseline the person established this session — which catches blinks
 *    even when their open-eye reading is low.
 *
 * Feed every frame's averaged eye-openness to [onOpenness]; read [blinked];
 * call [reset] at the start of each capture session.
 */
class BlinkDetector(
    private val absThreshold: Double = 0.45,
    private val dropDelta: Double = 0.30,
) {
    private var openBaseline = 0.0

    var blinked = false
        private set

    fun onOpenness(openness: Double) {
        // The baseline tracks how "open" this person's eyes read while open, so
        // the drop test adapts to their lighting instead of assuming ~1.0.
        if (openness > openBaseline) openBaseline = openness
        if (openness <= absThreshold || (openBaseline - openness) >= dropDelta) {
            blinked = true
        }
    }

    fun reset() {
        openBaseline = 0.0
        blinked = false
    }
}
