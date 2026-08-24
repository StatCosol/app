package com.statcosol.attendance.facedesk

import android.Manifest
import androidx.activity.result.contract.ActivityResultContracts
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.view.WindowManager
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
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
import com.statcosol.attendance.BuildConfig
import com.statcosol.attendance.face.BlinkDetector
import com.statcosol.attendance.face.FaceCameraControl
import com.statcosol.attendance.face.FaceCaptureSession
import com.statcosol.attendance.face.FaceDetector
import com.statcosol.attendance.face.FaceEmbedder
import com.statcosol.attendance.face.FaceKioskTuning
import com.statcosol.attendance.face.FaceScanOverlayView
import com.statcosol.attendance.face.ScanPhase
import com.statcosol.attendance.face.ScanProgress
import com.statcosol.attendance.prefs.DeviceConfig
import com.statcosol.attendance.sync.FaceDeskOfflineSyncWorker
import com.statcosol.attendance.ui.KioskChrome
import com.statcosol.attendance.ui.KioskLock
import com.statcosol.attendance.voice.KioskVoiceGuide
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.UUID
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * FaceDesk V2 — full-screen attendance kiosk. No employee list, no search:
 * the employee simply stands in front, frames are captured, and attendance is
 * marked (or queued offline). Success screen auto-resets after 3 seconds.
 * Deliberately separate from the enrollment screen.
 */
class FaceDeskAttendanceActivity : AppCompatActivity() {

    private lateinit var previewView: PreviewView
    private lateinit var scanOverlay: FaceScanOverlayView
    private lateinit var tvTitle: TextView
    private lateinit var tvResult: TextView

    private lateinit var config: DeviceConfig
    private lateinit var api: FaceDeskApiClient
    private lateinit var offline: FaceDeskOfflineStore
    private lateinit var embedder: FaceEmbedder
    private lateinit var detector: FaceDetector
    private lateinit var cameraExecutor: ExecutorService
    private lateinit var voice: KioskVoiceGuide
    private lateinit var chrome: KioskChrome

    private val frames = mutableListOf<FaceFrame>()
    private val blinkDetector = BlinkDetector(
        FaceKioskTuning.BLINK_ABS_THRESHOLD,
        FaceKioskTuning.BLINK_DROP_DELTA,
    )
    private var lastFrameAtMs = 0L
    private val submitting = AtomicBoolean(false)
    private var paused = false

    // PIN_THEN_FACE: the worker enters their PIN before the camera captures.
    // The server resolves the PIN against the branch roster and verifies the
    // face 1:1, so no employee code is entered (enteredCode stays null; kept
    // only so an older server that still expects a code degrades cleanly).
    private var enteredCode: String? = null
    private var enteredPin: String? = null
    private var pinDialog: AlertDialog? = null

    // Web-initiated enrollment: while a ticket is open for this device,
    // attendance is held and the enrollment screen is launched for it.
    private var enrollmentHold = false
    private var ticketPollJob: Job? = null
    /** Brief pause after enrollment returns so a failed ticket doesn't instantly reopen. */
    private var ticketPollPausedUntilMs = 0L

