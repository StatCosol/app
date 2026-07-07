package com.statcosol.attendance.facedesk

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
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
import com.statcosol.attendance.face.FaceCaptureSession
import com.statcosol.attendance.face.FaceDetector
import com.statcosol.attendance.face.FaceEmbedder
import com.statcosol.attendance.prefs.DeviceConfig
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

    private lateinit var employeeId: String
    private val frames = mutableListOf<FaceFrame>()
    private var minEyeOpenness = 1.0
    private val capturing = AtomicBoolean(false)
    private val saving = AtomicBoolean(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_facedesk_enrollment)
        previewView = findViewById(R.id.fdePreview)
        tvName = findViewById(R.id.fdeName)
        tvHint = findViewById(R.id.fdeHint)
        btnCapture = findViewById(R.id.fdeCapture)

        employeeId = intent.getStringExtra(EXTRA_EMPLOYEE_ID).orEmpty()
        val name = intent.getStringExtra(EXTRA_EMPLOYEE_NAME).orEmpty()
        if (employeeId.isBlank()) { finish(); return }
        tvName.text = name.ifBlank { employeeId }

        config = DeviceConfig(this)
        api = FaceDeskApiClient(config)
        embedder = FaceEmbedder(this)
        detector = FaceDetector()
        cameraExecutor = Executors.newSingleThreadExecutor()

        btnCapture.setOnClickListener { startCapture() }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), 1002)
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
                val analysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                val session = FaceCaptureSession(
                    embedder = embedder,
                    detector = detector,
                    onFace = { faceProbe, _, metrics, _ -> onFrame(faceProbe, metrics.eyeOpenness) },
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

    private fun startCapture() {
        if (saving.get()) return
        frames.clear(); minEyeOpenness = 1.0
        capturing.set(true)
        btnCapture.isEnabled = false
        tvHint.text = getString(R.string.facedesk_hold_still)
    }

    private fun onFrame(probe: FloatArray, eyeOpenness: Double) {
        if (!capturing.get()) return
        minEyeOpenness = minOf(minEyeOpenness, eyeOpenness)
        frames.add(FaceFrame(embeddingB64 = embedder.toBase64(probe), embeddingModel = MODEL))
        runOnUiThread { tvHint.text = "Capturing… ${frames.size}/$CAPTURE_FRAMES" }
        if (frames.size >= CAPTURE_FRAMES) {
            capturing.set(false)
            save()
        }
    }

    private fun save() {
        if (!saving.compareAndSet(false, true)) return
        val livenessPassed = minEyeOpenness < 0.35
        val req = SaveEnrollmentRequest(
            employeeId = employeeId,
            frames = frames.toList(),
            livenessPassed = livenessPassed,
            consentGiven = true,
        )
        runOnUiThread { tvHint.text = getString(R.string.facedesk_saving) }
        lifecycleScope.launch {
            try {
                val res = api.saveEnrollment(req)
                runOnUiThread { tvHint.text = res.message ?: getString(R.string.facedesk_enrolled) }
                previewView.postDelayed({ finish() }, 1500)
            } catch (e: FaceDeskApiException) {
                // 409 = duplicate/blocked; other 4xx = quality/liveness message.
                runOnUiThread {
                    tvHint.text = e.body.ifBlank { getString(R.string.facedesk_enroll_failed) }
                    btnCapture.isEnabled = true
                }
                saving.set(false)
            } catch (e: Exception) {
                runOnUiThread {
                    tvHint.text = getString(R.string.facedesk_enroll_offline)
                    btnCapture.isEnabled = true
                }
                saving.set(false)
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
        detector.close()
    }

    companion object {
        private const val TAG = "FaceDeskEnroll"
        private const val CAPTURE_FRAMES = 15
        private const val MODEL = "mobilefacenet"
        const val EXTRA_EMPLOYEE_ID = "employeeId"
        const val EXTRA_EMPLOYEE_NAME = "employeeName"
    }
}
