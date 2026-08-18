package com.statcosol.attendance.face

import android.util.Size
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy

/**
 * FaceDesk capture tuning for budget Samsung kiosk phones (SM-E076B / MT6835).
 *
 * Profiled on: 720×1600 display, 3.5 GB RAM, 8 MP front camera (no flash),
 * MediaTek Dimensity 6300 class SoC @ 60 Hz.
 *
 * Goals: reliable blink capture without timeouts, acceptable embeddings from a
 * soft front sensor, and UI readable on a small HD+ screen.
 */
object FaceKioskTuning {
    /** 720p 16:9 — best balance of face crop size vs MT6835 throughput. */
    val analysisResolution: ResolutionSelector = ResolutionSelector.Builder()
        .setAspectRatioStrategy(AspectRatioStrategy.RATIO_16_9_FALLBACK_AUTO_STRATEGY)
        .setResolutionStrategy(
            ResolutionStrategy(
                Size(1280, 720),
                ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER,
            ),
        )
        .build()

    /** Face width / frame width. 0.12 ≈ 40–55 cm on a 720p kiosk screen. */
    const val MIN_FACE_SIZE_ATTENDANCE = 0.12f
    const val MIN_FACE_SIZE_ENROLLMENT = 0.13f

    /**
     * Budget front sensors run soft — slightly below flagship thresholds.
     * Enrollment is stricter than attendance punch.
     */
    const val MIN_SHARPNESS_ATTENDANCE = 38f
    const val MIN_SHARPNESS_ENROLLMENT = 42f

    /** No front flash — allow dimmer gate lighting (lux still blocks very dark). */
    const val MIN_LUMINANCE = 20f

    /** Front phase only; relaxed automatically during left/right turns. */
    const val MAX_PITCH_DEG = 28f

    // ── Enrollment guided capture ────────────────────────────────────────────
    /** 6 good fronts + 3 per side = 12 angle frames (was 14 on faster hardware). */
    const val ENROLL_FRONT_FRAMES = 6
    const val ENROLL_PER_ANGLE = 3
    const val ENROLL_FRONT_YAW = 12f
    const val ENROLL_TURN_YAW = 18f
    // Enrollment completion gates. MUST stay >= the server's enrollment save
    // filter (facedesk-face.service.ts ENROLL_MIN_FRAME_QUALITY, 0.50): a frame
    // counted toward "capture complete" here must be one the server will save,
    // or enrollment finishes on-device then fails with too few usable frames.
    const val ENROLL_MIN_FRONT_QUALITY = 0.50
    const val ENROLL_MIN_ANGLE_QUALITY = 0.50
    /** 2 stable frames before first sample — enough on 60 Hz budget SoC. */
    const val ENROLL_FRONT_STABLE_FRAMES = 2
    const val ENROLL_CAPTURE_TIMEOUT_MS = 50_000L

    // ── Attendance punch burst ───────────────────────────────────────────────
    /** 6 frames + blink is enough for 1:1 cosine on-device embedder. */
    const val ATTENDANCE_REQUIRED_FRAMES = 6
    const val ATTENDANCE_MAX_FRAMES = 18
    /** Slower ML Kit + TFLite loop on MT6835 — allow longer gaps between frames. */
    const val ATTENDANCE_STALE_GAP_MS = 3_000L

    // ── Overlay layout (720×1600, 64 px notch) ──────────────────────────────
    const val OVERLAY_FACE_CENTER_Y_FRACTION = 0.40f
    const val OVERLAY_OVAL_RX_FRACTION = 0.34f
    const val OVERLAY_OVAL_RY_FRACTION = 0.23f

    // ── Blink / liveness (dim kiosk lighting, no front flash) ───────────────
    /** Slightly higher floor — budget cams report low open-eye probs in dim light. */
    const val BLINK_ABS_THRESHOLD = 0.50
    /** Smaller drop catches blinks when baseline is already low (~0.6–0.7). */
    const val BLINK_DROP_DELTA = 0.25
}
