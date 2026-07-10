package com.statcosol.attendance.facedesk

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.text.InputType
import android.util.Log
import android.widget.EditText
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
import com.statcosol.attendance.face.FaceCaptureSession
import com.statcosol.attendance.face.FaceDetector
import com.statcosol.attendance.face.FaceEmbedder
import com.statcosol.attendance.prefs.DeviceConfig
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
    private val submitting = AtomicBoolean(false)
    private var paused = false

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
                val analysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                val session = FaceCaptureSession(
                    embedder = embedder,
                    detector = detector,
                    onFace = { faceProbe, _, metrics, _ ->
                        onFrame(faceProbe, metrics.eyeOpenness)
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

    private fun onFrame(probe: FloatArray, eyeOpenness: Double) {
        if (paused || submitting.get()) return
        minEyeOpenness = minOf(minEyeOpenness, eyeOpenness)
        frames.add(FaceFrame(embeddingB64 = embedder.toBase64(probe), embeddingModel = MODEL))
        if (frames.size >= REQUIRED_FRAMES) submit()
    }

    private fun submit() {
        if (!submitting.compareAndSet(false, true)) return
        val batch = frames.toList()
        // Blink detected if eye-openness dipped low across the captured frames.
        val livenessPassed = minEyeOpenness < 0.35
        val req = MarkAttendanceRequest(
            frames = batch,
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
            runOnUiThread { tvResult.text = ""; tvTitle.text = getString(R.string.facedesk_look_at_camera) }
        }, delayMs)
    }

    /** Soft reset (retry/reject): keep scanning, just clear the buffer. */
    private fun softReset(delayMs: Long) {
        previewView.postDelayed({
            frames.clear(); minEyeOpenness = 1.0
            submitting.set(false)
            runOnUiThread { tvResult.text = "" }
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
                api.offlineSync(OfflineSyncRequest(pending))
                offline.clear()
                Log.i(TAG, "flushed ${pending.size} offline punches")
            } catch (e: Exception) {
                Log.w(TAG, "offline flush deferred: ${e.message}")
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
        detector.close()
    }

    companion object {
        private const val TAG = "FaceDeskAttendance"
        private const val REQUIRED_FRAMES = 10
        private const val MODEL = "mobilefacenet"
    }
}
