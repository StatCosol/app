package com.statcosol.attendance.face

import android.util.Log
import androidx.camera.core.Camera
import kotlin.math.roundToInt

/**
 * Camera-side low-light tuning shared by the FaceDesk enrollment and attendance
 * screens. The kiosk phone (SM-E076B) has no front flash, so under dim gate
 * lighting the default auto-exposure under-exposes faces — weak crops and weak
 * embeddings. Biasing exposure toward the bright end of the device's supported
 * range fixes that at the sensor, before any digital gain.
 */
object FaceCameraControl {

    private const val TAG = "FaceCameraControl"

    /** ~60% toward the device's max EV compensation — brightens dim scenes
     *  without blowing out a face that is already well lit (AE still adapts). */
    const val LOW_LIGHT_EXPOSURE_FRACTION = 0.6f

    /**
     * Bias exposure toward the bright end of the supported range. No-op when the
     * camera doesn't support exposure compensation or only supports darkening.
     */
    fun applyLowLightExposure(
        camera: Camera,
        fraction: Float = LOW_LIGHT_EXPOSURE_FRACTION,
    ) {
        try {
            val state = camera.cameraInfo.exposureState
            if (!state.isExposureCompensationSupported) return
            val range = state.exposureCompensationRange
            if (range.upper <= 0) return
            val index = (range.upper * fraction).roundToInt().coerceIn(range.lower, range.upper)
            camera.cameraControl.setExposureCompensationIndex(index)
        } catch (e: Exception) {
            Log.w(TAG, "exposure boost failed: ${e.message}")
        }
    }
}
