package com.statcosol.attendance.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.animation.AnimationUtils
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.statcosol.attendance.AttendanceApp
import com.statcosol.attendance.R
import com.statcosol.attendance.databinding.ActivityCameraBinding
import com.statcosol.attendance.db.QueuedPunch
import com.statcosol.attendance.face.FaceCaptureSession
import com.statcosol.attendance.face.FaceSignal
import com.statcosol.attendance.face.LivenessChallenge
import com.statcosol.attendance.face.LivenessChallengeTracker
import com.statcosol.attendance.face.RosterMatcher
import com.statcosol.attendance.sync.PunchSyncWorker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Shared-tablet KIOSK mode. Camera runs continuously; whenever a face passes
 * quality + liveness gates we 1:N match against the cached roster and queue a
 * punch.
 *
 * UX rules (see issue from on-site rollout):
 *   1. First match for an employee on this device today  -> immediate IN punch
 *      with a green-tick overlay ("Login recorded — name • HH:mm AM").
 *   2. Subsequent match for the same employee (after the cooldown) opens a
 *      confirmation dialog ("attendance already recorded, punch out?"). Only on
 *      explicit Yes do we queue an OUT punch and show "Logout recorded".
 *   3. Global 30 s cooldown between any two captures so the camera doesn't
 *      immediately re-capture the same face the moment a punch is recorded.
 */
class KioskActivity : AppCompatActivity() {

    private lateinit var binding: ActivityCameraBinding
    private val app get() = application as AttendanceApp
    private var matcher: RosterMatcher? = null
    private var capture: FaceCaptureSession? = null

    /** Last time ANY face was processed — used to throttle the camera. */
    private var lastPunchAt: Long = 0

    /** Per-employee punch state for the current local day (in-memory only). */
    private data class PunchState(val direction: String, val at: Long)
    private val todayPunches: MutableMap<String, PunchState> = mutableMapOf()
    private var todayKey: String = currentDayKey()

    /** True while the logout-confirmation dialog is on screen. */
    @Volatile private var dialogActive: Boolean = false

    /** Active-liveness challenge state. While [pendingChallengeMatch] is
     *  non-null we are in "challenge mode" — onFace embeddings are ignored
     *  and the camera is feeding [pendingChallengeTracker] until it passes
     *  or [pendingChallengeTimeout] fires. */
    @Volatile private var pendingChallengeMatch: RosterMatcher.Match? = null
    @Volatile private var pendingChallengeLiveness: Double = 0.0
    @Volatile private var pendingChallengeDirection: String = "IN"
    @Volatile private var pendingChallengeTracker: LivenessChallengeTracker? = null
    private val pendingChallengeTimeout = Runnable { abortChallenge(timedOut = true) }

    /** Voice feedback for noisy factory floors. Best-effort — silently
     *  no-ops if the device has no TTS engine installed. */
    private var tts: TextToSpeech? = null
    @Volatile private var ttsReady: Boolean = false

    private val mainHandler = Handler(Looper.getMainLooper())

    /** Repaints the header clock once a minute. */
    private val clockRunnable = object : Runnable {
        override fun run() {
            updateHeaderClock()
            mainHandler.postDelayed(this, 30_000L)
        }
    }
    private val hideOverlayRunnable = Runnable {
        val overlay = binding.successOverlay
        if (overlay.visibility != View.VISIBLE) return@Runnable
        val card = binding.successCard
        val anim = AnimationUtils.loadAnimation(this, R.anim.kiosk_card_out)
        anim.setAnimationListener(object : android.view.animation.Animation.AnimationListener {
            override fun onAnimationStart(a: android.view.animation.Animation?) {}
            override fun onAnimationRepeat(a: android.view.animation.Animation?) {}
            override fun onAnimationEnd(a: android.view.animation.Animation?) {
                overlay.visibility = View.GONE
                binding.statusText.text = getString(R.string.kiosk_look_at_camera)
            }
        })
        card.startAnimation(anim)
    }

