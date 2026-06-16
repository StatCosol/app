package com.statcosol.attendance.ui

import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Button
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
import com.statcosol.attendance.R
import com.statcosol.attendance.api.ApiClient
import com.statcosol.attendance.api.MobilePunchRequest
import com.statcosol.attendance.db.AppDatabase
import com.statcosol.attendance.db.QueuedPunch
import com.statcosol.attendance.face.FaceCaptureSession
import com.statcosol.attendance.face.FaceDetector
import com.statcosol.attendance.face.FaceEmbedder
import com.statcosol.attendance.face.LivenessChallenge
import com.statcosol.attendance.face.MatchResult
import com.statcosol.attendance.face.RosterMatcher
import com.statcosol.attendance.prefs.DeviceConfig
import com.statcosol.attendance.security.IntegrityCheck
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

@ExperimentalGetImage
class EssActivity : AppCompatActivity() {

    private lateinit var previewView: PreviewView
    private lateinit var tvHint: TextView
    private lateinit var tvStatus: TextView
    private lateinit var btnPunchIn: Button
    private lateinit var btnPunchOut: Button

    private lateinit var config: DeviceConfig
    private lateinit var apiClient: ApiClient
    private lateinit var embedder: FaceEmbedder
    private lateinit var faceDetector: FaceDetector
    private lateinit var matcher: RosterMatcher
    private lateinit var cameraExecutor: ExecutorService

    @Volatile private var lastProbe: FloatArray? = null
    @Volatile private var lastLiveness: Double = 0.0
    @Volatile private var lastPhoto: String? = null
    @Volatile private var pendingDirection: String? = null
    @Volatile private var pendingChallenge: LivenessChallenge? = null
    @Volatile private var pendingNonce: String? = null
    @Volatile private var pendingMatch: MatchResult? = null
    @Volatile private var punchInFlight = false

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_ess)

        previewView = findViewById(R.id.preview_view)
        tvHint = findViewById(R.id.tv_hint)
        tvStatus = findViewById(R.id.tv_status)
        btnPunchIn = findViewById(R.id.btn_punch_in)
        btnPunchOut = findViewById(R.id.btn_punch_out)

        config = DeviceConfig(this)
        apiClient = ApiClient(config)
        embedder = FaceEmbedder(this)
        faceDetector = FaceDetector()
        matcher = RosterMatcher()
        cameraExecutor = Executors.newSingleThreadExecutor()

        loadRoster()
        startCamera()

        btnPunchIn.setOnClickListener { initiatePunch("IN") }
        btnPunchOut.setOnClickListener { initiatePunch("OUT") }
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
        embedder.close()
        faceDetector.close()
    }

    private fun loadRoster() {
        lifecycleScope.launch {
            try {
                val roster = apiClient.getRoster()
                matcher.load(roster.enrollments)
            } catch (e: Exception) {
                Log.w(TAG, "Roster load failed: ${e.message}")
                tvStatus.text = getString(R.string.ess_no_enrollment)
            }
        }
    }

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
                onFace = { probe, liveness, photo ->
                    lastProbe = probe
                    lastLiveness = liveness
                    lastPhoto = photo

                    val challenge = pendingChallenge
                    if (challenge != null) {
                        handleLivenessFrame(probe, liveness, challenge)
                    }
                },
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

    private fun initiatePunch(direction: String) {
        if (punchInFlight) return
        val probe = lastProbe ?: run {
            tvHint.text = getString(R.string.hint_no_face)
            return
        }
        val match = matcher.match(probe) ?: run {
            tvStatus.text = getString(R.string.kiosk_match_low)
            return
        }

        punchInFlight = true
        pendingDirection = direction
        pendingMatch = match

        lifecycleScope.launch {
            try {
                val challengeResp = apiClient.issueLivenessChallenge(match.employeeId)
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
                Log.w(TAG, "Liveness challenge failed: ${e.message}")
                punchInFlight = false
            }
        }
    }

    private fun handleLivenessFrame(probe: FloatArray, liveness: Double, challenge: LivenessChallenge) {
        val passed = when (challenge) {
            LivenessChallenge.BLINK -> liveness < 0.3
            LivenessChallenge.SMILE -> liveness > 0.8
            LivenessChallenge.HEAD_TURN_LEFT -> liveness > 0.5
            LivenessChallenge.HEAD_TURN_RIGHT -> liveness > 0.5
        }
        if (!passed) return

        val passedAt = KioskActivity.isoNow()
        val nonce = pendingNonce ?: return
        val match = pendingMatch ?: return
        val direction = pendingDirection ?: return
        pendingChallenge = null

        lifecycleScope.launch {
            submitPunch(probe, liveness, match, challenge, passedAt, nonce, direction, lastPhoto)
        }
    }

    private suspend fun submitPunch(
        probe: FloatArray,
        liveness: Double,
        match: MatchResult,
        challenge: LivenessChallenge,
        passedAt: String,
        nonce: String,
        direction: String,
        photo: String?,
    ) {
        val req = MobilePunchRequest(
            probeEmbeddingB64 = embedder.toBase64(probe),
            embeddingModel = "mobilefacenet",
            matchScore = match.score.toFloat(),
            secondBestScore = match.secondBestScore.toFloat(),
            livenessScore = liveness,
            livenessChallengeType = challenge.name,
            livenessChallengePassedAt = passedAt,
            livenessNonce = nonce,
            direction = direction,
            punchTime = KioskActivity.isoNow(),
            photoB64 = photo,
            isMockLocation = false,
            isRooted = IntegrityCheck.isDeviceRooted(),
            offlineSync = false,
        )

        try {
            val resp = apiClient.recordPunch(req)
            withContext(Dispatchers.Main) {
                tvStatus.text = getString(R.string.kiosk_punch_recorded, resp.employeeName)
            }
        } catch (e: Exception) {
            try {
                val db = AppDatabase.getInstance(this@EssActivity)
                db.queuedPunchDao().insert(QueuedPunch(payloadJson = json.encodeToString(req)))
                withContext(Dispatchers.Main) {
                    Toast.makeText(this@EssActivity, getString(R.string.kiosk_punch_queued), Toast.LENGTH_SHORT).show()
                }
            } catch (dbEx: Exception) {
                Log.e(TAG, "Failed to queue punch: ${dbEx.message}")
                withContext(Dispatchers.Main) {
                    tvStatus.text = getString(R.string.kiosk_punch_network_failed)
                }
            }
        } finally {
            punchInFlight = false
            pendingDirection = null
            pendingMatch = null
            pendingNonce = null
        }
    }

    companion object {
        private const val TAG = "EssActivity"
    }
}
