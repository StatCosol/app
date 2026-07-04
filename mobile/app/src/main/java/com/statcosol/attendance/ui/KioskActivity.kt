package com.statcosol.attendance.ui

import android.Manifest
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import android.view.View
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.statcosol.attendance.BuildConfig
import com.statcosol.attendance.R
import com.statcosol.attendance.admin.KioskDeviceAdmin
import com.statcosol.attendance.api.ApiClient
import com.statcosol.attendance.api.ApiException
import com.statcosol.attendance.api.KioskEnrollTicketResponse
import com.statcosol.attendance.api.MobilePunchRequest
import com.statcosol.attendance.api.SubmitKioskEnrollRequest
import com.statcosol.attendance.db.AppDatabase
import com.statcosol.attendance.db.QueuedPunch
import com.statcosol.attendance.face.FaceCaptureSession
import com.statcosol.attendance.face.FaceDetector
import com.statcosol.attendance.face.FaceEmbedder
import com.statcosol.attendance.face.FaceMetrics
import com.statcosol.attendance.face.LivenessChallenge
import com.statcosol.attendance.face.MatchResult
import com.statcosol.attendance.face.RosterMatcher
import com.statcosol.attendance.prefs.DeviceConfig
import com.statcosol.attendance.security.IntegrityCheck
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.sqrt

@ExperimentalGetImage
class KioskActivity : AppCompatActivity() {

    // ── UI ──────────────────────────────────────────────────────────────────
    private lateinit var previewView: PreviewView
    private lateinit var tvHint: TextView
    private lateinit var tvStatus: TextView
    private lateinit var tvDirectionArrow: TextView

    // ── TTS ──────────────────────────────────────────────────────────────────
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var ttsInstallPrompted = false
    private var pendingSpeechText: String? = null
    private var pendingSpeechTag: String = "prompt"
    private var utteranceSeq = 0
    private var idlePromptSpoken = false

    // ── Core dependencies ────────────────────────────────────────────────────
    private lateinit var config: DeviceConfig
    private lateinit var apiClient: ApiClient
    private lateinit var embedder: FaceEmbedder
    private lateinit var faceDetector: FaceDetector
    private lateinit var matcher: RosterMatcher
    private lateinit var cameraExecutor: ExecutorService

    // ── State machine ────────────────────────────────────────────────────────
    sealed class KioskState {
        object Idle : KioskState()
        data class Enrolling(val ticket: KioskEnrollTicketResponse) : KioskState()
        object Punching : KioskState()
        data class Result(val ok: Boolean, val name: String, val direction: String) : KioskState()
    }

    @Volatile private var state: KioskState = KioskState.Idle

    // ── Enrollment capture state ─────────────────────────────────────────────
    // CopyOnWriteArrayList: safe for concurrent reads from camera thread + writes from main/coroutine
    private val enrollFrames = java.util.concurrent.CopyOnWriteArrayList<FloatArray>()
    private var lastEnrollFrameMs = 0L
    private var enrollAvgEmbedding: FloatArray? = null
    @Volatile private var enrollLivenessInFlight = false  // prevents double liveness calls

    // ── Liveness tracking ────────────────────────────────────────────────────
    @Volatile private var pendingChallenge: LivenessChallenge? = null
    @Volatile private var pendingNonce: String? = null
    @Volatile private var challengePassedAt: String? = null
    @Volatile private var livenessScore: Double = 0.0

    // ── Poll job ─────────────────────────────────────────────────────────────
    private var enrollPollJob: Job? = null

    // ── Liveness timeout job ─────────────────────────────────────────────────
    private var livenessTimeoutJob: Job? = null

    // ── Punch-lock to prevent double punches ─────────────────────────────────
    @Volatile private var punchInFlight = false

