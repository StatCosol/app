package com.statcosol.attendance.face

/**
 * Per-frame ML Kit signals exposed to the active-liveness challenge layer.
 */
data class FaceSignal(
    val smilingProb: Float?,
    val leftEyeOpenProb: Float?,
    val rightEyeOpenProb: Float?,
    val headYawDeg: Float,
    val headPitchDeg: Float,
)
