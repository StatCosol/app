package com.statcosol.attendance.face

/**
 * Per-frame face signal bundle passed from FaceCaptureSession to the activity.
 * Separating these three signals lets each liveness challenge check the metric
 * it actually measures, rather than repurposing eye-openness for everything.
 */
data class FaceMetrics(
    /** Average of left + right eye-open probability. 0 = closed, 1 = wide open. */
    val eyeOpenness: Double,
    /** ML Kit smiling probability. 0 = neutral, 1 = broad smile. */
    val smilingProbability: Double,
    /** Head yaw in degrees. Negative = turned left, positive = turned right. */
    val headYaw: Float,
    /** Head pitch in degrees. Positive = looking up. */
    val headPitch: Float = 0f,
    /** Heuristic 0–1 capture quality from face size + sharpness (for server gating). */
    val captureQuality: Double = 0.0,
)