    // ── Pending match waiting for liveness ───────────────────────────────────
    @Volatile private var pendingMatch: MatchResult? = null
    @Volatile private var pendingProbe: FloatArray? = null
    @Volatile private var pendingPhoto: String? = null

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    // ─────────────────────────────────────────────────────────────────────────
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_camera)

        previewView = findViewById(R.id.previewView)
        previewView.implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        tvHint = findViewById(R.id.statusText)
        tvStatus = findViewById(R.id.statusDetail)
        tvDirectionArrow = findViewById(R.id.tvDirectionArrow)

        initTextToSpeech()

        config = DeviceConfig(this)
        apiClient = ApiClient(config)
        embedder = FaceEmbedder(this)
        faceDetector = FaceDetector()
        matcher = RosterMatcher()
        cameraExecutor = Executors.newSingleThreadExecutor()

        KioskDeviceAdmin.allowlistForLockTask(this)
        try {
            startLockTask()
        } catch (e: Exception) {
            Log.w(TAG, "startLockTask failed (screen-pinning fallback will apply): ${e.message}")
        }
        setupAdminExitGesture()

        loadRoster()
        startPeriodicRosterRefresh()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startCamera()
        } else {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), CAMERA_REQUEST_CODE)
        }
        startEnrollmentPolling()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == CAMERA_REQUEST_CODE) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startCamera()
            } else {
                tvHint.text = getString(R.string.permission_camera_required)
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        tts?.stop()
        tts?.shutdown()
        cameraExecutor.shutdown()
        embedder.close()
        faceDetector.close()
        enrollPollJob?.cancel()
        livenessTimeoutJob?.cancel()
    }

    private fun initTextToSpeech() {
        val preferredEngine = GOOGLE_TTS_PACKAGE.takeIf { isPackageInstalled(it) }
        tts = TextToSpeech(this, { status -> handleTtsInit(status) }, preferredEngine)
    }

    private fun handleTtsInit(status: Int) {
        if (status != TextToSpeech.SUCCESS) {
            ttsReady = false
            Log.w(TAG, "TTS init failed (status=$status) - voice prompts disabled")
            promptInstallTtsData()
            return
        }

        val engine = tts
        if (engine == null) {
            ttsReady = false
            Log.w(TAG, "TTS init callback fired before engine assignment")
            return
        }

        engine.setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build(),
        )
        engine.setSpeechRate(0.92f)
        engine.setPitch(1.0f)
        engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {
                Log.i(TAG, "TTS started: $utteranceId")
            }

            override fun onDone(utteranceId: String?) {
                Log.i(TAG, "TTS done: $utteranceId")
            }

            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) {
                Log.w(TAG, "TTS error: $utteranceId")
            }

            override fun onError(utteranceId: String?, errorCode: Int) {
                Log.w(TAG, "TTS error: $utteranceId code=$errorCode")
            }
        })

        val langResult = setTtsLanguage(ENGLISH_INDIA)
        ttsReady = langResult != TextToSpeech.LANG_MISSING_DATA &&
            langResult != TextToSpeech.LANG_NOT_SUPPORTED &&
            langResult != TextToSpeech.ERROR

        if (!ttsReady) {
            Log.w(TAG, "TTS English voice missing/unsupported (result=$langResult)")
            promptInstallTtsData()
            return
        }

        Log.i(TAG, "TTS ready using engine=${engine.defaultEngine}")
        flushPendingSpeech()
        speakIdlePromptOnce()
    }

    private fun isPackageInstalled(packageName: String): Boolean =
        try {
            packageManager.getPackageInfo(packageName, 0)
            true
        } catch (_: PackageManager.NameNotFoundException) {
            false
        }

    private fun setTtsLanguage(locale: Locale): Int {
        val result = tts?.setLanguage(locale) ?: TextToSpeech.ERROR
        if (
            result == TextToSpeech.LANG_MISSING_DATA ||
            result == TextToSpeech.LANG_NOT_SUPPORTED ||
            result == TextToSpeech.ERROR
        ) {
            return tts?.setLanguage(Locale.US) ?: TextToSpeech.ERROR
        }
        return result
    }

    private fun speak(text: String) {
        speakText(text, TextToSpeech.QUEUE_FLUSH, ENGLISH_INDIA, "prompt", queueIfNotReady = true)
    }

    private fun speakText(
        text: String,
        queueMode: Int,
        locale: Locale,
        tag: String,
        queueIfNotReady: Boolean,
    ) {
        val clean = text.trim()
        if (clean.isBlank()) return

        val engine = tts
        if (!ttsReady || engine == null) {
            if (queueIfNotReady) {
                pendingSpeechText = clean
                pendingSpeechTag = tag
                Log.i(TAG, "TTS not ready; queued speech: $tag")
            }
            return
        }

        val langResult = setTtsLanguage(locale)
        if (
            langResult == TextToSpeech.LANG_MISSING_DATA ||
            langResult == TextToSpeech.LANG_NOT_SUPPORTED ||
            langResult == TextToSpeech.ERROR
        ) {
            Log.w(TAG, "TTS language unavailable for $tag (result=$langResult)")
            return
        }

        val utteranceId = "$tag-${++utteranceSeq}"
        val result = engine.speak(clean, queueMode, null, utteranceId)
        if (result == TextToSpeech.ERROR) {
            Log.w(TAG, "TTS speak failed: $utteranceId")
            if (queueIfNotReady) {
                pendingSpeechText = clean
                pendingSpeechTag = tag
            }
        } else {
            Log.i(TAG, "TTS speak queued: $utteranceId")
        }
    }

    private fun flushPendingSpeech() {
        val text = pendingSpeechText ?: return
        val tag = pendingSpeechTag
        pendingSpeechText = null
        pendingSpeechTag = "prompt"
        speakText(text, TextToSpeech.QUEUE_FLUSH, ENGLISH_INDIA, tag, queueIfNotReady = false)
    }

    private fun speakIdlePromptOnce() {
        if (idlePromptSpoken || state !is KioskState.Idle) return
        idlePromptSpoken = true
        speak(getString(R.string.kiosk_look_at_camera))
    }

    private fun showPrompt(main: String, detail: String? = null) {
        runOnUiThread {
            tvHint.text = main
            tvStatus.text = detail ?: ""
            tvStatus.visibility = if (detail.isNullOrBlank()) View.GONE else View.VISIBLE
        }
    }

    private fun promptInstallTtsData() {
        if (ttsInstallPrompted) return
        ttsInstallPrompted = true
        showPrompt(
            tvHint.text?.toString() ?: getString(R.string.kiosk_look_at_camera),
            getString(R.string.kiosk_tts_install_needed),
        )
        runOnUiThread {
            try {
                startActivity(Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA))
            } catch (e: Exception) {
                Log.w(TAG, "Unable to open TTS install screen: ${e.message}")
            }
        }
    }

    private fun formatApiError(e: Throwable): String {
        val raw = e.message ?: return "unknown error"
        val jsonStart = raw.indexOf('{')
        if (jsonStart >= 0) {
            try {
                val parsed = json.parseToJsonElement(raw.substring(jsonStart)).jsonObject
                val message = parsed["message"]?.jsonPrimitive?.contentOrNull
                if (!message.isNullOrBlank()) return message.take(220)
            } catch (_: Exception) {
                // Fall through to the legacy text cleanup below.
            }
        }
        return raw
            .replace(Regex("\\{\"statusCode\"\\s*:\\s*\\d+,\\s*\"message\"\\s*:\\s*\""), "")
            .replace(Regex("\",\\s*\"error\"\\s*:\\s*\"[^\"]+\"\\}"), "")
            .replace("\\\"", "\"")
            .take(220)
    }

    /** Speak the punch result: English name announcement then Telugu motivational message. */
    private fun speakPunchResult(name: String, direction: String) {
        val isOut = direction == "OUT"
        val announcement = if (isOut)
            getString(R.string.kiosk_voice_logout_recorded, name)
        else
            getString(R.string.kiosk_voice_recorded, name)
        speakText(announcement, TextToSpeech.QUEUE_FLUSH, ENGLISH_INDIA, "punch-name", queueIfNotReady = true)

        val motivation = if (isOut)
            getString(R.string.kiosk_voice_logout_motivation)
        else
            getString(R.string.kiosk_voice_login_motivation)
        val teResult = tts?.setLanguage(TELUGU_INDIA)
        if (
            teResult != TextToSpeech.LANG_NOT_SUPPORTED &&
            teResult != TextToSpeech.LANG_MISSING_DATA &&
            teResult != TextToSpeech.ERROR
        ) {
            speakText(motivation, TextToSpeech.QUEUE_ADD, TELUGU_INDIA, "punch-motivation", queueIfNotReady = false)
        }
        setTtsLanguage(ENGLISH_INDIA)
    }

    private fun showDirectionArrow(challenge: LivenessChallenge) {
        val (arrow, textSizeSp) = when (challenge) {
            LivenessChallenge.HEAD_TURN_LEFT  -> "←" to 96f
            LivenessChallenge.HEAD_TURN_RIGHT -> "→" to 96f
            LivenessChallenge.BLINK           -> "BLINK!" to 64f
            LivenessChallenge.SMILE           -> "SMILE!" to 64f
        }
        runOnUiThread {
            tvDirectionArrow.text = arrow
            tvDirectionArrow.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, textSizeSp)
            tvDirectionArrow.visibility = View.VISIBLE
        }
    }

    private fun hideDirectionArrow() {
        runOnUiThread { tvDirectionArrow.visibility = View.GONE }
    }

    // Long-press the brand label (bottom strip) OR the status text (top) to show admin PIN exit dialog.
    private fun setupAdminExitGesture() {
        val brandLabel = findViewById<TextView?>(R.id.headerBrand)
        brandLabel?.setOnLongClickListener {
            showAdminExitDialog()
            true
        }
        tvStatus.setOnLongClickListener {
            showAdminExitDialog()
            true
        }
    }

    private fun showAdminExitDialog() {
        val pin = BuildConfig.ADMIN_EXIT_PIN
        if (pin.isBlank()) {
            Toast.makeText(this, "Admin exit PIN not configured.", Toast.LENGTH_SHORT).show()
            return
        }
        val input = EditText(this).apply { hint = "Admin PIN"; inputType = android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD }
        AlertDialog.Builder(this)
            .setTitle("Admin Exit")
            .setMessage("Enter admin PIN to exit kiosk mode")
            .setView(input)
            .setPositiveButton("Unlock") { _, _ ->
                if (input.text.toString() == pin) {
                    stopLockTask()
                    finish()
                } else {
                    Toast.makeText(this, "Incorrect PIN", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    // ── Roster ───────────────────────────────────────────────────────────────

    /** Handle a 401/403 from any authenticated API call: clear config and return to SetupActivity. */
    private fun handleUnauthorized() {
        Log.w(TAG, "Received 401/403 — device token revoked, clearing config and returning to SetupActivity")
        config.clear()
        val intent = Intent(this, SetupActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }

    private fun startPeriodicRosterRefresh() {
        lifecycleScope.launch {
            while (isActive) {
                delay(ROSTER_REFRESH_INTERVAL_MS)
                loadRoster()
            }
        }
    }

    private fun loadRoster() {
        lifecycleScope.launch {
            try {
                val roster = apiClient.getRoster()
                matcher.load(roster.enrollments)
                Log.i(TAG, "Roster loaded: ${roster.enrollments.size} entries")
            } catch (e: ApiException) {
                if (e.code == 401 || e.code == 403) {
                    handleUnauthorized()
                } else {
                    Log.w(TAG, "Roster load failed: ${e.message}")
                }
            } catch (e: Exception) {
                Log.w(TAG, "Roster load failed: ${e.message}")
            }
        }
    }

    // ── Camera ───────────────────────────────────────────────────────────────

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener({
            try {
                val cameraProvider = cameraProviderFuture.get()

                val preview = Preview.Builder().build().apply {
                    setSurfaceProvider(previewView.surfaceProvider)
                }

                val imageAnalysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()

                val captureSession = FaceCaptureSession(
                    embedder = embedder,
                    detector = faceDetector,
                    onFace = { probe, metrics, photo -> handleFaceFrame(probe, metrics, photo) },
                    // Suppress quality hints while a liveness challenge is active so the
                    // challenge prompt is not overwritten by e.g. "No face detected"
                    onHint = { hint ->
                        if (pendingChallenge == null && state !is KioskState.Result) {
                            runOnUiThread { tvHint.text = hint }
                        }
                    },
                )

                imageAnalysis.setAnalyzer(cameraExecutor, captureSession)

                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(
                    this,
                    CameraSelector.DEFAULT_FRONT_CAMERA,
                    preview,
                    imageAnalysis,
                )
            } catch (e: Exception) {
                Log.e(TAG, "Camera start failed", e)
                tvHint.text = getString(R.string.camera_start_failed)
            }
        }, ContextCompat.getMainExecutor(this))
    }

    // ── Enrollment polling ───────────────────────────────────────────────────

    private fun startEnrollmentPolling() {
        enrollPollJob?.cancel()
        enrollPollJob = lifecycleScope.launch {
            while (isActive) {
                delay(ENROLLMENT_POLL_INTERVAL_MS)
                if (state !is KioskState.Idle) continue
                try {
                    val ticket = apiClient.getPendingEnrollTicket()
                    if (ticket != null) {
                        enterEnrollingState(ticket)
                    }
                } catch (e: ApiException) {
                    if (e.code == 401 || e.code == 403) {
                        handleUnauthorized()
                        break
                    }
                    Log.w(TAG, "Enrollment poll failed: ${e.message}")
                } catch (e: Exception) {
                    Log.w(TAG, "Enrollment poll failed: ${e.message}")
                }
            }
        }
    }

    private fun enterEnrollingState(ticket: KioskEnrollTicketResponse) {
        // Don't restart if already capturing frames for this ticket to avoid clearing mid-capture
        val current = state
        if (current is KioskState.Enrolling && current.ticket.id == ticket.id) return
        state = KioskState.Enrolling(ticket)
        enrollFrames.clear()
        enrollAvgEmbedding = null
        lastEnrollFrameMs = 0L
        enrollLivenessInFlight = false
        pendingChallenge = null
        pendingNonce = null
        challengePassedAt = null

        runOnUiThread {
            val prompt = getString(R.string.kiosk_enroll_prompt, ticket.subjectName)
            tvHint.text = prompt
            tvStatus.text = getString(R.string.kiosk_enroll_ticket_received, ticket.subjectName)
            tvStatus.visibility = View.VISIBLE
        }
        speak(getString(R.string.kiosk_enroll_prompt, ticket.subjectName))
    }

    // ── Frame handling ───────────────────────────────────────────────────────

    private fun handleFaceFrame(probe: FloatArray, metrics: FaceMetrics, photo: String?) {
        when (val s = state) {
            is KioskState.Idle -> handleIdleFrame(probe, metrics, photo)
            is KioskState.Enrolling -> handleEnrollFrame(s, probe, metrics, photo)
            is KioskState.Punching -> handleLivenessFrame(probe, metrics)
            else -> Unit
        }
    }

    // ── Idle: match → liveness → punch ───────────────────────────────────────

    private fun handleIdleFrame(probe: FloatArray, metrics: FaceMetrics, photo: String?) {
        if (punchInFlight) return
        val challenge = pendingChallenge
        if (challenge != null) {
            handleLivenessFrame(probe, metrics)
            return
        }

        val match = matcher.match(probe) ?: run {
            runOnUiThread { tvHint.text = getString(R.string.kiosk_look_at_camera) }
            return
        }

        punchInFlight = true
        pendingMatch = match
        pendingProbe = probe
        pendingPhoto = photo

        lifecycleScope.launch {
            try {
                val challengeResp = apiClient.issueLivenessChallenge(match.employeeId)
                val lvChallenge = LivenessChallenge.fromWire(challengeResp.challengeType)
                    ?: LivenessChallenge.BLINK

                pendingChallenge = lvChallenge
                pendingNonce = challengeResp.nonce

                val promptRes = when (lvChallenge) {
                    LivenessChallenge.BLINK -> R.string.liveness_prompt_blink
                    LivenessChallenge.SMILE -> R.string.liveness_prompt_smile
                    LivenessChallenge.HEAD_TURN_LEFT -> R.string.liveness_prompt_head_left
                    LivenessChallenge.HEAD_TURN_RIGHT -> R.string.liveness_prompt_head_right
                }
                val prompt = getString(R.string.kiosk_liveness_prompt_with_name, match.displayName, getString(promptRes))

                state = KioskState.Punching
                runOnUiThread { tvHint.text = prompt }
                speak(prompt)
                showDirectionArrow(lvChallenge)

                // Safety timeout: if user doesn't complete liveness in time, reset to idle
                livenessTimeoutJob?.cancel()
                livenessTimeoutJob = lifecycleScope.launch {
                    delay(LIVENESS_TIMEOUT_MS)
                    if (pendingChallenge != null) {
                        Log.w(TAG, "Liveness challenge timed out — resetting to idle")
                        resetToIdle()
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Liveness challenge failed: ${e.message}")
                punchInFlight = false
                pendingMatch = null
                pendingChallenge = null
            }
        }
    }

    private fun handleLivenessFrame(probe: FloatArray, metrics: FaceMetrics) {
        val challenge = pendingChallenge ?: return
        val passed = when (challenge) {
            LivenessChallenge.BLINK          -> metrics.eyeOpenness < 0.3
            LivenessChallenge.SMILE          -> metrics.smilingProbability > 0.7
            LivenessChallenge.HEAD_TURN_LEFT -> metrics.headYaw < -20f
            LivenessChallenge.HEAD_TURN_RIGHT -> metrics.headYaw > 20f
        }
        if (!passed) return

        livenessTimeoutJob?.cancel()
        livenessTimeoutJob = null
        livenessScore = metrics.eyeOpenness
        val passedAt = isoNow()
        challengePassedAt = passedAt
        pendingChallenge = null

        val match = pendingMatch ?: return
        val probeArr = pendingProbe ?: return
        val photo = pendingPhoto
        val nonce = pendingNonce ?: return

        lifecycleScope.launch {
            submitPunch(match, probeArr, livenessScore, challenge, passedAt, nonce, photo)
        }
    }

    private suspend fun submitPunch(
        match: MatchResult,
        probe: FloatArray,
        liveness: Double,
        challenge: LivenessChallenge,
        passedAt: String,
        nonce: String,
        photo: String?,
    ) {
        var resultDisplayMs = PUNCH_RETRY_DISPLAY_MS
        try {
            val req = MobilePunchRequest(
                embeddingB64 = embedder.toBase64(probe),
                embeddingModel = "mobilefacenet",
                livenessScore = liveness,
                livenessChallengeType = challenge.name,
                livenessNonce = nonce,
                direction = "AUTO",
                punchTime = isoNow(),
                photoB64 = photo,
                isMockLocation = false,
                isRooted = IntegrityCheck.isDeviceRooted(),
                offlineSync = false,
            )

            try {
                val resp = apiClient.recordPunch(req)
                resultDisplayMs = SUCCESS_HOLD_MS
                state = KioskState.Result(ok = true, name = resp.employeeName, direction = resp.direction)
                val msg = if (resp.direction == "OUT")
                    getString(R.string.kiosk_punch_out_title)
                else
                    getString(R.string.kiosk_punch_in_title)
                runOnUiThread {
                    tvHint.text = msg
                    tvStatus.text = getString(R.string.kiosk_next_scan_wait, SUCCESS_HOLD_SECONDS)
                    tvStatus.visibility = View.VISIBLE
                }
                speakPunchResult(resp.employeeName, resp.direction)
            } catch (e: ApiException) {
                if (e.code == 401 || e.code == 403) {
                    handleUnauthorized()
                } else if (e.code in 500..599) {
                    // Server error — transient, safe to retry offline
                    queuePunch(req.copy(offlineSync = true))
                    resultDisplayMs = SUCCESS_HOLD_MS
                    state = KioskState.Result(ok = true, name = match.displayName, direction = "IN")
                    runOnUiThread {
                        tvHint.text = getString(R.string.kiosk_punch_queued)
                        tvStatus.text = getString(R.string.kiosk_next_scan_wait, SUCCESS_HOLD_SECONDS)
                        tvStatus.visibility = View.VISIBLE
                    }
                } else {
                    // Permanent rejection (e.g. cooldown, no match) — do not queue for retry
                    state = KioskState.Result(ok = false, name = match.displayName, direction = "IN")
                    val errorMessage = formatApiError(e)
                    val rejectedText = if (errorMessage.contains("already completed", ignoreCase = true)) {
                        getString(R.string.kiosk_already_done_title)
                    } else {
                        getString(R.string.kiosk_punch_rejected)
                    }
                    runOnUiThread {
                        tvHint.text = rejectedText
                    }
                }
            } catch (e: Exception) {
                // Network/unknown failure — transient, safe to retry offline
                queuePunch(req.copy(offlineSync = true))
                resultDisplayMs = SUCCESS_HOLD_MS
                state = KioskState.Result(ok = true, name = match.displayName, direction = "IN")
                runOnUiThread {
                    tvHint.text = getString(R.string.kiosk_punch_queued)
                    tvStatus.text = getString(R.string.kiosk_next_scan_wait, SUCCESS_HOLD_SECONDS)
                    tvStatus.visibility = View.VISIBLE
                }
            }
        } finally {
            delay(resultDisplayMs)
            resetToIdle()
        }
    }

    private suspend fun queuePunch(req: MobilePunchRequest) {
        try {
            val db = AppDatabase.getInstance(this)
            val payload = json.encodeToString(req)
            db.queuedPunchDao().insert(QueuedPunch(payloadJson = payload))
        } catch (e: Exception) {
            Log.e(TAG, "Failed to queue punch: ${e.message}")
        }
    }

    private fun resetToIdle() {
        livenessTimeoutJob?.cancel()
        livenessTimeoutJob = null
        state = KioskState.Idle
        pendingMatch = null
        pendingProbe = null
        pendingPhoto = null
        pendingChallenge = null
        pendingNonce = null
        challengePassedAt = null
        punchInFlight = false
        enrollLivenessInFlight = false
        enrollFrames.clear()
        enrollAvgEmbedding = null
        hideDirectionArrow()
        runOnUiThread {
            tvHint.text = getString(R.string.kiosk_look_at_camera)
            tvStatus.text = getString(R.string.kiosk_ready_detail)
            tvStatus.visibility = View.VISIBLE
        }
    }

    // ── Enrollment frame handling ─────────────────────────────────────────────

    private fun handleEnrollFrame(
        enrollState: KioskState.Enrolling,
        probe: FloatArray,
        metrics: FaceMetrics,
        photo: String?,
    ) {
        val challenge = pendingChallenge
        if (challenge != null) {
            handleEnrollLivenessFrame(enrollState, probe, metrics, challenge)
            return
        }

        if (enrollFrames.size >= ENROLL_REQUIRED_FRAMES) {
            if (!enrollLivenessInFlight) startEnrollLivenessChallenge(enrollState)
            return
        }

        // Only accept frontal frames for enrollment embedding (yaw gate).
        // Show a directional arrow so the employee knows which way to turn their head.
        if (metrics.headYaw > ENROLL_MAX_YAW) {
            runOnUiThread {
                tvHint.text = getString(R.string.enroll_guide_turn_left)
                tvDirectionArrow.text = "←"
                tvDirectionArrow.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 96f)
                tvDirectionArrow.visibility = View.VISIBLE
            }
            return
        }
        if (metrics.headYaw < -ENROLL_MAX_YAW) {
            runOnUiThread {
                tvHint.text = getString(R.string.enroll_guide_turn_right)
                tvDirectionArrow.text = "→"
                tvDirectionArrow.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 96f)
                tvDirectionArrow.visibility = View.VISIBLE
            }
            return
        }
        if (metrics.eyeOpenness < ENROLL_MIN_LIVENESS) return

        val now = System.currentTimeMillis()
        if (now - lastEnrollFrameMs < ENROLL_MIN_FRAME_INTERVAL_MS) return

        val avg = enrollAvgEmbedding
        if (avg != null) {
            val sim = cosineSim(probe, avg)
            if (sim < ENROLL_MIN_PROBE_TO_AVG_COS) {
                runOnUiThread { tvHint.text = getString(R.string.kiosk_enroll_inconsistent) }
                return
            }
        }

        enrollFrames.add(probe)
        lastEnrollFrameMs = now
        enrollAvgEmbedding = averageAndNormalize(enrollFrames)

        val captured = enrollFrames.size
        runOnUiThread {
            // Good frame accepted — hide any positioning arrow and show progress
            tvDirectionArrow.visibility = View.GONE
            tvHint.text = getString(
                R.string.kiosk_enroll_capturing_frames,
                captured,
                ENROLL_REQUIRED_FRAMES,
                enrollState.ticket.subjectName,
            )
        }

        if (enrollFrames.size >= ENROLL_REQUIRED_FRAMES) {
            startEnrollLivenessChallenge(enrollState)
        }
    }

    private fun startEnrollLivenessChallenge(enrollState: KioskState.Enrolling) {
        if (enrollLivenessInFlight) return
        enrollLivenessInFlight = true
        livenessTimeoutJob?.cancel()
        livenessTimeoutJob = null
        lifecycleScope.launch {
            try {
                val challengeSubjectId =
                    enrollState.ticket.employeeId ?: enrollState.ticket.contractorEmployeeId
                val challengeResp = apiClient.issueLivenessChallenge(challengeSubjectId)
                val challenge = LivenessChallenge.fromWire(challengeResp.challengeType) ?: LivenessChallenge.BLINK
                pendingChallenge = challenge
                pendingNonce = challengeResp.nonce

                val promptRes = when (challenge) {
                    LivenessChallenge.BLINK -> R.string.liveness_prompt_blink
                    LivenessChallenge.SMILE -> R.string.liveness_prompt_smile
                    LivenessChallenge.HEAD_TURN_LEFT -> R.string.liveness_prompt_head_left
                    LivenessChallenge.HEAD_TURN_RIGHT -> R.string.liveness_prompt_head_right
                }
                val promptText = getString(promptRes)
                showPrompt(promptText, getString(R.string.kiosk_enroll_liveness_detail))
                speak(promptText)
                showDirectionArrow(challenge)

                // Enrollment liveness timeout: force a fresh frame set for the retry so
                // embeddings cannot be reused with a different person's liveness.
                livenessTimeoutJob = lifecycleScope.launch {
                    delay(45_000)
                    if (pendingChallenge != null) {
                        Log.w(TAG, "Enroll liveness timed out — resetting frame capture")
                        pendingChallenge = null
                        pendingNonce = null
                        enrollLivenessInFlight = false
                        enrollFrames.clear()
                        enrollAvgEmbedding = null
                        lastEnrollFrameMs = 0L
                        hideDirectionArrow()
                        showPrompt(
                            getString(R.string.kiosk_enroll_prompt, enrollState.ticket.subjectName),
                            getString(R.string.kiosk_enroll_retry_detail),
                        )
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Enroll liveness challenge failed (${e.javaClass.simpleName}): ${e.message}")
                enrollFrames.clear()
                enrollAvgEmbedding = null
                val errMsg = formatApiError(e)
                // Show error prominently in center overlay so operator can read it clearly
                runOnUiThread {
                    tvDirectionArrow.text = "!"
                    tvDirectionArrow.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 96f)
                    tvDirectionArrow.visibility = View.VISIBLE
                }
                showPrompt(getString(R.string.liveness_request_failed), errMsg)
                delay(5_000)
                runOnUiThread { tvDirectionArrow.visibility = View.GONE }
                enrollLivenessInFlight = false
                showPrompt(
                    getString(R.string.kiosk_enroll_prompt, enrollState.ticket.subjectName),
                    getString(R.string.kiosk_enroll_retry_detail),
                )
            }
        }
    }

    private fun handleEnrollLivenessFrame(
        enrollState: KioskState.Enrolling,
        probe: FloatArray,
        metrics: FaceMetrics,
        challenge: LivenessChallenge,
    ) {
        val passed = when (challenge) {
            LivenessChallenge.BLINK          -> metrics.eyeOpenness < 0.3
            LivenessChallenge.SMILE          -> metrics.smilingProbability > 0.7
            LivenessChallenge.HEAD_TURN_LEFT -> metrics.headYaw < -20f
            LivenessChallenge.HEAD_TURN_RIGHT -> metrics.headYaw > 20f
        }
        if (!passed) return

        val passedAt = isoNow()
        val nonce = pendingNonce ?: return
        pendingChallenge = null
        livenessTimeoutJob?.cancel()
        livenessTimeoutJob = null

        lifecycleScope.launch {
            submitEnrollment(enrollState, nonce, challenge, passedAt, probe)
        }
    }

    private suspend fun submitEnrollment(
        enrollState: KioskState.Enrolling,
        nonce: String,
        challenge: LivenessChallenge,
        passedAt: String,
        lastProbe: FloatArray,
    ) {
        try {
            showPrompt(getString(R.string.kiosk_enroll_uploading), getString(R.string.kiosk_enroll_upload_detail))

            val avgEmbedding = averageAndNormalize(enrollFrames)
            val selfSim = cosineSim(lastProbe, avgEmbedding)
            if (selfSim < ENROLL_MIN_PROBE_TO_AVG_COS) {
                throw IllegalStateException(getString(R.string.kiosk_enroll_inconsistent))
            }

            val req = SubmitKioskEnrollRequest(
                ticketId = enrollState.ticket.id,
                embeddingFrames = enrollFrames.map { embedder.toBase64(it) },
                embeddingModel = "mobilefacenet",
                livenessNonce = nonce,
                livenessChallengeType = challenge.name,
                consentGiven = true,
            )

            val result = apiClient.submitEnrollTicket(req)
            result.fold(
                onSuccess = {
                    state = KioskState.Result(ok = true, name = enrollState.ticket.subjectName, direction = "ENROLL")
                    val successMsg = getString(R.string.kiosk_enroll_success, enrollState.ticket.subjectName)
                    withContext(Dispatchers.Main) {
                        tvHint.text = successMsg
                        tvStatus.text = getString(R.string.kiosk_next_scan_wait, SUCCESS_HOLD_SECONDS)
                        tvStatus.visibility = View.VISIBLE
                        tvDirectionArrow.text = "✓"
                        tvDirectionArrow.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 96f)
                        tvDirectionArrow.visibility = View.VISIBLE
                    }
                    loadRoster()
                    delay(SUCCESS_HOLD_MS)
                    withContext(Dispatchers.Main) { tvDirectionArrow.visibility = View.GONE }
                },
                onFailure = { e ->
                    state = KioskState.Result(ok = false, name = enrollState.ticket.subjectName, direction = "ENROLL")
                    val failMsg = formatApiError(e)
                    Log.e(TAG, failMsg)
                    withContext(Dispatchers.Main) {
                        tvDirectionArrow.text = "!"
                        tvDirectionArrow.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 96f)
                        tvDirectionArrow.visibility = View.VISIBLE
                    }
                    showPrompt(getString(R.string.kiosk_enroll_failed, failMsg), getString(R.string.kiosk_enroll_retry_detail))
                    delay(ENROLL_RETRY_DISPLAY_MS)
                    withContext(Dispatchers.Main) { tvDirectionArrow.visibility = View.GONE }
                }
            )
        } catch (e: Exception) {
            state = KioskState.Result(ok = false, name = enrollState.ticket.subjectName, direction = "ENROLL")
            val failMsg = formatApiError(e)
            Log.e(TAG, "Enrollment failed before submit completed: $failMsg")
            withContext(Dispatchers.Main) {
                tvDirectionArrow.text = "!"
                tvDirectionArrow.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 96f)
                tvDirectionArrow.visibility = View.VISIBLE
            }
            showPrompt(getString(R.string.kiosk_enroll_failed, failMsg), getString(R.string.kiosk_enroll_retry_detail))
            delay(ENROLL_RETRY_DISPLAY_MS)
            withContext(Dispatchers.Main) { tvDirectionArrow.visibility = View.GONE }
        } finally {
            resetToIdle()
        }
    }

    companion object {
        private const val TAG = "KioskActivity"

        private const val ENROLL_REQUIRED_FRAMES = 3
        private const val ENROLL_MIN_LIVENESS = 0.25
        private const val ENROLL_MAX_YAW = 25f               // frontal gate for enrollment frames
        private const val ENROLL_MIN_FRAME_INTERVAL_MS = 400L
        private const val ENROLL_MIN_PROBE_TO_AVG_COS = 0.55
        private const val ENROLLMENT_POLL_INTERVAL_MS = 5_000L
        private const val ROSTER_REFRESH_INTERVAL_MS = 15 * 60 * 1000L  // refresh every 15 min
        private const val SUCCESS_HOLD_SECONDS = 10
        private const val SUCCESS_HOLD_MS = SUCCESS_HOLD_SECONDS * 1_000L
        private const val PUNCH_RETRY_DISPLAY_MS = 3_000L
        private const val ENROLL_RETRY_DISPLAY_MS = 6_000L
        private const val LIVENESS_TIMEOUT_MS = 15_000L      // 15 s — head turns need more time
        private const val CAMERA_REQUEST_CODE = 1001
        private const val GOOGLE_TTS_PACKAGE = "com.google.android.tts"
        private val ENGLISH_INDIA = Locale("en", "IN")
        private val TELUGU_INDIA = Locale("te", "IN")

        fun cosineSim(a: FloatArray, b: FloatArray): Double {
            var dot = 0.0
            var normA = 0.0
            var normB = 0.0
            val len = minOf(a.size, b.size)
            for (i in 0 until len) {
                dot += a[i] * b[i]
                normA += a[i] * a[i]
                normB += b[i] * b[i]
            }
            val denom = sqrt(normA) * sqrt(normB)
            return if (denom == 0.0) 0.0 else dot / denom
        }

        fun averageAndNormalize(frames: List<FloatArray>): FloatArray {
            if (frames.isEmpty()) return FloatArray(0)
            val size = frames[0].size
            val avg = FloatArray(size)
            for (frame in frames) {
                for (i in 0 until size) {
                    avg[i] += frame[i]
                }
            }
            for (i in avg.indices) avg[i] = avg[i] / frames.size

            val norm = sqrt(avg.fold(0f) { acc, v -> acc + v * v })
            return if (norm > 0f) avg.map { it / norm }.toFloatArray() else avg
        }

        fun isoNow(): String {
            val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
            sdf.timeZone = TimeZone.getTimeZone("UTC")
            return sdf.format(Date())
        }
    }
}
