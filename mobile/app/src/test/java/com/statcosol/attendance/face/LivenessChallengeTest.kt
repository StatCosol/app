package com.statcosol.attendance.face

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

/**
 * JVM unit tests for the active-liveness challenge state machine — the
 * anti-spoofing gate for kiosk / ESS face capture. Pure logic (no Android
 * dependencies), so it runs under `testKioskDebugUnitTest`.
 */
class LivenessChallengeTest {

    private fun sig(
        smile: Float? = null,
        left: Float? = null,
        right: Float? = null,
        yaw: Float = 0f,
        pitch: Float = 0f,
    ) = FaceSignal(smile, left, right, yaw, pitch)

    // ── Enum wire mapping ──────────────────────────────────────────────

    @Test
    fun fromWire_roundTripsEveryKnownValue() {
        for (c in LivenessChallenge.values()) {
            assertEquals(c, LivenessChallenge.fromWire(c.wireName))
        }
    }

    @Test
    fun fromWire_isCaseSensitiveAndNullSafe() {
        assertNull(LivenessChallenge.fromWire("blink")) // ignoreCase = false
        assertNull(LivenessChallenge.fromWire("UNKNOWN"))
        assertNull(LivenessChallenge.fromWire(null))
    }

    @Test
    fun random_returnsAKnownChallenge() {
        val c = LivenessChallenge.random(Random(42))
        assertTrue(LivenessChallenge.values().contains(c))
    }

    // ── SMILE ──────────────────────────────────────────────────────────

    @Test
    fun smile_passesAboveThresholdAndFiresOnlyOnce() {
        val t = LivenessChallengeTracker(LivenessChallenge.SMILE)
        assertFalse(t.passed)
        assertTrue(t.feed(sig(smile = 0.8f))) // first crossing returns true
        assertTrue(t.passed)
        assertFalse(t.feed(sig(smile = 0.9f))) // already passed → no re-fire
    }

    @Test
    fun smile_belowThresholdDoesNotPass() {
        val t = LivenessChallengeTracker(LivenessChallenge.SMILE)
        assertFalse(t.feed(sig(smile = 0.5f)))
        assertFalse(t.passed)
    }

    // ── BLINK (closed → open within the timing window) ─────────────────

    @Test
    fun blink_passesOnClosedThenOpenWithinWindow() {
        var now = 1_000_000L
        val t = LivenessChallengeTracker(LivenessChallenge.BLINK) { now }
        assertFalse(t.feed(sig(left = 0.1f, right = 0.1f))) // eyes closed
        now += 120 // deterministically inside the 80..2500ms window
        assertTrue(t.feed(sig(left = 0.9f, right = 0.9f))) // eyes open → pass
        assertTrue(t.passed)
    }

    @Test
    fun blink_openWithoutPriorClosureDoesNotPass() {
        val t = LivenessChallengeTracker(LivenessChallenge.BLINK) { 1_000_000L }
        assertFalse(t.feed(sig(left = 0.9f, right = 0.9f)))
        assertFalse(t.passed)
    }

    @Test
    fun blink_reopenBelowFloorIsRejected() {
        var now = 1_000_000L
        val t = LivenessChallengeTracker(LivenessChallenge.BLINK) { now }
        t.feed(sig(left = 0.1f, right = 0.1f)) // closed
        now += 5 // below the 80ms floor → rejected, independent of runner load
        assertFalse(t.feed(sig(left = 0.9f, right = 0.9f)))
        assertFalse(t.passed)
    }

    @Test
    fun blink_reopenAboveCeilingIsRejected() {
        var now = 1_000_000L
        val t = LivenessChallengeTracker(LivenessChallenge.BLINK) { now }
        t.feed(sig(left = 0.1f, right = 0.1f)) // closed
        now += 3_000 // past the 2500ms ceiling → rejected
        assertFalse(t.feed(sig(left = 0.9f, right = 0.9f)))
        assertFalse(t.passed)
    }

    // ── HEAD TURN (must face forward first, then swing past threshold) ──

    @Test
    fun headTurnLeft_requiresForwardThenNegativeYaw() {
        val t = LivenessChallengeTracker(LivenessChallenge.HEAD_TURN_LEFT)
        // Swinging left without first facing forward must NOT pass.
        assertFalse(t.feed(sig(yaw = -30f)))
        assertFalse(t.passed)
        // Face forward, then swing left past -22°.
        assertFalse(t.feed(sig(yaw = 0f)))
        assertTrue(t.feed(sig(yaw = -30f)))
        assertTrue(t.passed)
    }

    @Test
    fun headTurnLeft_shallowTurnDoesNotPass() {
        val t = LivenessChallengeTracker(LivenessChallenge.HEAD_TURN_LEFT)
        t.feed(sig(yaw = 0f)) // forward
        assertFalse(t.feed(sig(yaw = -20f))) // not past -22°
    }

    @Test
    fun headTurnRight_requiresForwardThenPositiveYaw() {
        val t = LivenessChallengeTracker(LivenessChallenge.HEAD_TURN_RIGHT)
        assertFalse(t.feed(sig(yaw = 30f))) // no forward baseline yet
        t.feed(sig(yaw = 0f)) // forward
        assertTrue(t.feed(sig(yaw = 30f)))
        assertTrue(t.passed)
    }

    // ── Passed timestamp ───────────────────────────────────────────────

    @Test
    fun passedAtIso_isNullUntilPassedThenUtcIso() {
        // Fixed clock at epoch 0 → a known UTC ISO-8601 timestamp.
        val t = LivenessChallengeTracker(LivenessChallenge.SMILE) { 0L }
        assertNull(t.passedAtIso())
        t.feed(sig(smile = 0.9f))
        assertEquals("1970-01-01T00:00:00Z", t.passedAtIso())
    }
}
