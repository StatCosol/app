package com.statcosol.attendance.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Bundle
import android.util.Log
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
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.statcosol.attendance.R
import com.statcosol.attendance.api.ApiClient
import com.statcosol.attendance.api.ApiException
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

        previewView = findViewById(R.id.previewView)
        previewView.implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        tvHint = findViewById(R.id.statusText)
        tvStatus = findViewById(R.id.statusText)
        btnPunchIn = findViewById(R.id.punchInBtn)
        btnPunchOut = findViewById(R.id.punchOutBtn)

        config = DeviceConfig(this)
        apiClient = ApiClient(config)
        embedder = FaceEmbedder(this)
        faceDetector = FaceDetector()
        matcher = RosterMatcher()
        cameraExecutor = Executors.newSingleThreadExecutor()

        loadRoster()
        requestRequiredPermissions()

        btnPunchIn.setOnClickListener { initiatePunch("IN") }
        btnPunchOut.setOnClickListener { initiatePunch("OUT") }
    }

    private fun requestRequiredPermissions() {
        val missing = REQUIRED_PERMISSIONS.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) {
            startCamera()
        } else {
            ActivityCompat.requestPermissions(this, missing.toTypedArray(), PERMISSIONS_REQUEST_CODE)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != PERMISSIONS_REQUEST_CODE) return

        val cameraGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        val locationGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

        if (!cameraGranted) {
            tvHint.text = getString(R.string.permission_camera_required)
            btnPunchIn.isEnabled = false
            btnPunchOut.isEnabled = false
            return
        }

        if (!locationGranted) {
            // Location is required for geofence; block punching without it
            tvHint.text = getString(R.string.permission_location_required)
            btnPunchIn.isEnabled = false
            btnPunchOut.isEnabled = false
            return
        }

        startCamera()
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
        embedder.close()
        faceDetector.close()
    }

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
            } catch (e: ApiException) {
                if (e.code == 401 || e.code == 403) {
                    handleUnauthorized()
                } else {
                    Log.w(TAG, "Roster load failed: ${e.message}")
                    tvStatus.text = getString(R.string.ess_no_enrollment)
                }
            } catch (e: Exception) {
                Log.w(TAG, "Roster load failed: ${e.message}")
                tvStatus.text = getString(R.string.ess_no_enrollment)
            }
        }
    }

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
            } catch (e: Exception) {
                Log.e(TAG, "Camera start failed", e)
                tvHint.text = getString(R.string.camera_start_failed)
            }
        }, ContextCompat.getMainExecutor(this))
    }

    /** Returns the best available last-known location, or null if unavailable. */
    private fun getBestLastLocation(): Location? {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED) return null
        return try {
            val lm = getSystemService(LOCATION_SERVICE) as LocationManager
            val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
            providers.mapNotNull { provider ->
                try { lm.getLastKnownLocation(provider) } catch (e: Exception) { null }
            }.maxByOrNull { it.accuracy }
        } catch (e: Exception) {
            Log.w(TAG, "Location unavailable: ${e.message}")
            null
        }
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

        // Check for mock/fake GPS before committing to a punch
        val location = getBestLastLocation()
        if (location != null && IntegrityCheck.isMockLocation(this, location)) {
            tvStatus.text = getString(R.string.ess_mock_location_blocked)
            Log.w(TAG, "Punch blocked: mock location detected")
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
            } catch (e: ApiException) {
                if (e.code == 401 || e.code == 403) {
                    handleUnauthorized()
                } else {
                    Log.w(TAG, "Liveness challenge failed: ${e.message}")
                    punchInFlight = false
                }
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
        // Capture location at punch submission time
        val location = withContext(Dispatchers.Main) { getBestLastLocation() }
        val isMock = location != null && IntegrityCheck.isMockLocation(this@EssActivity, location)

        val req = MobilePunchRequest(
            embeddingB64 = embedder.toBase64(probe),
            embeddingModel = "mobilefacenet",
            livenessScore = liveness,
            livenessChallengeType = challenge.name,
            livenessNonce = nonce,
            direction = direction,
            punchTime = KioskActivity.isoNow(),
            photoB64 = photo,
            captureLat = location?.latitude,
            captureLng = location?.longitude,
            isMockLocation = isMock,
            isRooted = IntegrityCheck.isDeviceRooted(),
            offlineSync = false,
        )

        try {
            val resp = apiClient.recordPunch(req)
            withContext(Dispatchers.Main) {
                tvStatus.text = getString(R.string.kiosk_punch_recorded, resp.employeeName)
            }
        } catch (e: ApiException) {
            if (e.code == 401 || e.code == 403) {
                withContext(Dispatchers.Main) { handleUnauthorized() }
                return
            }
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
        private const val PERMISSIONS_REQUEST_CODE = 1001
        private val REQUIRED_PERMISSIONS = listOf(
            Manifest.permission.CAMERA,
            Manifest.permission.ACCESS_FINE_LOCATION,
        )
    }
}
