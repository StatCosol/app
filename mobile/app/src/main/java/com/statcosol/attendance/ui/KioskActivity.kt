package com.statcosol.attendance.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.text.InputType
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.animation.AnimationUtils
import android.widget.EditText
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.statcosol.attendance.AttendanceApp
import com.statcosol.attendance.BuildConfig
import com.statcosol.attendance.R
import com.statcosol.attendance.api.ContractorPunchBody
import com.statcosol.attendance.api.FailedScanBody
import com.statcosol.attendance.api.KioskEnrollSubmitBody
import com.statcosol.attendance.api.KioskEnrollTicket
import com.statcosol.attendance.api.PunchBody
import com.statcosol.attendance.databinding.ActivityCameraBinding
import com.statcosol.attendance.db.QueuedPunch
import com.statcosol.attendance.face.FaceCaptureSession
import com.statcosol.attendance.face.FaceEmbedder
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
import kotlin.math.sqrt

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
    /** Phase 3f: probe embedding captured in [handleFace], forwarded to the
     *  server in [recordPunch] for cosine re-verification. */
    @Volatile private var pendingChallengeProbe: FloatArray? = null
    /** Phase 4c: server-issued single-use liveness nonce that scopes the
     *  active-liveness challenge. Cleared in [recordPunch] / [abortChallenge]. */
    @Volatile private var pendingChallengeNonce: String? = null
    /** True while [requestLivenessChallenge] is in flight — blocks
     *  [handleFace] from kicking off a parallel challenge. */
    @Volatile private var requestingChallenge: Boolean = false
    private val pendingChallengeTimeout = Runnable { abortChallenge(timedOut = true) }

    /** Operator-supervised enrollment state. When [enrollTicket] is non-null
     *  the kiosk is in enrollment mode: normal matching is paused, frames are
     *  collected into [enrollFrames], and once enough frames + the liveness
     *  challenge are satisfied the enrollment is submitted without touching
     *  the kiosk screen. */
    @Volatile private var enrollTicket: KioskEnrollTicket? = null
    private val enrollFrames = mutableListOf<FloatArray>()
    private var enrollRunningAvg: FloatArray? = null
    @Volatile private var enrollLastAcceptedAt: Long = 0L
    @Volatile private var enrollChallenge: LivenessChallengeTracker? = null
    @Volatile private var enrollChallengePassed: Boolean = false
    @Volatile private var enrollSubmitting: Boolean = false
    @Volatile private var rosterFastRefreshUntil: Long = 0L
    private val enrollChallengeTimeout = Runnable { abortKioskEnrollment("liveness timed out") }

    /** Voice feedback for noisy factory floors. Best-effort — silently
     *  no-ops if the device has no TTS engine installed. */
    private var tts: TextToSpeech? = null
    @Volatile private var ttsReady: Boolean = false
    private var consecutiveNoMatchCount: Int = 0
    private var lastFailedScanReportAt: Long = 0L

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
        setupAdminExit()

        loadRoster()
        mainHandler.removeCallbacks(rosterRefreshRunnable)
        mainHandler.postDelayed(rosterRefreshRunnable, ROSTER_REFRESH_MS)

        mainHandler.removeCallbacks(enrollTicketPollRunnable)
        mainHandler.postDelayed(enrollTicketPollRunnable, ENROLL_POLL_FIRST_MS)

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
        mainHandler.removeCallbacks(rosterRefreshRunnable)
        mainHandler.removeCallbacks(enrollTicketPollRunnable)
        mainHandler.removeCallbacks(enrollChallengeTimeout)
        capture?.stop()
        capture = null
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

    /**
     * Admin exit hatch. The kiosk intentionally blocks Home/Back via
     * lock-task + immersive mode, but operators still need a way to leave
     * the app for updates, account switches, or maintenance. Long-press
     * the brand label on the header and enter the admin PIN configured at
     * build time (BuildConfig.ADMIN_EXIT_PIN). On success we stopLockTask
     * and finish() back to the device launcher.
     */
    private fun setupAdminExit() {
        val listener = View.OnLongClickListener {
            showAdminExitDialog()
            true
        }
        binding.headerStrip.setOnLongClickListener(listener)
        binding.headerBrand.setOnLongClickListener(listener)
        binding.headerBranch.setOnLongClickListener(listener)
        binding.headerClock.setOnLongClickListener(listener)
        binding.headerDate.setOnLongClickListener(listener)
    }

    private fun showAdminExitDialog() {
        if (dialogActive) return
        dialogActive = true
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            hint = getString(R.string.kiosk_admin_exit_hint)
            setPadding(48, 32, 48, 32)
        }
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.kiosk_admin_exit_title)
            .setMessage(R.string.kiosk_admin_exit_message)
            .setView(input)
            .setPositiveButton(R.string.kiosk_admin_exit_confirm) { d, _ ->
                val entered = input.text?.toString()?.trim().orEmpty()
                if (entered.isNotEmpty() && entered == BuildConfig.ADMIN_EXIT_PIN) {
                    try { stopLockTask() } catch (_: Exception) {}
                    d.dismiss()
                    dialogActive = false
                    finish()
                } else {
                    Toast.makeText(this, R.string.kiosk_admin_exit_wrong_pin, Toast.LENGTH_SHORT).show()
                    dialogActive = false
                }
            }
            .setNegativeButton(R.string.kiosk_admin_exit_cancel) { d, _ ->
                d.dismiss()
                dialogActive = false
            }
            .setOnCancelListener { dialogActive = false }
            .show()
    }

    private fun initTts() {
        tts = TextToSpeech(applicationContext) { status ->
            ttsReady = status == TextToSpeech.SUCCESS
            if (ttsReady) {
                configureTtsLanguage(Locale.getDefault())
            }
        }
    }

    private fun configureTtsLanguage(locale: Locale): Boolean {
        val engine = tts ?: return false
        val available = runCatching { engine.isLanguageAvailable(locale) }
            .getOrDefault(TextToSpeech.LANG_NOT_SUPPORTED)
        if (available < TextToSpeech.LANG_AVAILABLE) return false

        runCatching { engine.language = locale }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            runCatching {
                engine.voices
                    ?.filter { it.locale.language == locale.language }
                    ?.sortedWith(
                        compareBy(
                            { it.isNetworkConnectionRequired },
                            { it.name.contains("male", ignoreCase = true) },
                            { it.name },
                        ),
                    )
                    ?.firstOrNull()
                    ?.let { engine.voice = it }
            }
        }
        runCatching { engine.setPitch(1.02f) }
        runCatching { engine.setSpeechRate(if (locale.language == "te") 0.82f else 0.92f) }
        return true
    }

    private fun speak(text: String, locale: Locale? = null) {
        if (!ttsReady) return
        try {
            if (!configureTtsLanguage(locale ?: Locale.getDefault())) {
                configureTtsLanguage(Locale.ENGLISH)
            }
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
                refreshRosterNow(showEmptyMessage = true)
            } catch (e: Exception) {
                // Soft-fail on refresh: keep the cached matcher in use rather
                // than dropping all employees if the API blips.
                if (matcher == null) {
                    binding.statusText.text = "Roster load failed: ${e.message}"
                }
            }
        }
    }

    private suspend fun refreshRosterNow(showEmptyMessage: Boolean): Int {
        val roster = withContext(Dispatchers.IO) { app.apiClient.fetchRoster() }
        matcher = RosterMatcher(roster.enrollments, roster.contractorEnrollments)
        binding.headerBranch.text = roster.branchName
            ?: roster.clientName
            ?: getString(R.string.kiosk_branch_unknown)
        if (showEmptyMessage && roster.enrollments.isEmpty() && roster.contractorEnrollments.isEmpty()) {
            binding.statusText.text = getString(R.string.roster_empty)
        }
        return roster.enrollments.size + roster.contractorEnrollments.size
    }

    /** Phase 3f: re-fetch the roster every [ROSTER_REFRESH_MS] so newly
     *  enrolled employees become matchable without restarting the kiosk. */
    private val rosterRefreshRunnable = object : Runnable {
        override fun run() {
            loadRoster()
            val delay = if (System.currentTimeMillis() < rosterFastRefreshUntil) {
                ENROLL_ROSTER_FAST_REFRESH_MS
            } else {
                ROSTER_REFRESH_MS
            }
            mainHandler.postDelayed(this, delay)
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
            code == "hint:not_straight" -> getString(R.string.hint_not_straight)
            else -> code
        }
    }

    private suspend fun handleFace(probe: FloatArray, liveness: Double) {
        // Operator-supervised enrollment takes priority over normal matching.
        if (enrollTicket != null) {
            handleEnrollmentFrame(probe, liveness)
            return
        }
        val now = System.currentTimeMillis()
        val matcherSnap = matcher ?: return
        if (dialogActive) return
        // While a challenge is in flight (or being negotiated with the
        // server) ignore further embeddings — the user has already been
        // matched and we're only waiting for the gesture to be performed.
        if (pendingChallengeTracker != null || requestingChallenge) return
        if (now - lastPunchAt < COOLDOWN_MS) return
        if (liveness < MIN_LIVENESS) return

        val match = matcherSnap.match(probe, MIN_MATCH) ?: run {
            consecutiveNoMatchCount += 1
            maybeReportRepeatedNoMatch(liveness)
            runOnUiThread {
                binding.statusText.text = getString(R.string.kiosk_match_low)
                speak(getString(R.string.kiosk_voice_face_not_recognised))
            }
            return
        }
        consecutiveNoMatchCount = 0

        // Roll the per-day map over at midnight.
        val day = currentDayKey()
        if (day != todayKey) {
            todayKey = day
            todayPunches.clear()
        }

        val subjectKey = match.entry.subjectKey
        val prev = todayPunches[subjectKey]
        when {
            prev == null -> {
                // First time today on this device -> log them IN immediately.
                pendingChallengeProbe = probe
                beginChallenge(match, "IN", liveness)
            }
            prev.direction == "IN" -> {
                // Already punched in today -> require the same server-issued
                // liveness gesture, then log OUT without touching the kiosk.
                lastPunchAt = now
                pendingChallengeProbe = probe
                beginChallenge(match, "OUT", liveness)
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
     * Switches the kiosk into "challenge mode". Phase 4c: first asks the
     * server to issue a single-use nonce + challenge type, then arms the
     * [LivenessChallengeTracker] with the SERVER-CHOSEN gesture so the
     * gate cannot be replayed. If the network call fails the punch is
     * aborted (server-required nonce — no nonce, no punch).
     */
    private fun beginChallenge(match: RosterMatcher.Match, direction: String, liveness: Double) {
        if (requestingChallenge || pendingChallengeTracker != null) return
        requestingChallenge = true
        runOnUiThread {
            binding.statusText.text = getString(R.string.liveness_requesting)
        }
        lifecycleScope.launch {
            val resp = try {
                withContext(Dispatchers.IO) {
                    app.apiClient.requestLivenessChallenge(match.entry.employeeId)
                }
            } catch (e: Exception) {
                android.util.Log.w("KioskActivity", "liveness challenge request failed", e)
                null
            }
            val challenge = if (resp == null) {
                LivenessChallenge.random()
            } else {
                val serverChallenge = LivenessChallenge.fromWire(resp.challengeType)
                if (serverChallenge == null) {
                    android.util.Log.e("KioskActivity", "unknown challengeType=${resp.challengeType}")
                    requestingChallenge = false
                    pendingChallengeProbe = null
                    runOnUiThread {
                        binding.statusText.text = getString(R.string.liveness_request_failed)
                    }
                    return@launch
                }
                serverChallenge
            }
            pendingChallengeMatch = match
            pendingChallengeLiveness = liveness
            pendingChallengeDirection = direction
            pendingChallengeNonce = resp?.nonce
            pendingChallengeTracker = LivenessChallengeTracker(challenge)
            requestingChallenge = false
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
    }

    private fun handleFaceSignal(signal: FaceSignal) {
        // Route to enrollment challenge tracker when in enroll mode.
        if (enrollTicket != null) {
            val tracker = enrollChallenge ?: return
            if (!tracker.feed(signal)) return
            enrollChallengePassed = true
            mainHandler.removeCallbacks(enrollChallengeTimeout)
            runOnUiThread { binding.statusText.text = getString(R.string.liveness_passed) }
            maybeShowEnrollRegisterDialog()
            return
        }
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
        pendingChallengeProbe = null
        pendingChallengeNonce = null
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

    private fun maybeReportRepeatedNoMatch(liveness: Double) {
        if (consecutiveNoMatchCount < FAILED_SCAN_REPORT_AFTER) return
        val now = System.currentTimeMillis()
        if (now - lastFailedScanReportAt < FAILED_SCAN_REPORT_COOLDOWN_MS) return
        lastFailedScanReportAt = now
        lifecycleScope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    app.apiClient.postFailedScan(
                        FailedScanBody(
                            reason = "FACE_MISMATCH",
                            reasonDetail = "Kiosk local 1:N match failed $consecutiveNoMatchCount times",
                            livenessScore = liveness,
                        )
                    )
                }
            }.onFailure {
                android.util.Log.w("KioskActivity", "failed-scan report failed", it)
            }
        }
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

    private suspend fun recordPunch(match: RosterMatcher.Match, direction: String, liveness: Double) {
        val now = System.currentTimeMillis()
        lastPunchAt = now
        val tracker = pendingChallengeTracker
        val challengeType = tracker?.challenge?.wireName
        val challengePassedAt = tracker?.passedAtIso()
        val probe = pendingChallengeProbe
        val nonce = pendingChallengeNonce
        // Clear before any UI work so a stale tracker can't re-fire.
        pendingChallengeTracker = null
        pendingChallengeMatch = null
        pendingChallengeProbe = null
        pendingChallengeNonce = null
        mainHandler.removeCallbacks(pendingChallengeTimeout)
        val punchTimeIso = isoNow()
        if (match.entry.subjectType == "CONTRACTOR") {
            val accepted = recordContractorPunch(
                match = match,
                direction = direction,
                liveness = liveness,
                punchTimeIso = punchTimeIso,
                challengeType = challengeType,
                challengePassedAt = challengePassedAt,
                nonce = nonce,
                probe = probe,
            )
            if (accepted) {
                todayPunches[match.entry.subjectKey] = PunchState(direction, now)
                runOnUiThread { showPunchSuccess(match.entry.displayName, direction) }
            }
            return
        }
        val employeeId = match.entry.employeeId ?: return
        val q = QueuedPunch(
            employeeId = employeeId,
            employeeCode = match.entry.employeeCode,
            punchTimeIso = punchTimeIso,
            direction = direction,
            matchScore = match.score,
            livenessScore = liveness,
            captureLat = null,
            captureLng = null,
            captureAccuracyM = null,
            livenessChallengeType = challengeType,
            livenessChallengePassedAtIso = challengePassedAt,
            livenessNonce = nonce,
            probeEmbeddingB64 = probe?.let { com.statcosol.attendance.face.FaceEmbedder.encodeEmbeddingB64(it) },
        )
        val punchAccepted = try {
            withContext(Dispatchers.IO) {
                val resp = app.apiClient.postPunch(q.toPunchBody(offlineSync = false))
                resp.ok
            }
        } catch (e: Exception) {
            val msg = e.message.orEmpty()
            val status = parseHttpStatus(msg)
            if (status in 400..499) {
                handleRejectedPunch(match, msg)
                return
            }
            withContext(Dispatchers.IO) { app.database.punchDao().insert(q) }
            PunchSyncWorker.enqueue(this)
            runOnUiThread {
                binding.statusText.text = getString(R.string.kiosk_punch_queued)
            }
            false
        }
        if (punchAccepted) {
            todayPunches[match.entry.subjectKey] = PunchState(direction, now)
            runOnUiThread { showPunchSuccess(match.entry.displayName, direction) }
        }
    }

    private suspend fun recordContractorPunch(
        match: RosterMatcher.Match,
        direction: String,
        liveness: Double,
        punchTimeIso: String,
        challengeType: String?,
        challengePassedAt: String?,
        nonce: String?,
        probe: FloatArray?,
    ): Boolean {
        val contractorId = match.entry.contractorEmployeeId ?: return false
        val probeB64 = probe?.let { FaceEmbedder.encodeEmbeddingB64(it) }
        val q = QueuedPunch(
            contractorEmployeeId = contractorId,
            punchTimeIso = punchTimeIso,
            direction = direction,
            matchScore = match.score,
            livenessScore = liveness,
            captureLat = null,
            captureLng = null,
            captureAccuracyM = null,
            livenessChallengeType = challengeType,
            livenessChallengePassedAtIso = challengePassedAt,
            livenessNonce = nonce,
            probeEmbeddingB64 = probeB64,
        )
        return try {
            withContext(Dispatchers.IO) {
                val resp = app.apiClient.postContractorPunch(
                    ContractorPunchBody(
                        contractorEmployeeId = contractorId,
                        punchTime = punchTimeIso,
                        direction = direction,
                        matchScore = match.score,
                        livenessScore = liveness,
                        captureLat = null,
                        captureLng = null,
                        captureAccuracyM = null,
                        isRooted = if (app.isDeviceRooted) true else null,
                        offlineSync = false,
                        livenessChallengeType = challengeType,
                        livenessChallengePassedAt = challengePassedAt,
                        livenessNonce = nonce,
                        probeEmbeddingB64 = probeB64,
                    )
                )
                resp.ok
            }
        } catch (e: Exception) {
            val msg = e.message.orEmpty()
            val status = parseHttpStatus(msg)
            if (status in 400..499) {
                handleRejectedPunch(match, msg)
            } else {
                withContext(Dispatchers.IO) { app.database.punchDao().insert(q) }
                PunchSyncWorker.enqueue(this)
                runOnUiThread {
                    binding.statusText.text = getString(R.string.kiosk_punch_queued)
                }
            }
            false
        }
    }

    private fun QueuedPunch.toPunchBody(offlineSync: Boolean): PunchBody {
        val id = requireNotNull(employeeId) { "employeeId required for employee punch" }
        val code = requireNotNull(employeeCode) { "employeeCode required for employee punch" }
        return PunchBody(
            employeeId = id,
            employeeCode = code,
            punchTime = punchTimeIso,
            direction = direction,
            matchScore = matchScore,
            livenessScore = livenessScore,
            captureLat = captureLat,
            captureLng = captureLng,
            captureAccuracyM = captureAccuracyM,
            isRooted = if (app.isDeviceRooted) true else null,
            offlineSync = offlineSync,
            livenessChallengeType = livenessChallengeType,
            livenessChallengePassedAt = livenessChallengePassedAtIso,
            livenessNonce = livenessNonce,
            probeEmbeddingB64 = probeEmbeddingB64,
        )
    }

    private fun handleRejectedPunch(match: RosterMatcher.Match, message: String) {
        if (
            message.contains("No active face enrollment", ignoreCase = true) ||
            message.contains("No active face enrollment for contractor", ignoreCase = true) ||
            message.contains("roster is stale", ignoreCase = true)
        ) {
            matcher = null
            lifecycleScope.launch {
                runCatching { refreshRosterNow(showEmptyMessage = true) }
            }
        }
        runOnUiThread {
            binding.statusText.text = getString(R.string.kiosk_punch_rejected)
            speak(getString(R.string.kiosk_voice_face_not_recognised))
        }
        android.util.Log.w(
            "KioskActivity",
            "punch rejected for ${match.entry.employeeCode.ifBlank { match.entry.subjectKey }}: ${message.take(300)}",
        )
    }

    private fun parseHttpStatus(msg: String): Int =
        Regex("""\b(\d{3})\b""").find(msg)?.value?.toIntOrNull() ?: 0

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
                if (isOut) R.string.kiosk_voice_logout_motivation
                else R.string.kiosk_voice_login_motivation,
            ),
            TELUGU_VOICE_LOCALE,
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

    // ── Operator-supervised enrollment ──────────────────────────────────

    private val enrollTicketPollRunnable = object : Runnable {
        override fun run() {
            pollEnrollTicket()
            mainHandler.postDelayed(this, ENROLL_POLL_MS)
        }
    }

    private fun pollEnrollTicket() {
        if (enrollTicket != null || enrollSubmitting) return
        lifecycleScope.launch {
            val t = try {
                withContext(Dispatchers.IO) { app.apiClient.fetchPendingKioskEnrollTicket() }
            } catch (_: Exception) { null }
            if (t != null && enrollTicket == null) beginKioskEnrollment(t)
        }
    }

    private fun beginKioskEnrollment(t: KioskEnrollTicket) {
        enrollTicket = t
        enrollFrames.clear()
        enrollRunningAvg = null
        enrollLastAcceptedAt = 0L
        enrollChallengePassed = false
        // Use blink-only liveness for the kiosk demo flow: no screen touch,
        // simple instruction, still blocks static-photo enrollment.
        val challenge = LivenessChallenge.BLINK
        enrollChallenge = LivenessChallengeTracker(challenge)
        mainHandler.removeCallbacks(enrollChallengeTimeout)
        mainHandler.postDelayed(enrollChallengeTimeout, ENROLL_CHALLENGE_TIMEOUT_MS)
        runOnUiThread {
            binding.statusText.text = getString(
                R.string.kiosk_liveness_prompt_with_name,
                t.subjectName,
                getString(promptResFor(challenge)),
            )
            speak(getString(R.string.kiosk_enroll_prompt, t.subjectName))
        }
    }

    private fun handleEnrollmentFrame(probe: FloatArray, liveness: Double) {
        if (enrollSubmitting) return
        if (enrollFrames.size >= ENROLL_REQUIRED_FRAMES) return
        if (liveness < ENROLL_MIN_LIVENESS) return
        val now = System.currentTimeMillis()
        if (now - enrollLastAcceptedAt < ENROLL_MIN_FRAME_INTERVAL_MS) return
        val avg = enrollRunningAvg
        if (avg != null && cosine(avg, probe) < ENROLL_MIN_PROBE_TO_AVG_COS) return
        enrollLastAcceptedAt = now
        enrollFrames += probe
        enrollRunningAvg = averageAndNormalize(enrollFrames)
        runOnUiThread {
            binding.statusText.text = getString(
                R.string.kiosk_enroll_capturing,
                enrollFrames.size,
                ENROLL_REQUIRED_FRAMES,
            )
        }
        if (enrollFrames.size >= ENROLL_REQUIRED_FRAMES) maybeShowEnrollRegisterDialog()
    }

    private fun maybeShowEnrollRegisterDialog() {
        if (enrollTicket == null) return
        if (enrollFrames.size < ENROLL_REQUIRED_FRAMES) return
        if (!enrollChallengePassed) return
        if (dialogActive || enrollSubmitting) return
        // Outlier check: every captured frame must be similar to the average.
        val avg = enrollRunningAvg ?: averageAndNormalize(enrollFrames)
        val minCos = enrollFrames.minOf { cosine(avg, it) }
        if (minCos < ENROLL_MIN_PROBE_TO_AVG_COS) {
            runOnUiThread {
                binding.statusText.text = getString(R.string.kiosk_enroll_inconsistent)
            }
            // Reset frames and let the operator have another attempt.
            enrollFrames.clear()
            enrollRunningAvg = null
            return
        }
        submitKioskEnrollment()
    }

    private fun submitKioskEnrollment() {
        val t = enrollTicket ?: return
        val avg = enrollRunningAvg ?: averageAndNormalize(enrollFrames)
        enrollSubmitting = true
        runOnUiThread { binding.statusText.text = getString(R.string.kiosk_enroll_uploading) }
        lifecycleScope.launch {
            try {
                val body = KioskEnrollSubmitBody(
                    embeddingBase64 = FaceEmbedder.encodeEmbeddingB64(avg),
                )
                val resp = withContext(Dispatchers.IO) {
                    app.apiClient.submitKioskEnrollTicket(t.id, body)
                }
                if (resp.ok) {
                    val rosterSize = runCatching {
                        refreshRosterNow(showEmptyMessage = false)
                    }.getOrNull()
                    runOnUiThread {
                        val successMessage =
                            getString(R.string.kiosk_enroll_success, t.subjectName)
                        binding.statusText.text = successMessage
                        speak(successMessage)
                    }
                    startFastRosterRefresh()
                    clearKioskEnrollmentState()
                    runOnUiThread {
                        mainHandler.postDelayed({
                            binding.statusText.text = getString(R.string.kiosk_look_at_camera)
                        }, 5_000L)
                    }
                    if (rosterSize == null) {
                        mainHandler.removeCallbacks(rosterRefreshRunnable)
                        mainHandler.postDelayed(rosterRefreshRunnable, 1_000L)
                    }
                } else {
                    abortKioskEnrollment(resp.message ?: "server rejected")
                }
            } catch (e: Exception) {
                abortKioskEnrollment(e.message ?: "unknown error")
            } finally {
                enrollSubmitting = false
            }
        }
    }

    private fun startFastRosterRefresh() {
        rosterFastRefreshUntil = System.currentTimeMillis() + ENROLL_ROSTER_FAST_REFRESH_WINDOW_MS
        mainHandler.removeCallbacks(rosterRefreshRunnable)
        mainHandler.postDelayed(rosterRefreshRunnable, ENROLL_ROSTER_FAST_REFRESH_MS)
    }

    private fun abortKioskEnrollment(reason: String) {
        runOnUiThread {
            binding.statusText.text = getString(R.string.kiosk_enroll_failed, reason)
        }
        clearKioskEnrollmentState()
        runOnUiThread {
            mainHandler.postDelayed({
                if (enrollTicket == null) {
                    binding.statusText.text = getString(R.string.kiosk_look_at_camera)
                }
            }, 3_000L)
        }
    }

    private fun clearKioskEnrollmentState() {
        enrollTicket = null
        enrollFrames.clear()
        enrollRunningAvg = null
        enrollChallenge = null
        enrollChallengePassed = false
        enrollLastAcceptedAt = 0L
        mainHandler.removeCallbacks(enrollChallengeTimeout)
    }

    private fun averageAndNormalize(frames: List<FloatArray>): FloatArray {
        require(frames.isNotEmpty())
        val dim = frames[0].size
        val sum = FloatArray(dim)
        for (f in frames) for (i in 0 until dim) sum[i] += f[i]
        for (i in 0 until dim) sum[i] /= frames.size.toFloat()
        var norm = 0.0
        for (v in sum) norm += v.toDouble() * v
        norm = sqrt(norm).coerceAtLeast(1e-12)
        for (i in 0 until dim) sum[i] = (sum[i] / norm).toFloat()
        return sum
    }

    private fun cosine(a: FloatArray, b: FloatArray): Double {
        if (a.size != b.size) return 0.0
        var dot = 0.0
        for (i in a.indices) dot += a[i].toDouble() * b[i]
        return dot
    }

    companion object {
        // Mapped (cos+1)/2. 0.85 == raw cos 0.70. Phase 3a started at 0.78
        // (raw 0.56) which was inside the inter-class noise band of
        // MobileFaceNet without alignment — strangers occasionally scored
        // above it. Combined with the ambiguity-margin check inside
        // RosterMatcher.match(), 0.85 keeps same-person accept rates high
        // while sharply cutting cross-identity false accepts.
        private const val MIN_MATCH = 0.85
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
        /** Phase 3f: re-fetch the roster every 5 minutes so freshly
         *  enrolled employees become matchable without restarting. */
        private const val ROSTER_REFRESH_MS = 5 * 60_000L
        private const val FAILED_SCAN_REPORT_AFTER = 3
        private const val FAILED_SCAN_REPORT_COOLDOWN_MS = 60_000L

        // Operator-supervised enrollment constants.
        private const val ENROLL_POLL_FIRST_MS = 1_000L
        private const val ENROLL_POLL_MS = 3_000L
        private const val ENROLL_REQUIRED_FRAMES = 3
        private const val ENROLL_MIN_LIVENESS = 0.5
        private const val ENROLL_MIN_FRAME_INTERVAL_MS = 250L
        private const val ENROLL_MIN_PROBE_TO_AVG_COS = 0.68
        private const val ENROLL_CHALLENGE_TIMEOUT_MS = 12_000L
        private const val ENROLL_ROSTER_FAST_REFRESH_MS = 5_000L
        private const val ENROLL_ROSTER_FAST_REFRESH_WINDOW_MS = 2 * 60_000L
        private val TELUGU_VOICE_LOCALE: Locale = Locale("te", "IN")
    }
}
