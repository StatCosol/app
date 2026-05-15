package com.statcosol.attendance.face

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs
import kotlin.random.Random

/**
 * Active-liveness challenge — asks the user to perform one of four small
 * gestures and verifies it with ML Kit `FaceSignal`s coming from
 * [FaceCaptureSession]. Used by both the kiosk and the ESS phone flow to
 * defeat printed-photo / video-replay spoof attempts.
 *
 * The matching backend gate (env `FACE_LIVENESS_CHALLENGE_REQUIRED`)
 * accepts these enum values verbatim and requires `livenessChallengePassedAt`
 * to be within ±2 minutes of server receipt.
 */
enum class LivenessChallenge(val wireName: String) {
    BLINK("BLINK"),
    SMILE("SMILE"),
    HEAD_TURN_LEFT("HEAD_TURN_LEFT"),
    HEAD_TURN_RIGHT("HEAD_TURN_RIGHT");

    companion object {
        /** Picks one challenge uniformly at random. */
        fun random(rng: Random = Random.Default): LivenessChallenge =
            values()[rng.nextInt(values().size)]
    }
}

/**
 * Stateful tracker that consumes successive [FaceSignal]s and flips to
 * `passed = true` once the gesture for [challenge] has been observed.
 *
 * Thresholds are intentionally conservative — false positives would defeat
 * the purpose of liveness, and the user can always retry. They were tuned
 * against ML Kit `CLASSIFICATION_MODE_ALL` running on a Redmi 9 in office
 * lighting; revisit if the floor reports persistent failures.
 */
class LivenessChallengeTracker(val challenge: LivenessChallenge) {

    @Volatile var passed: Boolean = false
        private set
    @Volatile var passedAtMillis: Long = 0L
        private set

    /** For BLINK we need to see eyes CLOSED then OPEN within a short window. */
    private var blinkStartedAt: Long = 0L
    private var sawClosed: Boolean = false

    /** For HEAD_TURN_* we require the user to first face forward (yaw≈0) and
     *  THEN swing past the threshold, so a phone held at an angle doesn't
     *  trivially satisfy the challenge. */
    private var sawForward: Boolean = false

    /**
     * Consume one frame's signals. Returns `true` if THIS call flipped the
     * tracker into the passed state (callers can use that to fire a "done"
     * sound/animation exactly once).
     */
    fun feed(signal: FaceSignal): Boolean {
        if (passed) return false
        val now = System.currentTimeMillis()
        val matched = when (challenge) {
            LivenessChallenge.BLINK -> evalBlink(signal, now)
            LivenessChallenge.SMILE -> evalSmile(signal)
            LivenessChallenge.HEAD_TURN_LEFT -> evalHeadTurnLeft(signal)
            LivenessChallenge.HEAD_TURN_RIGHT -> evalHeadTurnRight(signal)
        }
        if (matched) {
            passed = true
            passedAtMillis = now
            return true
        }
        return false
    }

    private fun evalBlink(s: FaceSignal, now: Long): Boolean {
        val left = s.leftEyeOpenProb ?: return false
        val right = s.rightEyeOpenProb ?: return false
        val avg = (left + right) / 2f
        if (!sawClosed && avg < 0.30f) {
            sawClosed = true
            blinkStartedAt = now
            return false
        }
        if (sawClosed && avg > 0.75f) {
            // Eyes-open within reasonable window after eyes-closed.
            if (now - blinkStartedAt in 80..2_500) return true
            // Stale closure — reset and keep waiting.
            sawClosed = false
            blinkStartedAt = 0L
        }
        return false
    }

    private fun evalSmile(s: FaceSignal): Boolean {
        val smile = s.smilingProb ?: return false
        return smile > 0.75f
    }

    private fun evalHeadTurnLeft(s: FaceSignal): Boolean {
        // From the user's perspective LEFT means turning their head to their
        // left — which in ML Kit yaw terms is a NEGATIVE Euler-Y angle.
        if (!sawForward && abs(s.headYawDeg) < 8f) sawForward = true
        return sawForward && s.headYawDeg <= -22f
    }

    private fun evalHeadTurnRight(s: FaceSignal): Boolean {
        if (!sawForward && abs(s.headYawDeg) < 8f) sawForward = true
        return sawForward && s.headYawDeg >= 22f
    }

    /** ISO-8601 UTC timestamp of when the challenge passed; null if not yet passed. */
    fun passedAtIso(): String? {
        if (!passed) return null
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(Date(passedAtMillis))
    }
}