    private val cameraPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) startCamera() else binding.statusText.text = getString(R.string.permission_camera_required)
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityCameraBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Initial header content; branchName is filled in once the roster
        // load returns. We don't block startup on that — workers should see
        // the brand strip and clock immediately.
        binding.headerBranch.text = getString(R.string.kiosk_branch_unknown)
        updateHeaderClock()
        mainHandler.post(clockRunnable)

        initTts()
        applyImmersive()
        startLockTaskIfPermitted()

        loadRoster()

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED) {
            startCamera()
        } else {
            cameraPermission.launch(Manifest.permission.CAMERA)
        }
    }

    override fun onDestroy() {
        mainHandler.removeCallbacks(hideOverlayRunnable)
        mainHandler.removeCallbacks(clockRunnable)
        mainHandler.removeCallbacks(pendingChallengeTimeout)
        try { tts?.stop(); tts?.shutdown() } catch (_: Exception) {}
        super.onDestroy()
    }

    /** Hide system bars so the kiosk fills the screen. Called on resume too
     *  because the system can re-show them after dialogs / power events. */
    private fun applyImmersive() {
        val win = window
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            win.setDecorFitsSystemWindows(false)
            win.insetsController?.let { ic ->
                ic.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                ic.systemBarsBehavior =
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            win.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                )
        }
    }

    override fun onResume() {
        super.onResume()
        applyImmersive()
    }

    /** Best-effort screen pinning. Only takes effect if a Device Owner /
     *  DPC has whitelisted this package via setLockTaskPackages, OR if the
     *  user has accepted the standard "Pin app" prompt. Silently no-ops
     *  otherwise so we don't crash on un-provisioned devices. */
    private fun startLockTaskIfPermitted() {
        try { startLockTask() } catch (_: Exception) {}
    }

    private fun initTts() {
        tts = TextToSpeech(applicationContext) { status ->
            ttsReady = status == TextToSpeech.SUCCESS
            if (ttsReady) {
                // Match the device locale so Hindi/Telugu speakers get
                // localised voice feedback when those engines are present.
                runCatching { tts?.language = Locale.getDefault() }
            }
        }
    }

    private fun speak(text: String) {
        if (!ttsReady) return
        try {
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "kiosk")
        } catch (_: Exception) {}
    }

    private fun updateHeaderClock() {
        binding.headerClock.text =
            SimpleDateFormat("hh:mm a", Locale.getDefault()).format(Date())
        binding.headerDate.text =
            SimpleDateFormat("EEE, dd MMM", Locale.getDefault()).format(Date())
    }

    private fun loadRoster() {
        lifecycleScope.launch {
            try {
                val roster = withContext(Dispatchers.IO) { app.apiClient.fetchRoster() }
                matcher = RosterMatcher(roster.enrollments)
                binding.headerBranch.text = roster.branchName
                    ?: roster.clientName
                    ?: getString(R.string.kiosk_branch_unknown)
                if (roster.enrollments.isEmpty()) {
                    binding.statusText.text = getString(R.string.roster_empty)
                }
            } catch (e: Exception) {
                binding.statusText.text = "Roster load failed: ${e.message}"
            }
        }
    }

    private fun startCamera() {
        capture = FaceCaptureSession(
            context = this,
            owner = this,
            previewView = binding.previewView,
            scope = lifecycleScope,
            onFace = { probe, liveness -> handleFace(probe, liveness) },
            onError = { code -> runOnUiThread { showCaptureError(code) } },
            onFaceSignal = { signal -> handleFaceSignal(signal) },
        ).also { it.start() }
    }

    private fun showCaptureError(code: String) {
        binding.statusText.text = when {
            code == "face_model_missing" -> getString(R.string.face_model_missing)
            code.startsWith("face_embed_failed") -> getString(R.string.face_embed_failed, code.substringAfter(':'))
            code.startsWith("multiple_faces") -> {
                val n = code.substringAfter(':').toIntOrNull() ?: 2
                getString(R.string.face_multiple_detected, n)
            }
            code == "hint:no_face" -> getString(R.string.hint_no_face)
            code == "hint:too_small" -> getString(R.string.hint_too_small)
            code == "hint:too_dim" -> getString(R.string.hint_too_dim)
            else -> code
        }
    }

    private suspend fun handleFace(probe: FloatArray, liveness: Double) {
        val now = System.currentTimeMillis()
        val matcherSnap = matcher ?: return
        if (dialogActive) return
        // While a challenge is in flight ignore further embeddings — the
        // user has already been matched and we're only waiting for the
        // gesture to be performed.
        if (pendingChallengeTracker != null) return
        if (now - lastPunchAt < COOLDOWN_MS) return
        if (liveness < MIN_LIVENESS) return

        val match = matcherSnap.match(probe, MIN_MATCH) ?: run {
            runOnUiThread {
                binding.statusText.text = getString(R.string.kiosk_match_low)
                speak(getString(R.string.kiosk_voice_face_not_recognised))
            }
            return
        }

        // Roll the per-day map over at midnight.
        val day = currentDayKey()
        if (day != todayKey) {
            todayKey = day
            todayPunches.clear()
        }

        val empId = match.entry.employeeId
        val prev = todayPunches[empId]
        when {
            prev == null -> {
                // First time today on this device -> log them IN immediately.
                beginChallenge(match, "IN", liveness)
            }
            prev.direction == "IN" -> {
                // Already punched in today — confirm before queuing OUT so accidental
                // looks at the camera don't log the user out.
                lastPunchAt = now  // still throttle so we don't spam the dialog
                runOnUiThread { showLogoutConfirmation(match, liveness) }
            }
            else -> {
                // Already punched out today -> just acknowledge, never queue
                // another OUT (which would otherwise overwrite the time).
                lastPunchAt = now
                runOnUiThread { showAlreadyDoneInfo(match) }
            }
        }
    }

    /**
     * Switches the kiosk into "challenge mode": picks a random gesture,
     * displays its localized prompt, arms the [LivenessChallengeTracker]
     * that [handleFaceSignal] feeds, and schedules a timeout that aborts
     * the punch if the gesture isn't completed.
     */
    private fun beginChallenge(match: RosterMatcher.Match, direction: String, liveness: Double) {
        val challenge = LivenessChallenge.random()
        pendingChallengeMatch = match
        pendingChallengeLiveness = liveness
        pendingChallengeDirection = direction
        pendingChallengeTracker = LivenessChallengeTracker(challenge)
        runOnUiThread {
            binding.statusText.text = getString(
                R.string.kiosk_liveness_prompt_with_name,
                match.entry.displayName,
                getString(promptResFor(challenge)),
            )
            speak(getString(promptResFor(challenge)))
        }
        mainHandler.removeCallbacks(pendingChallengeTimeout)
        mainHandler.postDelayed(pendingChallengeTimeout, CHALLENGE_TIMEOUT_MS)
    }

    private fun handleFaceSignal(signal: FaceSignal) {
        val tracker = pendingChallengeTracker ?: return
        val match = pendingChallengeMatch ?: return
        if (!tracker.feed(signal)) return
        // Tracker just flipped to passed \u2014 finalise the punch on the main
        // thread and clear the timeout. recordPunch() reads the tracker
        // back out for the wire fields, so we don't pass them in here.
        mainHandler.removeCallbacks(pendingChallengeTimeout)
        runOnUiThread {
            binding.statusText.text = getString(R.string.liveness_passed)
        }
        lifecycleScope.launch {
            recordPunch(match, pendingChallengeDirection, pendingChallengeLiveness)
        }
    }

    private fun abortChallenge(timedOut: Boolean) {
        if (pendingChallengeTracker == null) return
        pendingChallengeTracker = null
        pendingChallengeMatch = null
        mainHandler.removeCallbacks(pendingChallengeTimeout)
        // Reset cooldown so a determined user can immediately retry.
        lastPunchAt = System.currentTimeMillis() - (COOLDOWN_MS - 3_000L).coerceAtLeast(0L)
        runOnUiThread {
            binding.statusText.text = getString(
                if (timedOut) R.string.liveness_timeout else R.string.liveness_failed_retry
            )
        }
    }

    private fun promptResFor(c: LivenessChallenge): Int = when (c) {
        LivenessChallenge.BLINK -> R.string.liveness_prompt_blink
        LivenessChallenge.SMILE -> R.string.liveness_prompt_smile
        LivenessChallenge.HEAD_TURN_LEFT -> R.string.liveness_prompt_head_left
        LivenessChallenge.HEAD_TURN_RIGHT -> R.string.liveness_prompt_head_right
    }

    private fun showAlreadyDoneInfo(match: RosterMatcher.Match) {
        if (dialogActive) return
        dialogActive = true
        MaterialAlertDialogBuilder(this)
            .setIcon(R.drawable.ic_shield_check)
            .setTitle(R.string.kiosk_already_done_title)
            .setMessage(getString(R.string.kiosk_already_done_message, match.entry.displayName))
            .setCancelable(false)
            .setPositiveButton(R.string.kiosk_already_done_ok) { d, _ ->
                d.dismiss()
                dialogActive = false
                lastPunchAt = System.currentTimeMillis()
                binding.statusText.text = getString(R.string.kiosk_look_at_camera)
            }
            .show()
    }

    private fun showLogoutConfirmation(match: RosterMatcher.Match, liveness: Double) {
        if (dialogActive) return
        dialogActive = true
        MaterialAlertDialogBuilder(this)
            .setIcon(R.drawable.ic_shield_check)
            .setTitle(R.string.kiosk_logout_confirm_title)
            .setMessage(getString(R.string.kiosk_logout_confirm_message, match.entry.displayName))
            .setCancelable(false)
            .setPositiveButton(R.string.kiosk_logout_confirm_yes) { d, _ ->
                d.dismiss()
                dialogActive = false
                lastPunchAt = System.currentTimeMillis()
                beginChallenge(match, "OUT", liveness)
            }
            .setNegativeButton(R.string.kiosk_logout_confirm_no) { d, _ ->
                d.dismiss()
                dialogActive = false
                // Reset cooldown so the dialog doesn't pop again immediately.
                lastPunchAt = System.currentTimeMillis()
                binding.statusText.text = getString(R.string.kiosk_look_at_camera)
            }
            .show()
    }

    private suspend fun recordPunch(match: RosterMatcher.Match, direction: String, liveness: Double) {
        val now = System.currentTimeMillis()
        lastPunchAt = now
        val tracker = pendingChallengeTracker
        val challengeType = tracker?.challenge?.wireName
        val challengePassedAt = tracker?.passedAtIso()
        // Clear before any UI work so a stale tracker can't re-fire.
        pendingChallengeTracker = null
        pendingChallengeMatch = null
        mainHandler.removeCallbacks(pendingChallengeTimeout)
        val q = QueuedPunch(
            employeeId = match.entry.employeeId,
            employeeCode = match.entry.employeeCode,
            punchTimeIso = isoNow(),
            direction = direction,
            matchScore = match.score,
            livenessScore = liveness,
            captureLat = null,
            captureLng = null,
            captureAccuracyM = null,
            livenessChallengeType = challengeType,
            livenessChallengePassedAtIso = challengePassedAt,
        )
        withContext(Dispatchers.IO) { app.database.punchDao().insert(q) }
        WorkManager.getInstance(this).enqueue(
            OneTimeWorkRequestBuilder<PunchSyncWorker>().build()
        )
        todayPunches[match.entry.employeeId] = PunchState(direction, now)
        runOnUiThread { showPunchSuccess(match.entry.displayName, direction) }
    }

    private fun showPunchSuccess(name: String, direction: String) {
        val isOut = direction == "OUT"
        binding.successTitle.text = getString(
            if (isOut) R.string.kiosk_punch_out_title else R.string.kiosk_punch_in_title
        )
        binding.successName.text = name
        binding.successTime.text = getString(
            R.string.kiosk_time_format, formatLocalTime(), formatLocalDate()
        )
        binding.successBadge.setBackgroundResource(
            if (isOut) R.drawable.bg_badge_out else R.drawable.bg_badge_in
        )
        binding.successBadgeIcon.setImageResource(
            if (isOut) R.drawable.ic_logout_white else R.drawable.ic_check_white
        )
        binding.successBadgeChip.text = getString(
            if (isOut) R.string.kiosk_badge_out else R.string.kiosk_badge_in
        )
        binding.successOverlay.visibility = View.VISIBLE
        binding.successCard.startAnimation(
            AnimationUtils.loadAnimation(this, R.anim.kiosk_card_in)
        )
        binding.statusText.text = getString(R.string.kiosk_look_at_camera)
        speak(
            getString(
                if (isOut) R.string.kiosk_voice_logout_recorded
                else R.string.kiosk_voice_recorded,
                name,
            )
        )
        mainHandler.removeCallbacks(hideOverlayRunnable)
        mainHandler.postDelayed(hideOverlayRunnable, OVERLAY_VISIBLE_MS)
    }

    private fun formatLocalDate(): String =
        SimpleDateFormat("dd MMM", Locale.getDefault()).format(Date())

    private fun isoNow(): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(Date())
    }

    private fun formatLocalTime(): String =
        SimpleDateFormat("hh:mm a", Locale.getDefault()).format(Date())

    private fun currentDayKey(): String =
        SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

    companion object {
        private const val MIN_MATCH = 0.78
        private const val MIN_LIVENESS = 0.5
        // Bumped from 8 s -> 30 s so the kiosk doesn't immediately re-capture
        // a person right after their punch is recorded (which previously felt
        // like an instant logout).
        private const val COOLDOWN_MS = 30_000L
        private const val OVERLAY_VISIBLE_MS = 4_000L
        /** How long the user has to perform the active-liveness gesture
         *  after their face has been matched. Tuned to be long enough for
         *  a head-turn but short enough that a person who walks away
         *  doesn't pin the kiosk in challenge mode. */
        private const val CHALLENGE_TIMEOUT_MS = 8_000L
    }
}
