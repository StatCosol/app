package com.statcosol.attendance.facedesk

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.util.Size
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.statcosol.attendance.R
import com.statcosol.attendance.face.BlinkDetector
import com.statcosol.attendance.face.FaceCaptureSession
import com.statcosol.attendance.face.FaceDetector
import com.statcosol.attendance.face.FaceEmbedder
import com.statcosol.attendance.prefs.DeviceConfig
import com.statcosol.attendance.ui.KioskChrome
import com.statcosol.attendance.voice.KioskVoiceGuide
import kotlinx.coroutines.launch
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * FaceDesk V2 — admin-controlled enrollment, one employee at a time. Launched
 * with EXTRA_EMPLOYEE_ID (+ name). Captures frames, validates quality, then
 * saves the profile. Deliberately separate from the attendance screen.
 */
class FaceDeskEnrollmentActivity : AppCompatActivity() {

    private lateinit var previewView: PreviewView
    private lateinit var tvName: TextView
    private lateinit var tvHint: TextView
    private lateinit var btnCapture: Button

    private lateinit var config: DeviceConfig
    private lateinit var api: FaceDeskApiClient
    private lateinit var embedder: FaceEmbedder
    private lateinit var detector: FaceDetector
    private lateinit var cameraExecutor: ExecutorService
    private lateinit var voice: KioskVoiceGuide
    private lateinit var chrome: KioskChrome