    private val enrollmentLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) {
        // Enrollment took the front camera — rebind on resume and cool down ticket poll.
        ticketPollPausedUntilMs = android.os.SystemClock.elapsedRealtime() + TICKET_POLL_COOLDOWN_MS
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED
        ) {
            startCamera()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_facedesk_attendance)
        // Kiosk: never let the screen doze off mid-shift while attendance is up.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        previewView = findViewById(R.id.fdPreview)
        scanOverlay = findViewById(R.id.fdScanOverlay)
        scanOverlay.setMirrorForFrontCamera(true)
        tvTitle = findViewById(R.id.fdTitle)
        tvResult = findViewById(R.id.fdResult)

        config = DeviceConfig(this)
        api = FaceDeskApiClient(config)
        offline = FaceDeskOfflineStore(this)
        embedder = FaceEmbedder(this)
        detector = FaceDetector()
        cameraExecutor = Executors.newSingleThreadExecutor()
        voice = KioskVoiceGuide(this)
        chrome = KioskChrome(this, config.apiBase)
        loadBranding()

        // Admin-gated switch to enrollment: long-press the title, enter the PIN.
        // Keeps one device usable for both without ever mixing the two screens.
        tvTitle.setOnLongClickListener { promptEnrollmentUnlock(); true }

        // Kiosk lock-down: full-screen, pin the app, and only let an operator
        // close it via the admin PIN — long-press the client name in the header.
        KioskLock.applyImmersive(this)
        KioskLock.startLockTaskSafe(this)
        KioskLock.bindExitTrigger(
            this,
            findViewById(R.id.headerBrand),
            findViewById(R.id.headerStrip),
        )

        flushOfflineQueue()

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), 1001)
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 1001 && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            startCamera()
        } else {
            tvTitle.text = getString(R.string.facedesk_camera_needed)
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
                // Request 720p analysis frames (CameraX defaults to ~640x480,
                // which yields a small, soft face crop and weak embeddings).
                // Higher-res in gives ML Kit + the embedder a sharper face.
                val analysis = ImageAnalysis.Builder()
                    .setResolutionSelector(FaceKioskTuning.analysisResolution)
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                val session = FaceCaptureSession(
                    embedder = embedder,
                    detector = detector,
                    minFaceSize = FaceKioskTuning.MIN_FACE_SIZE_ATTENDANCE,
                    minSharpness = FaceKioskTuning.MIN_SHARPNESS_ATTENDANCE,
                    computeFullFrameProbe = false,
                    onFace = { faceProbe, _, metrics, photo ->
                        onFrame(faceProbe, metrics, photo)
                    },
                    onHint = { hint ->
                        if (!paused && frames.isEmpty()) runOnUiThread { tvTitle.text = hint }
                    },
                    onPreview = { preview ->
                        runOnUiThread {
                            scanOverlay.updatePreview(preview)
                            refreshAttendanceOverlay()
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
            } catch (e: Exception) {
                Log.e(TAG, "camera start failed", e)
                tvTitle.text = getString(R.string.facedesk_camera_failed)
            }
        }, ContextCompat.getMainExecutor(this))
    }

    override fun onResume() {
        super.onResume()
        KioskLock.applyImmersive(this)
        chrome.startClock()
        // Returned from enrollment (or first shown) — release the hold, discard
        // any stale buffer, and (re)start ticket polling.
        enrollmentHold = false
        frames.clear(); blinkDetector.reset()
        submitting.set(false); paused = false
        enteredCode = null; enteredPin = null
        runOnUiThread {
            tvResult.text = ""
            tvTitle.text = getString(R.string.facedesk_look_at_camera)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED
        ) {
            startCamera()
        }
        startTicketPolling()
        promptPinEntry()
    }

    /**
     * PIN_THEN_FACE: block face capture until the worker enters their 4-digit
     * PIN. The PIN alone identifies them (the server resolves it against the
     * branch roster and the face verifies) — no employee code to type, so
     * unskilled staff enter a single short code. The dialog is non-cancelable
     * so the kiosk always has a claimed PIN before the camera is used.
     */
    private fun promptPinEntry() {
        pinDialog?.dismiss()
        pinDialog = null
        paused = true
        frames.clear(); blinkDetector.reset()
        pinDialog?.dismiss()
        // Big on-screen numeric keypad — no soft keyboard. Auto-submits the
        // instant a full 4-digit PIN is tapped; non-cancelable so the kiosk
        // always has a claimed PIN before the camera is used.
        pinDialog = PinKeypadDialog.show(
            activity = this,
            title = getString(R.string.facedesk_pin_entry_title),
            fixedLength = 4,
            cancelable = false,
            onSubmit = { pin ->
                pinDialog = null
                enteredCode = null
                enteredPin = pin
                paused = false
                runOnUiThread {
                    tvResult.text = ""
                    setTitleWithVoice(R.string.facedesk_look_at_camera, R.string.facedesk_voice_look_at_camera)
                }
            },
        )
        voice.speakRes(R.string.facedesk_voice_pin_entry)
    }

    override fun onPause() {
        super.onPause()
        chrome.stopClock()
        ticketPollJob?.cancel()
        releaseCamera()
        pinDialog?.dismiss()
        pinDialog = null
    }

    private fun releaseCamera() {
        try {
            ProcessCameraProvider.getInstance(this).get().unbindAll()
        } catch (e: Exception) {
            Log.w(TAG, "camera release failed: ${e.message}")
        }
    }

    /** Poll for a web-initiated enrollment ticket; hold attendance + open enroll. */
    private fun startTicketPolling() {
        ticketPollJob?.cancel()
        ticketPollJob = lifecycleScope.launch {
            while (isActive) {
                try {
                    if (!enrollmentHold &&
                        android.os.SystemClock.elapsedRealtime() >= ticketPollPausedUntilMs
                    ) {
                        val ticket = api.pendingTicket()
                        if (ticket != null) {
                            enrollmentHold = true
                            // Drop any frames buffered before the hold so a
                            // post-enrollment batch can't mix stale embeddings.
                            frames.clear(); blinkDetector.reset()
                            submitting.set(false)
                            runOnUiThread {
                                tvTitle.text = getString(R.string.facedesk_enroll_in_progress)
                                tvResult.text = ticket.employeeName ?: ""
                            }
                            releaseCamera()
                            enrollmentLauncher.launch(
                                Intent(this@FaceDeskAttendanceActivity, FaceDeskEnrollmentActivity::class.java).apply {
                                    putExtra(FaceDeskEnrollmentActivity.EXTRA_EMPLOYEE_ID, ticket.employeeId)
                                    putExtra(FaceDeskEnrollmentActivity.EXTRA_EMPLOYEE_NAME, ticket.employeeName)
                                    putExtra(FaceDeskEnrollmentActivity.EXTRA_TICKET_ID, ticket.ticketId)
                                    putExtra(FaceDeskEnrollmentActivity.EXTRA_SUBJECT_TYPE, ticket.subjectType)
                                },
                            )
                        }
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "ticket poll failed: ${e.message}")
                }
                delay(TICKET_POLL_MS)
            }
        }
    }

    private fun onFrame(probe: FloatArray, metrics: com.statcosol.attendance.face.FaceMetrics, photo: String?) {
        if (paused || submitting.get() || enrollmentHold) return
        // Never capture until the worker has entered their PIN.
        if (enteredPin == null) return

        // A long gap between accepted frames means the previous person walked
        // away mid-capture — drop their frames so batches never mix people.
        val now = android.os.SystemClock.elapsedRealtime()
        if (frames.isNotEmpty() && now - lastFrameAtMs > STALE_GAP_MS) {
            frames.clear()
            blinkDetector.reset()
        }
        lastFrameAtMs = now

        blinkDetector.onOpenness(metrics.eyeOpenness)
        frames.add(
            FaceFrame(
                embeddingB64 = embedder.toBase64(probe),
                embeddingModel = MODEL,
                photoB64 = photo,
                qualityScore = metrics.captureQuality,
            ),
        )
        // onFrame runs on FaceCaptureSession's Dispatchers.Default thread;
        // View updates (invalidate) must be marshalled onto the main thread.
        runOnUiThread { refreshAttendanceOverlay() }

        val blinked = blinkDetector.blinked
        when {
            // Enough frames + a blink seen → submit with liveness proven.
            frames.size >= REQUIRED_FRAMES && blinked -> submit()
            // Enough frames but no blink yet — prompt and keep sampling
            // instead of submitting a batch the server will reject.
            frames.size >= MAX_FRAMES -> submit()
            frames.size >= REQUIRED_FRAMES ->
                runOnUiThread {
                    tvTitle.text = getString(R.string.facedesk_blink_now)
                    voice.speakRes(R.string.facedesk_voice_blink, key = "blink")
                }
            else -> runOnUiThread {
                tvTitle.text = getString(
                    R.string.facedesk_capturing,
                    frames.size,
                    REQUIRED_FRAMES,
                )
            }
        }
    }

    private fun refreshAttendanceOverlay() {
        val capturing = enteredPin != null && !paused && !submitting.get() && !enrollmentHold
        val phase = when {
            !capturing -> ScanPhase.IDLE
            blinkDetector.blinked -> ScanPhase.BLINK
            frames.size >= REQUIRED_FRAMES -> ScanPhase.BLINK
            frames.isNotEmpty() -> ScanPhase.CAPTURING
            else -> ScanPhase.IDLE
        }
        val required = if (frames.size >= REQUIRED_FRAMES && !blinkDetector.blinked) 1 else REQUIRED_FRAMES
        val current = when {
            phase == ScanPhase.BLINK -> if (blinkDetector.blinked) 1 else 0
            else -> frames.size
        }
        scanOverlay.updateProgress(
            ScanProgress(
                phase = phase,
                currentFrames = current,
                requiredFrames = required,
                blinked = blinkDetector.blinked,
            ),
        )
    }

    private fun submit() {
        if (!submitting.compareAndSet(false, true)) return
        val batch = frames.toList()
        // Blink detected via absolute-floor or a sharp drop from the open baseline.
        val livenessPassed = blinkDetector.blinked
        val req = MarkAttendanceRequest(
            frames = batch,
            employeeCode = enteredCode,
            pin = enteredPin,
            // Attach one capture photo so the branch can verify a mismatch punch.
            photoB64 = batch.firstNotNullOfOrNull { it.photoB64 },
            livenessPassed = livenessPassed,
            offlineRef = UUID.randomUUID().toString(),
            appVersion = BuildConfig.VERSION_NAME,
            offlineQueueDepth = offline.size(),
        )
        lifecycleScope.launch {
            voice.speakRes(R.string.facedesk_voice_processing, minIntervalMs = 0)
            try {
                val res = api.markAttendance(req)
                showResult(res)
            } catch (e: FaceDeskApiException) {
                // Genuine rejection (4xx with a message) — show it, don't queue.
                showRejection(e.userMessage(this@FaceDeskAttendanceActivity, R.string.facedesk_not_recognized))
            } catch (e: Exception) {
                // Network/offline — queue and confirm.
                offline.enqueue(req)
                FaceDeskOfflineSyncWorker.enqueue(this@FaceDeskAttendanceActivity)
                showOfflineSaved()
            }
        }
    }

    private fun showResult(res: MarkAttendanceResponse) {
        when (res.status) {
            "MARKED" -> {
                val name = res.employeeName?.takeIf { it.isNotBlank() }
                    ?: res.employeeCode?.takeIf { it.isNotBlank() }
                    ?: ""
                runOnUiThread {
                    tvResult.text = ""
                    if (name.isNotBlank()) {
                        chrome.showSuccess(name, res.punchType) { }
                    }
                }
                if (name.isNotBlank()) {
                    voice.speak(getString(R.string.facedesk_voice_success, name), minIntervalMs = 0)
                } else {
                    voice.speakRes(R.string.facedesk_voice_success_generic, minIntervalMs = 0)
                }
                autoReset(3000)
            }
            "RETRY" -> {
                tvResult.text = res.message
                voice.speakRes(R.string.facedesk_voice_not_recognized, minIntervalMs = 0)
                softReset(1500)
            }
            "REVIEW" -> {
                tvResult.text = res.message
                voice.speakRes(R.string.facedesk_voice_success_generic, minIntervalMs = 0)
                autoReset(3000)
            }
            else -> showRejection(res.message)
        }
    }

    private fun showRejection(msg: String) {
        runOnUiThread { tvResult.text = msg }
        voice.speakRes(R.string.facedesk_voice_not_recognized, minIntervalMs = 0)
        softReset(2000)
    }

    private fun showOfflineSaved() {
        runOnUiThread { tvResult.text = getString(R.string.facedesk_offline_saved) }
        voice.speakRes(R.string.facedesk_voice_offline, minIntervalMs = 0)
        autoReset(2500)
    }

    private fun setTitleWithVoice(titleRes: Int, voiceRes: Int) {
        tvTitle.text = getString(titleRes)
        voice.speakRes(voiceRes)
    }

    /** Full reset after a completed punch: clear result and resume scanning. */
    private fun autoReset(delayMs: Long) {
        paused = true
        previewView.postDelayed({
            frames.clear(); blinkDetector.reset()
            submitting.set(false); paused = false
            // A completed punch ends this person's session — require the next
            // worker to enter their own PIN.
            enteredCode = null; enteredPin = null
            runOnUiThread { tvResult.text = ""; tvTitle.text = getString(R.string.facedesk_look_at_camera) }
            runOnUiThread { promptPinEntry() }
        }, delayMs)
    }

    /** Soft reset (retry/reject): keep scanning, just clear the buffer. */
    private fun softReset(delayMs: Long) {
        // A wrong PIN or face-mismatch means this attempt is done — re-ask for
        // credentials rather than silently re-capturing against stale ones.
        enteredCode = null; enteredPin = null
        previewView.postDelayed({
            frames.clear(); blinkDetector.reset()
            submitting.set(false)
            runOnUiThread { tvResult.text = "" }
            runOnUiThread { promptPinEntry() }
        }, delayMs)
    }

    /** PIN gate → open the enrollment picker (admin action). */
    private fun promptEnrollmentUnlock() {
        val config = DeviceConfig(this)
        // Same big keypad, variable length (admin PINs are 4–12 digits) with an
        // OK key, and cancelable since this is an optional admin action.
        PinKeypadDialog.show(
            activity = this,
            title = getString(R.string.facedesk_enroll_mode_title),
            message = getString(R.string.facedesk_admin_pin_message),
            fixedLength = null,
            cancelable = true,
            onSubmit = { pin ->
                if (pin == config.faceDeskAdminPin) {
                    startActivity(Intent(this, FaceDeskEnrollPickerActivity::class.java))
                } else {
                    runOnUiThread { tvResult.text = getString(R.string.facedesk_wrong_pin) }
                    voice.speakRes(R.string.facedesk_voice_wrong_pin, minIntervalMs = 0)
                    tvResult.postDelayed({ runOnUiThread { tvResult.text = "" } }, 1500)
                }
            },
        )
    }

    private fun flushOfflineQueue() {
        if (offline.size() == 0) return
        lifecycleScope.launch {
            FaceDeskOfflineSync.flush(
                api = api,
                store = offline,
                appVersion = BuildConfig.VERSION_NAME,
            )
            if (offline.size() > 0) {
                FaceDeskOfflineSyncWorker.enqueue(this@FaceDeskAttendanceActivity)
            }
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

    override fun onDestroy() {
        super.onDestroy()
        pinDialog?.dismiss(); pinDialog = null
        voice.shutdown()
        cameraExecutor.shutdown()
        detector.close()
    }

    companion object {
        private const val TAG = "FaceDeskAttendance"
        private const val REQUIRED_FRAMES = FaceKioskTuning.ATTENDANCE_REQUIRED_FRAMES
        private const val MAX_FRAMES = FaceKioskTuning.ATTENDANCE_MAX_FRAMES
        private const val STALE_GAP_MS = FaceKioskTuning.ATTENDANCE_STALE_GAP_MS
        private const val TICKET_POLL_MS = 4_000L
        private const val TICKET_POLL_COOLDOWN_MS = 30_000L
        private const val MODEL = "mobilefacenet"
    }
}
