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
import com.statcosol.attendance.face.DeviceCameraProfile
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
import java.time.Instant
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
    private val blinkDetector = BlinkDetector()
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
    private var configFetchJob: Job? = null
    private var requiredFrames = FaceKioskTuning.ATTENDANCE_REQUIRED_FRAMES
    private var maxFrames = FaceKioskTuning.ATTENDANCE_MAX_FRAMES
    private var livenessRequired = true
    private var offlineSyncEnabled = true

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

        // Admin-gated switch to enrollment: long-press the title, enter the PIN.
        // Keeps one device usable for both without ever mixing the two screens.
        tvTitle.setOnLongClickListener { promptEnrollmentUnlock(); true }

        // Kiosk lock-down: full-screen, pin the app, and only let an operator
        // close it via the admin PIN — long-press the client name in the header.
        KioskLock.applyImmersive(this)
        KioskLock.startLockTaskSafe(this)
        KioskLock.bindExitTrigger(
            this,
            { config.faceDeskAdminPin },
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
                // Size the stream to THIS camera before building the analysis
                // use case. The built-in default was profiled on one handset;
                // on any other it is a guess, and the APK ships everywhere.
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
                // Analysis frames come in at the profiled size (CameraX defaults
                // to ~640x480, which yields a small, soft face crop and weak
                // embeddings). Higher-res in gives ML Kit + the embedder a
                // sharper face.
                val analysis = ImageAnalysis.Builder()
                    .setResolutionSelector(FaceKioskTuning.analysisResolution)
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                val session = FaceCaptureSession(
                    embedder = embedder,
                    detector = detector,
                    minFaceSize = { FaceKioskTuning.MIN_FACE_SIZE_ATTENDANCE },
                    minSharpness = { FaceKioskTuning.MIN_SHARPNESS_ATTENDANCE },
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
                // NOTE: face-region focus/AE metering was tried here but made the
                // budget front sensor hunt/mis-expose, so frames failed the
                // sharpness/brightness gates ("not capturing"). Removed.
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
        submitting.set(false)
        enteredCode = null; enteredPin = null
        // Hold capture until the server confirms identification mode. Showing the
        // PIN keypad from stale prefs (default PIN_THEN_FACE) before config
        // arrives made FACE_ONLY sites ask for a PIN the server would ignore.
        paused = true
        pinDialog?.dismiss()
        pinDialog = null
        runOnUiThread {
            tvResult.text = ""
            tvTitle.text = getString(R.string.facedesk_loading_config)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED
        ) {
            startCamera()
        }
        startTicketPolling()
        refreshDeviceConfig()
    }

    /**
     * PIN_THEN_FACE: block face capture until the worker enters their 4-digit
     * PIN. The PIN alone identifies them (the server resolves it against the
     * branch roster and the face verifies) — no employee code to type, so
     * unskilled staff enter a single short code. The dialog is non-cancelable
     * so the kiosk always has a claimed PIN before the camera is used.
     */
    /**
     * FACE_ONLY identifies 1:N from the face alone, so there is no PIN to ask
     * for. Read from persisted config rather than the live fetch, which has not
     * necessarily completed by the time the keypad would be shown.
     */
    /**
     * Whether the kiosk may capture. PIN_THEN_FACE waits for the PIN that
     * claims an identity; the face-identified modes have no claim to wait for,
     * because the face IS the claim.
     */
    private fun readyToCapture(): Boolean = isFaceIdentified() || enteredPin != null

    /**
     * Modes where the kiosk identifies from the face and must NOT ask for a PIN.
     *
     * FACE_THEN_BIOMETRIC belongs here as much as FACE_ONLY does: its second
     * factor is a fingerprint on the eSSL device, not anything this kiosk
     * collects. Matching only FACE_ONLY would strand those workers at a keypad
     * whose value the server then ignores — a credential prompt that cannot
     * succeed and is not documented anywhere they could see.
     */
    private fun isFaceIdentified(): Boolean =
        config.faceDeskIdentificationMode == "FACE_ONLY" ||
            config.faceDeskIdentificationMode == "FACE_THEN_BIOMETRIC"

    private fun promptPinEntry() {
        if (isFaceIdentified()) {
            // No credential to collect: leave the camera running so the next
            // worker simply steps up. paused stays false, so capture continues.
            pinDialog?.dismiss()
            pinDialog = null
            enteredCode = null
            enteredPin = null
            paused = false
            runOnUiThread {
                tvResult.text = ""
                setTitleWithVoice(
                    R.string.facedesk_look_at_camera,
                    R.string.facedesk_voice_look_at_camera,
                )
            }
            return
        }
        if (enteredPin != null) {
            // Worker already claimed identity for this resume cycle; do not
            // re-open the keypad when a late config fetch confirms PIN mode.
            paused = false
            return
        }
        pinDialog?.dismiss()
        pinDialog = null
        paused = true
        frames.clear(); blinkDetector.reset()
        // onResume leaves the header on "Loading kiosk settings…" until the mode
        // is known. Reaching here means it IS known, so clear it: the keypad
        // does not cover the header strip, and a screen that says it is still
        // loading while asking for input reads as a stuck kiosk.
        runOnUiThread { tvTitle.text = getString(R.string.facedesk_pin_entry_title) }
        // Big on-screen numeric keypad — no soft keyboard. Auto-submits the
        // instant a full 4-digit PIN is tapped; non-cancelable so the kiosk
        // always has a claimed PIN before the camera is used.
        pinDialog = PinKeypadDialog.show(
            activity = this,
            title = getString(R.string.facedesk_pin_entry_title),
            fixedLength = 4,
            cancelable = false,
            // Hidden admin exit: long-press the "Enter your PIN" title to open the
            // admin-PIN prompt, since this modal keypad covers the client name.
            onTitleLongPress = { KioskLock.showExitDialog(this, config.faceDeskAdminPin) },
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
        // Never capture until the worker has claimed an identity — the PIN in
        // PIN_THEN_FACE, and nothing at all in FACE_ONLY.
        if (!readyToCapture()) return

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
            frames.size >= requiredFrames && (!livenessRequired || blinked) -> submit()
            frames.size >= maxFrames -> submit()
            frames.size >= requiredFrames && livenessRequired ->
                runOnUiThread {
                    tvTitle.text = getString(R.string.facedesk_blink_now)
                    voice.speakRes(R.string.facedesk_voice_blink, key = "blink")
                }
            else -> runOnUiThread {
                tvTitle.text = getString(
                    R.string.facedesk_capturing,
                    frames.size,
                    requiredFrames,
                )
            }
        }
    }

    private fun refreshAttendanceOverlay() {
        val capturing =
            readyToCapture() && !paused && !submitting.get() && !enrollmentHold
        val phase = when {
            !capturing -> ScanPhase.IDLE
            blinkDetector.blinked -> ScanPhase.BLINK
            frames.size >= requiredFrames -> ScanPhase.BLINK
            frames.isNotEmpty() -> ScanPhase.CAPTURING
            else -> ScanPhase.IDLE
        }
        val required = if (frames.size >= requiredFrames && livenessRequired && !blinkDetector.blinked) 1 else requiredFrames
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

    /**
     * Keep photos only on the frames the server will actually look at.
     *
     * A punch could carry up to ATTENDANCE_MAX_FRAMES (18) frames and EVERY one
     * carried its own JPEG, against a 2 MB JSON body limit on the server. Two
     * kiosks punching at once produced `request entity too large` — the punch
     * simply failed — and, when it fit, face-svc re-embedded all 18 photos with
     * ArcFace before the server used `bestFrames(good, 3)` and threw away
     * fifteen of them. That is where the delay came from: six times the network
     * payload and six times the server-side face work per punch, all discarded.
     *
     * PHOTO_FRAMES is deliberately larger than the 3 the server keeps. Ranking
     * here uses the same qualityScore the server ranks by, so its best 3 are a
     * subset of these; the margin covers frames face-svc rejects (422 no_face is
     * common) without falling back to the device embedding, which would fail the
     * enrolled-model check when the gallery is ArcFace.
     *
     * Embeddings stay on every frame — they are ~1 KB and are what matching and
     * liveness actually run on offline.
     */
    private fun trimPhotosToBest(batch: List<FaceFrame>): List<FaceFrame> {
        if (batch.size <= PHOTO_FRAMES) return batch
        val keep = batch.indices
            .sortedByDescending { batch[it].qualityScore ?: -1.0 }
            .take(PHOTO_FRAMES)
            .toSet()
        return batch.mapIndexed { i, f ->
            if (i in keep) f else f.copy(photoB64 = null)
        }
    }

    private fun submit() {
        if (!submitting.compareAndSet(false, true)) return
        val batch = trimPhotosToBest(frames.toList())
        // Blink detected via absolute-floor or a sharp drop from the open baseline.
        val livenessPassed = blinkDetector.blinked
        // Photos ride only on the frames the server can actually use — see
        // trimPhotosToBest. Every frame still carries its device embedding, so
        // the batch and its liveness signal are unchanged.
        val req = MarkAttendanceRequest(
            frames = batch,
            employeeCode = enteredCode,
            pin = enteredPin,
            photoB64 = batch.filter { it.photoB64 != null }
                .maxByOrNull { it.qualityScore ?: -1.0 }
                ?.photoB64,
            livenessPassed = livenessPassed,
            punchTime = Instant.now().toString(),
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
                showRejection(e.userMessage(this@FaceDeskAttendanceActivity, R.string.facedesk_not_recognized))
            } catch (e: Exception) {
                if (!offlineSyncEnabled || isFaceIdentified()) {
                    showRejection(getString(R.string.facedesk_network_error))
                } else if (offline.enqueue(req)) {
                    FaceDeskOfflineSyncWorker.enqueue(this@FaceDeskAttendanceActivity)
                    showOfflineSaved()
                } else {
                    showRejection(getString(R.string.facedesk_network_error))
                }
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
                autoReset(FaceKioskTuning.POST_PUNCH_HOLD_MS)
            }
            "RETRY" -> {
                tvResult.text = res.message
                voice.speakRes(R.string.facedesk_voice_not_recognized, minIntervalMs = 0)
                softReset(1500)
            }
            "REVIEW" -> {
                tvResult.text = res.message
                voice.speakRes(R.string.facedesk_voice_success_generic, minIntervalMs = 0)
                autoReset(FaceKioskTuning.POST_PUNCH_HOLD_MS)
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
        autoReset(FaceKioskTuning.POST_PUNCH_HOLD_MS)
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

    /**
     * Persist the server's identification mode, then open the gate it implies.
     *
     * onResume pauses capture and holds the screen on "Loading kiosk settings…"
     * until this lands, so every path out of here MUST reach promptPinEntry():
     * it is the only thing that clears paused, and it is what chooses the keypad
     * over going straight to the camera. An early return leaves the kiosk on the
     * loading title with the camera dead — no error, no way forward.
     *
     * That includes a blank mode. The response field is nullable, and a kiosk
     * that hears nothing is better off running the mode it already had than
     * stranding the queue.
     */
    private fun applyServerIdentificationMode(serverMode: String?) {
        if (!serverMode.isNullOrBlank()) {
            config.faceDeskIdentificationMode = serverMode
        }
        runOnUiThread {
            if (isFinishing || isDestroyed) return@runOnUiThread
            promptPinEntry()
        }
    }

    private fun refreshDeviceConfig() {
        configFetchJob?.cancel()
        configFetchJob = lifecycleScope.launch {
            try {
                val cfg = api.fetchConfig()
                FaceKioskTuning.applyFrom(cfg.captureTuning)
                livenessRequired = cfg.livenessRequired ?: true
                offlineSyncEnabled = cfg.offlineSyncEnabled ?: true
                val frameCount = cfg.frameCaptureCount ?: FaceKioskTuning.ATTENDANCE_REQUIRED_FRAMES
                requiredFrames = frameCount.coerceIn(3, 30)
                maxFrames = (requiredFrames * 3).coerceAtMost(60)
                if (cfg.identificationMode == "BIOMETRIC_ONLY") {
                    paused = true
                    runOnUiThread {
                        if (isFinishing || isDestroyed) return@runOnUiThread
                        tvTitle.text = getString(R.string.facedesk_biometric_only_hint)
                        tvResult.text = ""
                    }
                    return@launch
                }
                applyServerIdentificationMode(cfg.identificationMode)
                runOnUiThread { chrome.bindBranding(cfg.branding) }
            } catch (e: Exception) {
                Log.w(TAG, "config fetch failed: ${e.message}")
                runOnUiThread {
                    if (isFinishing || isDestroyed) return@runOnUiThread
                    tvTitle.text = getString(R.string.facedesk_look_at_camera)
                    promptPinEntry()
                }
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
        /**
         * How many frames carry a photo. Above the 3 the server keeps, to
         * absorb face-svc rejections; see trimPhotosToBest.
         */
        private const val PHOTO_FRAMES = 5
        private const val STALE_GAP_MS = FaceKioskTuning.ATTENDANCE_STALE_GAP_MS
        private const val TICKET_POLL_MS = 4_000L
        private const val TICKET_POLL_COOLDOWN_MS = 30_000L
        private const val MODEL = "mobilefacenet"
    }
}