    private lateinit var employeeId: String
    private var ticketId: String? = null
    private var subjectType: String? = null
    private val frames = mutableListOf<FaceFrame>()
    // Guided multi-angle capture progress.
    private var frontCount = 0
    private var leftCount = 0
    private var rightCount = 0
    private val blinkDetector = BlinkDetector()
    private val blinked: Boolean get() = blinkDetector.blinked
    private var captureComplete = false
    private val capturing = AtomicBoolean(false)
    private val saving = AtomicBoolean(false)
    private var guidanceStep = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_facedesk_enrollment)
        // Keep the screen awake through the guided multi-angle capture.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        previewView = findViewById(R.id.fdePreview)
        tvName = findViewById(R.id.fdeName)
        tvHint = findViewById(R.id.fdeHint)
        btnCapture = findViewById(R.id.fdeCapture)

        employeeId = intent.getStringExtra(EXTRA_EMPLOYEE_ID).orEmpty()
        ticketId = intent.getStringExtra(EXTRA_TICKET_ID)
        subjectType = intent.getStringExtra(EXTRA_SUBJECT_TYPE)
        val name = intent.getStringExtra(EXTRA_EMPLOYEE_NAME).orEmpty()
        if (employeeId.isBlank()) { finish(); return }
        tvName.text = name.ifBlank { employeeId }

        config = DeviceConfig(this)
        api = FaceDeskApiClient(config)
        embedder = FaceEmbedder(this)
        detector = FaceDetector()
        cameraExecutor = Executors.newSingleThreadExecutor()
        voice = KioskVoiceGuide(this)
        chrome = KioskChrome(this, config.apiBase)
        loadBranding()

        btnCapture.setOnClickListener { if (captureComplete) save() else startCapture() }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), 1002)
        } else {
            startCamera()
        }
        voice.speakRes(R.string.facedesk_voice_enroll_start)
    }

    override fun onResume() {
        super.onResume()
        chrome.startClock()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED
        ) {
            startCamera()
        }
    }

    override fun onPause() {
        super.onPause()
        chrome.stopClock()
        releaseCamera()
    }

    private fun releaseCamera() {
        try {
            ProcessCameraProvider.getInstance(this).get().unbindAll()
        } catch (e: Exception) {
            Log.w(TAG, "camera release failed: ${e.message}")
        }
    }

    private fun loadBranding() {
        lifecycleScope.launch {
            try {
                val cfg = api.fetchConfig()
                runOnUiThread { chrome.bindBranding(cfg.branding) }
            } catch (e: Exception) {
                Log.w(TAG, "branding fetch failed: ${e.message}")
            }
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 1002 && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            startCamera()
        }
    }

    @ExperimentalGetImage
    private fun startCamera() {
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            try {
                val provider = future.get()
                val preview = Preview.Builder().build().apply {
                    setSurfaceProvider(previewView.surfaceProvider)
                }
                // 720p analysis frames so the enrolled templates are built from
                // a large, sharp face crop (CameraX defaults to ~640x480).
                val analysis = ImageAnalysis.Builder()
                    .setResolutionSelector(HD_ANALYSIS_RESOLUTION)
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                val session = FaceCaptureSession(
                    embedder = embedder,
                    detector = detector,
                    computeFullFrameProbe = false,
                    onFace = { faceProbe, _, metrics, photo ->
                        onFrame(faceProbe, metrics.eyeOpenness, metrics.headYaw, photo)
                    },
                    onHint = { hint -> if (!capturing.get()) runOnUiThread { tvHint.text = hint } },
                )
                analysis.setAnalyzer(cameraExecutor, session)
                provider.unbindAll()
                provider.bindToLifecycle(
                    this, CameraSelector.DEFAULT_FRONT_CAMERA, preview, analysis,
                )
            } catch (e: Exception) {
                Log.e(TAG, "camera start failed", e)
                tvHint.text = getString(R.string.facedesk_camera_failed)
            }
        }, ContextCompat.getMainExecutor(this))
    }

    /** Begin guided multi-angle capture. Auto-starts once the button is tapped. */
    private fun startCapture() {
        if (saving.get() || captureComplete) return
        frames.clear()
        frontCount = 0; leftCount = 0; rightCount = 0; blinkDetector.reset()
        capturing.set(true)
        btnCapture.isEnabled = false
        guidanceStep = ""
        voice.speakRes(R.string.facedesk_voice_look_straight, key = "enroll-start")
        updateGuidance()
        // Signal the web that capture has started for this ticket.
        ticketId?.let { tid -> lifecycleScope.launch { runCatching { api.markTicketCapturing(tid) } } }
        // Safety timeout so a stuck capture tells the operator rather than hang.
        previewView.postDelayed({
            if (capturing.getAndSet(false) && !captureComplete && !saving.get()) {
                runOnUiThread {
                    tvHint.text = getString(R.string.facedesk_capture_timeout)
                    btnCapture.isEnabled = true
                }
            }
        }, CAPTURE_TIMEOUT_MS)
    }

    private fun onFrame(probe: FloatArray, eyeOpenness: Double, headYaw: Float, photo: String?) {
        if (!capturing.get()) return
        blinkDetector.onOpenness(eyeOpenness)

        // Bucket the frame by head angle and keep it as a sample.
        val type = when {
            headYaw <= -TURN_YAW -> "LEFT".also { if (leftCount < PER_ANGLE) leftCount++ else return }
            headYaw >= TURN_YAW -> "RIGHT".also { if (rightCount < PER_ANGLE) rightCount++ else return }
            kotlin.math.abs(headYaw) < FRONT_YAW -> "FRONT".also { if (frontCount < FRONT_FRAMES) frontCount++ else return }
            else -> return
        }
        frames.add(
            FaceFrame(
                embeddingB64 = embedder.toBase64(probe),
                embeddingModel = MODEL,
                photoB64 = photo,
                sampleType = type,
            ),
        )

        val done = frontCount >= FRONT_FRAMES && leftCount >= PER_ANGLE &&
            rightCount >= PER_ANGLE && blinked
        runOnUiThread { updateGuidance() }
        if (done) {
            capturing.set(false)
            captureComplete = true
            runOnUiThread {
                tvHint.text = getString(R.string.facedesk_captured_complete)
                btnCapture.text = getString(R.string.facedesk_complete)
                btnCapture.isEnabled = true
                voice.speakRes(R.string.facedesk_voice_enroll_complete, key = "enroll-done", minIntervalMs = 0)
            }
        }
    }

    /** Guide the operator toward whichever angle/blink is still missing. */
    private fun nextPrompt(): String = when {
        frontCount < FRONT_FRAMES -> getString(R.string.facedesk_look_straight)
        leftCount < PER_ANGLE -> getString(R.string.facedesk_turn_left)
        rightCount < PER_ANGLE -> getString(R.string.facedesk_turn_right)
        !blinked -> getString(R.string.facedesk_blink_now)
        else -> getString(R.string.facedesk_captured_complete)
    }

    private fun nextVoiceRes(): Int = when {
        frontCount < FRONT_FRAMES -> R.string.facedesk_voice_look_straight
        leftCount < PER_ANGLE -> R.string.facedesk_voice_turn_left
        rightCount < PER_ANGLE -> R.string.facedesk_voice_turn_right
        !blinked -> R.string.facedesk_voice_blink
        else -> R.string.facedesk_voice_enroll_complete
    }

    private fun updateGuidance() {
        val step = when {
            frontCount < FRONT_FRAMES -> "front"
            leftCount < PER_ANGLE -> "left"
            rightCount < PER_ANGLE -> "right"
            !blinked -> "blink"
            else -> "done"
        }
        tvHint.text = nextPrompt()
        if (step != guidanceStep) {
            guidanceStep = step
            voice.speakRes(nextVoiceRes(), key = "enroll-$step")
        }
    }

    private fun save() {
        if (!saving.compareAndSet(false, true)) return
        val req = SaveEnrollmentRequest(
            employeeId = employeeId,
            subjectType = subjectType,
            frames = frames.toList(),
            livenessPassed = blinked,
            consentGiven = true,
        )
        runOnUiThread { tvHint.text = getString(R.string.facedesk_saving) }
        lifecycleScope.launch {
            try {
                val res = api.saveEnrollment(req)
                ticketId?.let { tid -> runCatching { api.completeTicket(tid) } }
                runOnUiThread {
                    tvHint.text = res.message ?: getString(R.string.facedesk_enrolled)
                    voice.speakRes(R.string.facedesk_voice_enroll_saved, minIntervalMs = 0)
                }
                previewView.postDelayed({ finish() }, 1500)
            } catch (e: FaceDeskApiException) {
                runOnUiThread { showEnrollmentError(e) }
                saving.set(false)
            } catch (e: Exception) {
                runOnUiThread {
                    tvHint.text = getString(R.string.facedesk_enroll_offline)
                    resetForRetry()
                }
                saving.set(false)
            }
        }
    }

    private fun showEnrollmentError(e: FaceDeskApiException) {
        val msg = e.enrollmentUserMessage(this, R.string.facedesk_enroll_failed)
        tvHint.text = msg
        if (e.isEnrollmentDuplicateConflict()) {
            // Duplicate — admin must review; don't loop another capture.
            btnCapture.text = getString(R.string.facedesk_done)
            btnCapture.isEnabled = true
            btnCapture.setOnClickListener { finish() }
            voice.speakRes(R.string.facedesk_voice_enroll_duplicate, minIntervalMs = 0)
        } else {
            voice.speak(msg, key = "enroll-error", minIntervalMs = 0)
            resetForRetry()
        }
    }

    private fun resetForRetry() {
        captureComplete = false
        btnCapture.text = getString(R.string.facedesk_capture)
        btnCapture.isEnabled = true
        btnCapture.setOnClickListener { if (captureComplete) save() else startCapture() }
    }

    override fun onDestroy() {
        super.onDestroy()
        voice.shutdown()
        cameraExecutor.shutdown()
        detector.close()
    }

    companion object {
        private const val TAG = "FaceDeskEnroll"
        private const val FRONT_FRAMES = 8
        private const val PER_ANGLE = 3
        private const val FRONT_YAW = 12f
        private const val TURN_YAW = 18f
        // Guided capture needs 14 quality-gated frames across three head
        // angles plus a blink; 20s was routinely too tight on kiosk hardware.
        private const val CAPTURE_TIMEOUT_MS = 45_000L
        private const val MODEL = "mobilefacenet"

        // Prefer 720p analysis frames, falling back to the closest supported —
        // enrolled templates are only as good as the crop they're built from.
        private val HD_ANALYSIS_RESOLUTION = ResolutionSelector.Builder()
            // ResolutionSelector gives the aspect-ratio strategy precedence over
            // resolution and defaults to 4:3, which would override the 16:9
            // 1280x720 bound with a 4:3 output. Pin 16:9 so 720p is honored.
            .setAspectRatioStrategy(AspectRatioStrategy.RATIO_16_9_FALLBACK_AUTO_STRATEGY)
            .setResolutionStrategy(
                ResolutionStrategy(
                    Size(1280, 720),
                    ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER,
                ),
            )
            .build()

        const val EXTRA_EMPLOYEE_ID = "employeeId"
        const val EXTRA_EMPLOYEE_NAME = "employeeName"
        const val EXTRA_TICKET_ID = "ticketId"
        const val EXTRA_SUBJECT_TYPE = "subjectType"
    }
}
