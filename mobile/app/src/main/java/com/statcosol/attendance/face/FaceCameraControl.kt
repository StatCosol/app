package com.statcosol.attendance.face

import android.util.Log
import androidx.camera.core.Camera
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.MeteringPoint
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

    /**
     * Lock continuous auto-focus + auto-exposure metering onto the face oval so
     * captures are sharp and the face (not the background) drives exposure.
     * Auto-cancel is disabled so the metering stays on the face region for the
     * whole session instead of resetting to the default after a few seconds.
     *
     * On a fixed-focus front sensor the AF flag is a no-op; the AE metering
     * still improves the crop. Fully guarded — any unsupported control is
     * ignored rather than crashing the camera start.
     *
     * @param point a metering point from previewView.meteringPointFactory,
     *   created at the face-oval centre (see OVERLAY_FACE_CENTER_Y_FRACTION).
     */
    fun focusOnFace(camera: Camera, point: MeteringPoint) {
        try {
            val action = FocusMeteringAction.Builder(
                point,
                FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE,
            ).disableAutoCancel().build()
            camera.cameraControl.startFocusAndMetering(action)
        } catch (e: Exception) {
            Log.w(TAG, "focus/AE metering failed: ${e.message}")
        }
    }
}
