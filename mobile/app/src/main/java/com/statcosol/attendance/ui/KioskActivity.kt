package com.statcosol.attendance.ui

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.mlkit.vision.face.Face
import com.statcosol.attendance.R
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
import com.statcosol.attendance.face.LivenessChallenge
import com.statcosol.attendance.face.RosterMatcher
import com.statcosol.attendance.face.MatchResult
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
    private val enrollFrames = mutableListOf<FloatArray>()
    private var lastEnrollFrameMs = 0L
    private var enrollAvgEmbedding: FloatArray? = null

    // ── Liveness tracking ────────────────────────────────────────────────────
    @Volatile private var pendingChallenge: LivenessChallenge? = null
    @Volatile private var pendingNonce: String? = null
    @Volatile private var challengePassedAt: String? = null
    @Volatile private var livenessScore: Double = 0.0

    // ── Poll job ─────────────────────────────────────────────────────────────
    private var enrollPollJob: Job? = null

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
        tvHint = findViewById(R.id.statusText)
        tvStatus = findViewById(R.id.statusText)

        config = DeviceConfig(this)
        apiClient = ApiClient(config)
        embedder = FaceEmbedder(this)
        faceDetector = FaceDetector()
        matcher = RosterMatcher()
        cameraExecutor = Executors.newSingleThreadExecutor()

        loadRoster()
        startCamera()
        startEnrollmentPolling()
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
        embedder.close()
        faceDetector.close()
        enrollPollJob?.cancel()
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
                onFace = { probe, liveness, photo -> handleFaceFrame(probe, liveness, photo) },
                onHint = { hint -> runOnUiThread { tvHint.text = hint } },
            )

            imageAnalysis.setAnalyzer(cameraExecutor, captureSession)

            cameraProvider.unbindAll()
            cameraProvider.bindToLifecycle(
                this,
                CameraSelector.DEFAULT_FRONT_CAMERA,
                preview,
                imageAnalysis,
            )
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
        state = KioskState.Enrolling(ticket)
        enrollFrames.clear()
        enrollAvgEmbedding = null
        lastEnrollFrameMs = 0L
        pendingChallenge = null
        pendingNonce = null
        challengePassedAt = null

        runOnUiThread {
            val prompt = getString(R.string.kiosk_enroll_prompt, ticket.subjectName)
            tvStatus.text = prompt
            tvHint.text = prompt
        }
    }

    // ── Frame handling ───────────────────────────────────────────────────────

    private fun handleFaceFrame(probe: FloatArray, liveness: Double, photo: String?) {
        when (val s = state) {
            is KioskState.Idle -> handleIdleFrame(probe, liveness, photo)
            is KioskState.Enrolling -> handleEnrollFrame(s, probe, liveness, photo)
            is KioskState.Punching -> handleLivenessFrame(probe, liveness)
            else -> Unit
        }
    }

    // ── Idle: match → liveness → punch ───────────────────────────────────────

    private fun handleIdleFrame(probe: FloatArray, liveness: Double, photo: String?) {
        if (punchInFlight) return
        val challenge = pendingChallenge
        if (challenge != null) {
            handleLivenessFrame(probe, liveness)
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
            } catch (e: Exception) {
                Log.w(TAG, "Liveness challenge failed: ${e.message}")
                punchInFlight = false
                pendingMatch = null
                pendingChallenge = null
            }
        }
    }

    private fun handleLivenessFrame(probe: FloatArray, liveness: Double) {
        val challenge = pendingChallenge ?: return
        val passed = when (challenge) {
            LivenessChallenge.BLINK -> liveness < 0.3
            LivenessChallenge.SMILE -> liveness > 0.8
            LivenessChallenge.HEAD_TURN_LEFT -> liveness > 0.5 // simplified: head yaw checked elsewhere
            LivenessChallenge.HEAD_TURN_RIGHT -> liveness > 0.5
        }
        if (!passed) return

        livenessScore = liveness
        val passedAt = isoNow()
        challengePassedAt = passedAt
        pendingChallenge = null

        val match = pendingMatch ?: return
        val probeArr = pendingProbe ?: return
        val photo = pendingPhoto
        val nonce = pendingNonce ?: return

        lifecycleScope.launch {
            submitPunch(match, probeArr, liveness, challenge, passedAt, nonce, photo)
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
        try {
            val req = MobilePunchRequest(
                embeddingB64 = embedder.toBase64(probe),
                embeddingModel = "mobilefacenet",
                livenessScore = liveness,
                livenessChallengeType = challenge.name,
                livenessNonce = nonce,
                direction = "IN",
                punchTime = isoNow(),
                photoB64 = photo,
                isMockLocation = false,
                isRooted = IntegrityCheck.isDeviceRooted(),
                offlineSync = false,
            )

            try {
                val resp = apiClient.recordPunch(req)
                state = KioskState.Result(ok = true, name = resp.employeeName, direction = resp.direction)
                runOnUiThread {
                    val msg = getString(R.string.kiosk_punch_recorded, resp.employeeName)
                    tvStatus.text = msg
                    tvHint.text = msg
                }
            } catch (e: ApiException) {
                if (e.code == 401 || e.code == 403) {
                    handleUnauthorized()
                } else {
                    // Queue for offline sync on other errors
                    queuePunch(req)
                    state = KioskState.Result(ok = true, name = match.displayName, direction = "IN")
                    runOnUiThread {
                        tvHint.text = getString(R.string.kiosk_punch_queued)
                    }
                }
            } catch (e: Exception) {
                // Queue for offline sync
                queuePunch(req)
                state = KioskState.Result(ok = true, name = match.displayName, direction = "IN")
                runOnUiThread {
                    tvHint.text = getString(R.string.kiosk_punch_queued)
                }
            }
        } finally {
            delay(RESULT_DISPLAY_MS)
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
        state = KioskState.Idle
        pendingMatch = null
        pendingProbe = null
        pendingPhoto = null
        pendingChallenge = null
        pendingNonce = null
        challengePassedAt = null
        punchInFlight = false
        runOnUiThread {
            tvHint.text = getString(R.string.kiosk_look_at_camera)
            if (tvStatus !== tvHint) {
                tvStatus.text = ""
            }
        }
    }

    // ── Enrollment frame handling ─────────────────────────────────────────────

    private fun handleEnrollFrame(
        enrollState: KioskState.Enrolling,
        probe: FloatArray,
        liveness: Double,
        photo: String?,
    ) {
        val challenge = pendingChallenge
        if (challenge != null) {
            handleEnrollLivenessFrame(enrollState, probe, liveness, challenge)
            return
        }

        if (enrollFrames.size >= ENROLL_REQUIRED_FRAMES) return

        if (liveness < ENROLL_MIN_LIVENESS) return

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
        lifecycleScope.launch {
            try {
                val challengeResp = apiClient.issueLivenessChallenge(enrollState.ticket.employeeId)
                val challenge = LivenessChallenge.fromWire(challengeResp.challengeType) ?: LivenessChallenge.BLINK
                pendingChallenge = challenge
                pendingNonce = challengeResp.nonce

                val promptRes = when (challenge) {
                    LivenessChallenge.BLINK -> R.string.liveness_prompt_blink
                    LivenessChallenge.SMILE -> R.string.liveness_prompt_smile
                    LivenessChallenge.HEAD_TURN_LEFT -> R.string.liveness_prompt_head_left
                    LivenessChallenge.HEAD_TURN_RIGHT -> R.string.liveness_prompt_head_right
                }
                runOnUiThread { tvHint.text = getString(promptRes) }
            } catch (e: Exception) {
                Log.w(TAG, "Enroll liveness challenge failed: ${e.message}")
                // Reset enrollment to try again
                enrollFrames.clear()
                enrollAvgEmbedding = null
            }
        }
    }

    private fun handleEnrollLivenessFrame(
        enrollState: KioskState.Enrolling,
        probe: FloatArray,
        liveness: Double,
        challenge: LivenessChallenge,
    ) {
        val passed = when (challenge) {
            LivenessChallenge.BLINK -> liveness < 0.3
            LivenessChallenge.SMILE -> liveness > 0.8
            LivenessChallenge.HEAD_TURN_LEFT -> liveness > 0.5
            LivenessChallenge.HEAD_TURN_RIGHT -> liveness > 0.5
        }
        if (!passed) return

        val passedAt = isoNow()
        val nonce = pendingNonce ?: return
        pendingChallenge = null

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
            runOnUiThread { tvHint.text = getString(R.string.kiosk_enroll_uploading) }

            val avgEmbedding = averageAndNormalize(enrollFrames)
            val selfSim = cosineSim(lastProbe, avgEmbedding).toFloat()

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
                    val successMsg = getString(R.string.kiosk_enroll_success, enrollState.ticket.subjectName)
                    withContext(Dispatchers.Main) {
                        tvHint.text = successMsg
                        tvStatus.text = successMsg
                    }
                    loadRoster()
                    delay(RESULT_DISPLAY_MS)
                },
                onFailure = { e ->
                    val failMsg = getString(R.string.kiosk_enroll_failed, e.message ?: "unknown")
                    withContext(Dispatchers.Main) {
                        tvHint.text = failMsg
                        tvStatus.text = failMsg
                    }
                    delay(RESULT_DISPLAY_MS)
                }
            )
        } finally {
            resetToIdle()
        }
    }

    companion object {
        private const val TAG = "KioskActivity"

        private const val ENROLL_REQUIRED_FRAMES = 3
        private const val ENROLL_MIN_LIVENESS = 0.35
        private const val ENROLL_MIN_FRAME_INTERVAL_MS = 300L
        private const val ENROLL_MIN_PROBE_TO_AVG_COS = 0.60
        private const val ENROLLMENT_POLL_INTERVAL_MS = 5_000L
        private const val RESULT_DISPLAY_MS = 5_000L

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
