package com.statcosol.attendance.facedesk

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.CountDownTimer
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
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
import com.statcosol.attendance.face.BlinkDetector
import com.statcosol.attendance.face.DeviceCameraProfile
import com.statcosol.attendance.face.FaceCameraControl
import com.statcosol.attendance.face.FaceCaptureSession
import com.statcosol.attendance.face.FaceDetector
import com.statcosol.attendance.face.FaceEmbedder
import com.statcosol.attendance.face.FaceKioskTuning
import com.statcosol.attendance.face.FaceScanGuidance
import com.statcosol.attendance.face.FaceScanOverlayView
import com.statcosol.attendance.face.ScanPhase
import com.statcosol.attendance.face.ScanProgress
import com.statcosol.attendance.prefs.DeviceConfig
import com.statcosol.attendance.ui.KioskChrome
import com.statcosol.attendance.ui.KioskLock
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
    private lateinit var scanOverlay: FaceScanOverlayView
    private lateinit var tvName: TextView
    private lateinit var tvHint: TextView
    private lateinit var tvTimer: TextView
    private lateinit var btnCapture: Button
    private lateinit var btnCancel: Button

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
    // Live enrollment countdown. Cancelled/restarted per capture attempt, so a
    // timer from a prior attempt can't cancel a fresh retry or a completed one.
    private var captureTimer: CountDownTimer? = null
    private var frontStableStreak = 0
    private val saving = AtomicBoolean(false)
    private var guidanceStep = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_facedesk_enrollment)
        // Keep the screen awake through the guided multi-angle capture.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        previewView = findViewById(R.id.fdePreview)
        scanOverlay = findViewById(R.id.fdeScanOverlay)
        scanOverlay.setMirrorForFrontCamera(true)
        tvName = findViewById(R.id.fdeName)
        tvHint = findViewById(R.id.fdeHint)
        tvTimer = findViewById(R.id.fdeTimer)
        btnCapture = findViewById(R.id.fdeCapture)
        btnCancel = findViewById(R.id.fdeCancel)
        btnCancel.setOnClickListener { exitEnrollment() }

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

        // Same kiosk lock-down as the attendance screen: full-screen, pinned,
        // and only closable with the admin PIN (long-press the client name).
        KioskLock.applyImmersive(this)
        KioskLock.startLockTaskSafe(this)
        KioskLock.bindExitTrigger(
            this,
            { config.faceDeskAdminPin },
            findViewById(R.id.headerBrand),
            findViewById(R.id.headerStrip),
        )

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
        KioskLock.applyImmersive(this)
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
                // Capture thresholds before branding: these gate what counts as
                // a usable frame, and the built-in defaults were profiled on one
                // handset. Absent config leaves this build's values untouched.
                FaceKioskTuning.applyFrom(cfg.captureTuning)
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
                // Enrolment sets the ceiling for every later match, so it gets
                // the same device-derived stream size as attendance rather than
                // one handset's 720p default. See DeviceCameraProfile.
                CameraSelector.DEFAULT_FRONT_CAMERA
                    .filter(provider.availableCameraInfos)
                    .firstOrNull()
                    ?.let {
                        FaceKioskTuning.applyDeviceProfile(
                            DeviceCameraProfile.analysisSizeFor(this, it),
                        )
                    }
                val preview = Preview.Builder().build().apply {
                    setSurfaceProvider(previewView.surfaceProvider)
                }
                // Analysis frames at the profiled size so enrolled templates are
                // built from a large, sharp face crop (CameraX defaults to
                // ~640x480).
                val analysis = ImageAnalysis.Builder()
                    .setResolutionSelector(FaceKioskTuning.analysisResolution)
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                val session = FaceCaptureSession(
                    embedder = embedder,
                    detector = detector,
                    minFaceSize = { FaceKioskTuning.MIN_FACE_SIZE_ENROLLMENT },
                    minSharpness = { FaceKioskTuning.MIN_SHARPNESS_ENROLLMENT },
                    minLuminance = { FaceKioskTuning.MIN_LUMINANCE },
                    maxPitch = { FaceKioskTuning.MAX_PITCH_DEG },
                    computeFullFrameProbe = false,
                    relaxPitchGate = { frontCount >= FRONT_FRAMES },
                    onFace = { faceProbe, _, metrics, photo ->
                        onFrame(faceProbe, metrics, photo)
                    },
                    onHint = { hint ->
                        if (!capturing.get()) runOnUiThread { tvHint.text = hint }
                    },
                    onPreview = { preview ->
                        runOnUiThread {
                            scanOverlay.updatePreview(preview)
                            if (capturing.get()) refreshOverlayProgress()
                        }
                    },
                )
                analysis.setAnalyzer(cameraExecutor, session)
                provider.unbindAll()
                val camera = provider.bindToLifecycle(
                    this, CameraSelector.DEFAULT_FRONT_CAMERA, preview, analysis,
                )
                // No front flash on the kiosk phone — brighten exposure so faces
                // aren't under-exposed under dim gate lighting.
                FaceCameraControl.applyLowLightExposure(camera)
                // NOTE: face-region focus/AE metering was tried here but made the
                // budget front sensor hunt/mis-expose, so frames failed the
                // sharpness/brightness gates ("not capturing"). Removed.
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
        frontCount = 0; leftCount = 0; rightCount = 0
        frontStableStreak = 0
        blinkDetector.reset()
        capturing.set(true)
        btnCapture.isEnabled = false
        guidanceStep = ""
        voice.speakRes(R.string.facedesk_voice_look_straight, key = "enroll-start")
        updateGuidance()
        refreshOverlayProgress()
        // Signal the web that capture has started for this ticket.
        ticketId?.let { tid -> lifecycleScope.launch { runCatching { api.markTicketCapturing(tid) } } }
        startCaptureTimer()
    }

    /**
     * Start (or restart) the live enrollment countdown. Shows an on-screen
     * mm:ss timer and, if the full set isn't captured before it reaches zero,
     * cancels the whole enrollment. Cancelling any prior timer first means a
     * stale countdown from an earlier attempt can't cancel a fresh retry.
     */
    private fun startCaptureTimer() {
        captureTimer?.cancel()
        tvTimer.visibility = View.VISIBLE
        captureTimer = object : CountDownTimer(CAPTURE_TIMEOUT_MS, 1_000L) {
            override fun onTick(msLeft: Long) {
                val secondsLeft = ((msLeft + 999L) / 1000L).toInt()
                tvTimer.text = getString(
                    R.string.facedesk_timer_format,
                    secondsLeft / 60,
                    secondsLeft % 60,
                )
                // Warn in red for the final stretch.
                tvTimer.setTextColor(if (secondsLeft <= 30) 0xFFEF4444.toInt() else 0xFFFFFFFF.toInt())
            }

            override fun onFinish() {
                // A capture that already completed within the budget, or one
                // mid-save, is left alone — the save has its own handling.
                if (capturing.getAndSet(false) && !captureComplete && !saving.get()) {
                    cancelEnrollment()
                } else {
                    stopCaptureTimer()
                }
            }
        }.start()
    }

    /** Stop and hide the countdown (capture finished, cancelled, or torn down). */
    private fun stopCaptureTimer() {
        captureTimer?.cancel()
        captureTimer = null
        tvTimer.visibility = View.GONE
    }

    /**
     * Operator backs out of enrollment (wrong person, already enrolled, or just
     * done) without completing a capture. Releases the ticket (idempotent — a
     * completed ticket is unaffected) and returns to the previous screen. This
     * is the only sanctioned exit on a device-owner-locked kiosk where Back is
     * blocked.
     */
    private fun exitEnrollment() {
        // Never race an in-flight save: the button is disabled while saving, but
        // guard here too against a tap landing in the same frame. Cancelling
        // mid-save could abandon the ticket while the profile commits, or stop
        // completeTicket() from running.
        if (isFinishing || saving.get()) return
        stopCaptureTimer()
        capturing.set(false)
        ticketId?.let { tid -> lifecycleScope.launch { runCatching { api.cancelTicket(tid) } } }
        returnToAttendance()
    }

    /**
     * Go back to the attendance punch screen. On an attendance-mode device the
     * enrollment sits above the picker (attendance → picker → enrollment), so a
     * plain finish() would only reveal the picker; bring attendance to the front
     * and clear the picker + this screen above it. On an enrollment-mode device
     * the picker IS home, so just finish() back to it.
     */
    private fun returnToAttendance() {
        if (config.deviceMode.equals("FACEDESK_ENROLLMENT", ignoreCase = true)) {
            finish()
        } else {
            startActivity(
                Intent(this, FaceDeskAttendanceActivity::class.java).addFlags(
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP,
                ),
            )
            finish()
        }
    }

    /**
     * Abort the enrollment because the capture time limit was exceeded. Cancels
     * the ticket server-side (best effort — the device token can do this), tells
     * the operator why, then closes the screen. A fresh attempt must be started
     * from the admin.
     */
    private fun cancelEnrollment() {
        if (isFinishing) return
        capturing.set(false)
        ticketId?.let { tid -> lifecycleScope.launch { runCatching { api.cancelTicket(tid) } } }
        runOnUiThread {
            stopCaptureTimer()
            tvHint.text = getString(R.string.facedesk_capture_timeout)
            btnCapture.isEnabled = false
            voice.speakRes(R.string.facedesk_voice_enroll_cancelled, minIntervalMs = 0)
            // Leave the message up briefly so the operator sees the reason.
            previewView.postDelayed({ if (!isFinishing) finish() }, 2_500)
        }
    }

    private fun onFrame(probe: FloatArray, metrics: com.statcosol.attendance.face.FaceMetrics, photo: String?) {
        if (!capturing.get()) return
        blinkDetector.onOpenness(metrics.eyeOpenness)

        val headYaw = metrics.headYaw
        val quality = metrics.captureQuality

        // Front-facing frames must be stable and high-quality before angle turns.
        if (frontCount < FRONT_FRAMES) {
            if (kotlin.math.abs(headYaw) >= FRONT_YAW) return
            if (quality < MIN_FRONT_QUALITY) {
                runOnUiThread { tvHint.text = getString(R.string.facedesk_look_straight) }
                frontStableStreak = 0
                return
            }
            frontStableStreak++
            if (frontStableStreak < FRONT_STABLE_FRAMES) {
                runOnUiThread { tvHint.text = getString(R.string.facedesk_hold_still) }
                return
            }
            frontStableStreak = 0
        } else if (quality < MIN_ANGLE_QUALITY) {
            return
        }

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
                qualityScore = quality,
            ),
        )
        Log.d(
            TAG,
            "capture type=$type yaw=${"%.1f".format(headYaw)} quality=${"%.2f".format(quality)} " +
                "counts front=$frontCount left=$leftCount right=$rightCount blink=$blinked",
        )

        val done = frontCount >= FRONT_FRAMES && leftCount >= PER_ANGLE &&
            rightCount >= PER_ANGLE && blinked
        runOnUiThread { updateGuidance() }
        if (done) {
            capturing.set(false)
            captureComplete = true
            runOnUiThread {
                stopCaptureTimer()
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

    private fun refreshOverlayProgress() {
        val phase = FaceScanGuidance.phaseForEnrollment(
            frontCount, leftCount, rightCount,
            FRONT_FRAMES, PER_ANGLE, blinked,
            capturing.get(), captureComplete,
        )
        val stepIndex = when (phase) {
            ScanPhase.FRONT -> 0
            ScanPhase.LEFT -> 1
            ScanPhase.RIGHT -> 2
            ScanPhase.BLINK -> 3
            else -> if (captureComplete) 3 else 0
        }
        val (current, required) = when (phase) {
            ScanPhase.FRONT -> frontCount to FRONT_FRAMES
            ScanPhase.LEFT -> leftCount to PER_ANGLE
            ScanPhase.RIGHT -> rightCount to PER_ANGLE
            ScanPhase.BLINK -> (if (blinked) 1 else 0) to 1
            else -> 0 to 0
        }
        scanOverlay.updateProgress(
            ScanProgress(
                phase = phase,
                stepIndex = stepIndex,
                currentFrames = current,
                requiredFrames = required,
                frontCount = frontCount,
                leftCount = leftCount,
                rightCount = rightCount,
                blinked = blinked,
            ),
        )
        if (capturing.get()) {
            tvHint.text = getString(
                R.string.facedesk_capturing,
                current.coerceAtLeast(1),
                required.coerceAtLeast(1),
            ) + " — " + nextPrompt()
        }
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
        refreshOverlayProgress()
    }

    private fun save() {
        if (!saving.compareAndSet(false, true)) return
        // Keep every frame's photo: when face-svc is enabled the server builds
        // the enrolled ArcFace template by re-embedding each frame's photo (see
        // FaceDeskFaceService.resolveFrames). Trimming them to one would leave
        // the profile enrolled from a single sample / the device fallback. The
        // server picks one of these as the stored representative photo.
        val req = SaveEnrollmentRequest(
            employeeId = employeeId,
            subjectType = subjectType,
            frames = frames.toList(),
            livenessPassed = blinked,
            consentGiven = true,
        )
        runOnUiThread {
            tvHint.text = getString(R.string.facedesk_saving)
            // Lock out interaction while the save is in flight so Cancel can't
            // race a request that may already be committing on the server.
            btnCancel.isEnabled = false
            btnCapture.isEnabled = false
        }
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
        // Save failed — re-allow backing out.
        btnCancel.isEnabled = true
        btnCapture.setOnClickListener { if (captureComplete) save() else startCapture() }
    }

    override fun onDestroy() {
        super.onDestroy()
        captureTimer?.cancel()
        voice.shutdown()
        cameraExecutor.shutdown()
        detector.close()
    }

    companion object {
        private const val TAG = "FaceDeskEnroll"
        private const val FRONT_FRAMES = FaceKioskTuning.ENROLL_FRONT_FRAMES
        private const val PER_ANGLE = FaceKioskTuning.ENROLL_PER_ANGLE
        private const val FRONT_YAW = FaceKioskTuning.ENROLL_FRONT_YAW
        private const val TURN_YAW = FaceKioskTuning.ENROLL_TURN_YAW
        private const val MIN_FRONT_QUALITY = FaceKioskTuning.ENROLL_MIN_FRONT_QUALITY
        private const val MIN_ANGLE_QUALITY = FaceKioskTuning.ENROLL_MIN_ANGLE_QUALITY
        private const val FRONT_STABLE_FRAMES = FaceKioskTuning.ENROLL_FRONT_STABLE_FRAMES
        private const val CAPTURE_TIMEOUT_MS = FaceKioskTuning.ENROLL_CAPTURE_TIMEOUT_MS
        private const val MODEL = "mobilefacenet"

        const val EXTRA_EMPLOYEE_ID = "employeeId"
        const val EXTRA_EMPLOYEE_NAME = "employeeName"
        const val EXTRA_TICKET_ID = "ticketId"
        const val EXTRA_SUBJECT_TYPE = "subjectType"
    }
}
