package com.statcosol.attendance.facedesk

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.text.InputType
import android.util.Log
import android.util.Size
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
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
import com.statcosol.attendance.face.FaceCaptureSession
import com.statcosol.attendance.face.FaceDetector
import com.statcosol.attendance.face.FaceEmbedder
import com.statcosol.attendance.prefs.DeviceConfig
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
    private lateinit var tvTitle: TextView
    private lateinit var tvResult: TextView

    private lateinit var config: DeviceConfig
    private lateinit var api: FaceDeskApiClient
    private lateinit var offline: FaceDeskOfflineStore
    private lateinit var embedder: FaceEmbedder
    private lateinit var detector: FaceDetector
    private lateinit var cameraExecutor: ExecutorService

    private val frames = mutableListOf<FaceFrame>()
    private var minEyeOpenness = 1.0
    private var lastFrameAtMs = 0L
    private val submitting = AtomicBoolean(false)
    private var paused = false

    // PIN_THEN_FACE: the employee declares identity (code + PIN) before the
    // camera captures, so the face is verified 1:1 against just that person.
    private var enteredCode: String? = null
    private var enteredPin: String? = null
    private var pinDialog: AlertDialog? = null

    // Web-initiated enrollment: while a ticket is open for this device,
    // attendance is held and the enrollment screen is launched for it.
    private var enrollmentHold = false
    private var ticketPollJob: Job? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_facedesk_attendance)
        previewView = findViewById(R.id.fdPreview)
        tvTitle = findViewById(R.id.fdTitle)
        tvResult = findViewById(R.id.fdResult)

        config = DeviceConfig(this)
        api = FaceDeskApiClient(config)
        offline = FaceDeskOfflineStore(this)
        embedder = FaceEmbedder(this)
        detector = FaceDetector()
        cameraExecutor = Executors.newSingleThreadExecutor()

        // Admin-gated switch to enrollment: long-press the title, enter the PIN.
        // Keeps one device usable for both without ever mixing the two screens.
        tvTitle.setOnLongClickListener { promptEnrollmentUnlock(); true }

        flushOfflineQueue()

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), 1001)
        } else {
            startCamera()
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
                    .setResolutionSelector(HD_ANALYSIS_RESOLUTION)
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                val session = FaceCaptureSession(
                    embedder = embedder,
                    detector = detector,
                    computeFullFrameProbe = false,
                    onFace = { faceProbe, _, metrics, photo ->
                        onFrame(faceProbe, metrics.eyeOpenness, photo)
                    },
                    onHint = { hint ->
                        if (!paused && frames.isEmpty()) runOnUiThread { tvTitle.text = hint }
                    },
                )
                analysis.setAnalyzer(cameraExecutor, session)
                provider.unbindAll()
                provider.bindToLifecycle(
                    this, CameraSelector.DEFAULT_FRONT_CAMERA, preview, analysis,
                )
            } catch (e: Exception) {
                Log.e(TAG, "camera start failed", e)
                tvTitle.text = getString(R.string.facedesk_camera_failed)
            }
        }, ContextCompat.getMainExecutor(this))
    }

    override fun onResume() {
        super.onResume()
        // Returned from enrollment (or first shown) — release the hold, discard
        // any stale buffer, and (re)start ticket polling.
        enrollmentHold = false
        frames.clear(); minEyeOpenness = 1.0
        submitting.set(false); paused = false
        enteredCode = null; enteredPin = null
        runOnUiThread {
            tvResult.text = ""
            tvTitle.text = getString(R.string.facedesk_look_at_camera)
        }
        startTicketPolling()
        promptPinEntry()
    }

    /**
     * PIN_THEN_FACE: block face capture until the employee enters code + PIN.
     * The dialog is non-cancelable so the kiosk always has a claimed identity
     * before the camera is used.
     */
    private fun promptPinEntry() {
        if (pinDialog?.isShowing == true) return
        paused = true
        frames.clear(); minEyeOpenness = 1.0
        val codeInput = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT
            hint = getString(R.string.facedesk_pin_code_hint)
        }
        val pinInput = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            hint = getString(R.string.facedesk_pin_hint)
        }
        val layout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            val pad = (16 * resources.displayMetrics.density).toInt()
            setPadding(pad, pad, pad, 0)
            addView(codeInput)
            addView(pinInput)
        }
        pinDialog?.dismiss()
        pinDialog = AlertDialog.Builder(this)
            .setTitle(R.string.facedesk_pin_entry_title)
            .setView(layout)
            .setCancelable(false)
            .setPositiveButton(android.R.string.ok) { _, _ ->
                pinDialog = null
                val code = codeInput.text.toString().trim()
                val pin = pinInput.text.toString().trim()
                if (code.isEmpty() || pin.isEmpty()) {
                    promptPinEntry()
                } else {
                    enteredCode = code
                    enteredPin = pin
                    paused = false
                    runOnUiThread {
                        tvResult.text = ""
                        tvTitle.text = getString(R.string.facedesk_look_at_camera)
                    }
                }
            }
            .show()
    }

    override fun onPause() {
        super.onPause()
        ticketPollJob?.cancel()
    }

    /** Poll for a web-initiated enrollment ticket; hold attendance + open enroll. */
    private fun startTicketPolling() {
        ticketPollJob?.cancel()
        ticketPollJob = lifecycleScope.launch {
            while (isActive) {
                try {
                    if (!enrollmentHold) {
                        val ticket = api.pendingTicket()
                        if (ticket != null) {
                            enrollmentHold = true
                            // Drop any frames buffered before the hold so a
                            // post-enrollment batch can't mix stale embeddings.
                            frames.clear(); minEyeOpenness = 1.0
                            submitting.set(false)
                            runOnUiThread {
                                tvTitle.text = getString(R.string.facedesk_enroll_in_progress)
                                tvResult.text = ticket.employeeName ?: ""
                            }
                            startActivity(
                                Intent(this@FaceDeskAttendanceActivity, FaceDeskEnrollmentActivity::class.java).apply {
                                    putExtra(FaceDeskEnrollmentActivity.EXTRA_EMPLOYEE_ID, ticket.employeeId)
                                    putExtra(FaceDeskEnrollmentActivity.EXTRA_EMPLOYEE_NAME, ticket.employeeName)
                                    putExtra(FaceDeskEnrollmentActivity.EXTRA_TICKET_ID, ticket.ticketId)
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

    private fun onFrame(probe: FloatArray, eyeOpenness: Double, photo: String?) {
        if (paused || submitting.get() || enrollmentHold) return
        // Never capture until the employee has entered code + PIN.
        if (enteredCode == null || enteredPin == null) return

        // A long gap between accepted frames means the previous person walked
        // away mid-capture — drop their frames so batches never mix people.
        val now = android.os.SystemClock.elapsedRealtime()
        if (frames.isNotEmpty() && now - lastFrameAtMs > STALE_GAP_MS) {
            frames.clear()
            minEyeOpenness = 1.0
        }
        lastFrameAtMs = now

        minEyeOpenness = minOf(minEyeOpenness, eyeOpenness)
        frames.add(
            FaceFrame(
                embeddingB64 = embedder.toBase64(probe),
                embeddingModel = MODEL,
                photoB64 = photo,
            ),
        )

        val blinked = minEyeOpenness < BLINK_THRESHOLD
        when {
            // Enough frames + a blink seen → submit with liveness proven.
            frames.size >= REQUIRED_FRAMES && blinked -> submit()
            // Enough frames but no blink yet — prompt and keep sampling
            // instead of submitting a batch the server will reject.
            frames.size >= MAX_FRAMES -> submit()
            frames.size >= REQUIRED_FRAMES ->
                runOnUiThread { tvTitle.text = getString(R.string.facedesk_blink_now) }
        }
    }

    private fun submit() {
        if (!submitting.compareAndSet(false, true)) return
        val batch = frames.toList()
        // Blink detected if eye-openness dipped low across the captured frames.
        val livenessPassed = minEyeOpenness < 0.35
        val req = MarkAttendanceRequest(
            frames = batch,
            employeeCode = enteredCode,
            pin = enteredPin,
            livenessPassed = livenessPassed,
            offlineRef = UUID.randomUUID().toString(),
        )
        lifecycleScope.launch {
            try {
                val res = api.markAttendance(req)
                showResult(res)
            } catch (e: FaceDeskApiException) {
                // Genuine rejection (4xx with a message) — show it, don't queue.
                showRejection(e.message ?: getString(R.string.facedesk_not_recognized))
            } catch (e: Exception) {
                // Network/offline — queue and confirm.
                offline.enqueue(req)
                showOfflineSaved()
            }
        }
    }

    private fun showResult(res: MarkAttendanceResponse) {
        when (res.status) {
            "MARKED" -> {
                tvResult.text = buildString {
                    append("✓ ${res.message}\n")
                    res.employeeName?.let { append("$it (${res.employeeCode})\n") }
                    res.punchType?.let { append("$it  ") }
                    res.punchTime?.let { append(it.substring(11, 16)) }
                }
                autoReset(3000)
            }
            "RETRY" -> { tvResult.text = res.message; softReset(1500) }
            "REVIEW" -> { tvResult.text = res.message; autoReset(3000) }
            else -> showRejection(res.message)
        }
    }

    private fun showRejection(msg: String) {
        runOnUiThread { tvResult.text = msg }
        softReset(2000)
    }

    private fun showOfflineSaved() {
        runOnUiThread { tvResult.text = getString(R.string.facedesk_offline_saved) }
        autoReset(2500)
    }

    /** Full reset after a completed punch: clear result and resume scanning. */
    private fun autoReset(delayMs: Long) {
        paused = true
        previewView.postDelayed({
            frames.clear(); minEyeOpenness = 1.0
            submitting.set(false); paused = false
            // A completed punch ends this person's session — require the next
            // employee to enter their own code + PIN.
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
            frames.clear(); minEyeOpenness = 1.0
            submitting.set(false)
            runOnUiThread { tvResult.text = "" }
            runOnUiThread { promptPinEntry() }
        }, delayMs)
    }

    /** PIN gate → open the enrollment picker (admin action). */
    private fun promptEnrollmentUnlock() {
        val config = DeviceConfig(this)
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            hint = getString(R.string.facedesk_admin_pin_hint)
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.facedesk_enroll_mode_title)
            .setMessage(R.string.facedesk_admin_pin_message)
            .setView(input)
            .setPositiveButton(android.R.string.ok) { _, _ ->
                if (input.text.toString() == config.faceDeskAdminPin) {
                    startActivity(Intent(this, FaceDeskEnrollPickerActivity::class.java))
                } else {
                    runOnUiThread { tvResult.text = getString(R.string.facedesk_wrong_pin) }
                    tvResult.postDelayed({ runOnUiThread { tvResult.text = "" } }, 1500)
                }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun flushOfflineQueue() {
        val pending = offline.peekAll()
        if (pending.isEmpty()) return
        lifecycleScope.launch {
            try {
                val res = api.offlineSync(OfflineSyncRequest(pending))
                // Only drop the queue when every punch was accepted. On partial
                // failure keep it and retry — already-synced punches dedupe on
                // (client, offlineRef), so no double-counting.
                if (res.failed == 0) {
                    offline.clear()
                    Log.i(TAG, "flushed ${pending.size} offline punches")
                } else {
                    Log.w(TAG, "offline sync partial: synced=${res.synced} failed=${res.failed}; keeping queue")
                }
            } catch (e: Exception) {
                Log.w(TAG, "offline flush deferred: ${e.message}")
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        pinDialog?.dismiss(); pinDialog = null
        cameraExecutor.shutdown()
        detector.close()
    }

    companion object {
        private const val TAG = "FaceDeskAttendance"
        private const val REQUIRED_FRAMES = 8
        // Hard cap: submit even without a blink and let the server decide —
        // it can hold the punch for review rather than silently dropping it.
        private const val MAX_FRAMES = 24
        private const val BLINK_THRESHOLD = 0.35
        private const val STALE_GAP_MS = 2_500L
        private const val TICKET_POLL_MS = 4_000L
        private const val MODEL = "mobilefacenet"

        // Prefer 720p analysis frames, falling back to the closest the camera
        // supports. Bigger frames = a larger, sharper face crop for the model.
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
    }
}
