package com.statcosol.attendance.face

import android.graphics.RectF

/**
 * Per-frame scan preview passed to [FaceScanOverlayView] before quality gates
 * accept or reject a frame. Lets the overlay show live face position, angles,
 * and quality even while the user is still aligning.
 */
data class FaceScanPreview(
    val faceBox: RectF?,
    val metrics: FaceMetrics?,
    val hint: String?,
    val faceDetected: Boolean,
    /** True when all quality gates passed this frame (embedding was computed). */
    val frameAccepted: Boolean,
)

/** Enrollment / attendance capture phase for overlay guidance. */
enum class ScanPhase {
    IDLE,
    FRONT,
    LEFT,
    RIGHT,
    BLINK,
    /** Attendance burst capture (no angle steps). */
    CAPTURING,
    DONE,
}

/** Progress counters bound to the overlay step indicator. */
data class ScanProgress(
    val phase: ScanPhase = ScanPhase.IDLE,
    val stepIndex: Int = 0,
    val stepCount: Int = 4,
    val currentFrames: Int = 0,
    val requiredFrames: Int = 0,
    val frontCount: Int = 0,
    val leftCount: Int = 0,
    val rightCount: Int = 0,
    val blinked: Boolean = false,
)

enum class AlignmentStatus {
    NO_FACE,
    TOO_FAR,
    TOO_DARK,
    BLURRY,
    WRONG_ANGLE,
    HOLD_STILL,
    GOOD,
}

object FaceScanGuidance {
    const val FRONT_YAW = FaceKioskTuning.ENROLL_FRONT_YAW
    const val TURN_YAW = FaceKioskTuning.ENROLL_TURN_YAW

    fun phaseForEnrollment(
        frontCount: Int,
        leftCount: Int,
        rightCount: Int,
        frontRequired: Int,
        perAngle: Int,
        blinked: Boolean,
        capturing: Boolean,
        complete: Boolean,
    ): ScanPhase = when {
        complete -> ScanPhase.DONE
        !capturing -> ScanPhase.IDLE
        frontCount < frontRequired -> ScanPhase.FRONT
        leftCount < perAngle -> ScanPhase.LEFT
        rightCount < perAngle -> ScanPhase.RIGHT
        !blinked -> ScanPhase.BLINK
        else -> ScanPhase.DONE
    }

    fun targetYaw(phase: ScanPhase): Float? = when (phase) {
        ScanPhase.FRONT, ScanPhase.BLINK, ScanPhase.CAPTURING -> 0f
        ScanPhase.LEFT -> -25f
        ScanPhase.RIGHT -> 25f
        else -> null
    }

    fun alignmentStatus(
        preview: FaceScanPreview,
        phase: ScanPhase,
        minQuality: Double = FaceKioskTuning.ENROLL_MIN_FRONT_QUALITY,
    ): AlignmentStatus {
        if (!preview.faceDetected || preview.metrics == null) return AlignmentStatus.NO_FACE
        val hint = preview.hint.orEmpty()
        when {
            hint.contains("closer", ignoreCase = true) -> return AlignmentStatus.TOO_FAR
            hint.contains("light", ignoreCase = true) -> return AlignmentStatus.TOO_DARK
            hint.contains("blur", ignoreCase = true) -> return AlignmentStatus.BLURRY
        }
        val yaw = preview.metrics.headYaw
        val quality = preview.metrics.captureQuality
        if (phase == ScanPhase.FRONT && kotlin.math.abs(yaw) >= FRONT_YAW) {
            return AlignmentStatus.WRONG_ANGLE
        }
        if (phase == ScanPhase.LEFT && yaw > -TURN_YAW) return AlignmentStatus.WRONG_ANGLE
        if (phase == ScanPhase.RIGHT && yaw < TURN_YAW) return AlignmentStatus.WRONG_ANGLE
        if (phase == ScanPhase.FRONT && quality < minQuality && preview.frameAccepted.not()) {
            return AlignmentStatus.HOLD_STILL
        }
        if (preview.frameAccepted || quality >= minQuality * 0.85) return AlignmentStatus.GOOD
        return AlignmentStatus.HOLD_STILL
    }

    fun qualityColorFraction(quality: Double): Float = quality.toFloat().coerceIn(0f, 1f)
}
