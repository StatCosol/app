package com.statcosol.attendance.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.ProgressBar
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
import com.statcosol.attendance.face.FaceCaptureSession
import com.statcosol.attendance.face.FaceDetector
import com.statcosol.attendance.face.FaceEmbedder
import com.statcosol.attendance.face.RosterMatcher
import com.statcosol.attendance.prefs.DeviceConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.sqrt

@ExperimentalGetImage
class EnrollActivity : AppCompatActivity() {

    private lateinit var previewView: PreviewView
    private lateinit var tvHint: TextView
    private lateinit var tvProgress: TextView
    private lateinit var btnStart: Button
    private lateinit var cbConsent: CheckBox
    private lateinit var progressBar: ProgressBar

    private lateinit var config: DeviceConfig
    private lateinit var apiClient: ApiClient
    private lateinit var embedder: FaceEmbedder
    private lateinit var faceDetector: FaceDetector
    private lateinit var cameraExecutor: ExecutorService

    private val capturedFrames = mutableListOf<FloatArray>()
    private var avgEmbedding: FloatArray? = null
    private var lastFrameMs = 0L
    private var capturing = false
    private var submitted = false

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_enroll)

        previewView = findViewById(R.id.previewView)
        previewView.implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        tvHint = findViewById(R.id.statusText)
        tvProgress = findViewById(R.id.progressText)
        btnStart = findViewById(R.id.captureBtn)
        cbConsent = findViewById(R.id.consentCheck)
        progressBar = ProgressBar(this).apply { visibility = View.GONE }

        config = DeviceConfig(this)
        apiClient = ApiClient(config)
        embedder = FaceEmbedder(this)
        faceDetector = FaceDetector()
        cameraExecutor = Executors.newSingleThreadExecutor()

        tvHint.text = getString(R.string.enroll_intro)
        tvProgress.text = getString(R.string.enroll_progress, 0, ESS_REQUIRED_FRAMES)

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startCamera()
        } else {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), CAMERA_REQUEST_CODE)
        }

        btnStart.setOnClickListener {
            if (!cbConsent.isChecked) {
                Toast.makeText(this, getString(R.string.enroll_consent_required), Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            startCapture()
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == CAMERA_REQUEST_CODE) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startCamera()
            } else {
                tvHint.text = getString(R.string.permission_camera_required)
                btnStart.isEnabled = false
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
        embedder.close()
        faceDetector.close()
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
                    onFace = { probe, metrics, photo -> handleFrame(probe, metrics.eyeOpenness, photo) },
                    onHint = { hint -> if (!capturing) runOnUiThread { tvHint.text = hint } },
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

    private fun startCapture() {
        capturedFrames.clear()
        avgEmbedding = null
        lastFrameMs = 0L
        capturing = true
        submitted = false
        btnStart.isEnabled = false
        cbConsent.isEnabled = false
        tvHint.text = getString(R.string.enroll_intro)
    }

    private fun handleFrame(probe: FloatArray, liveness: Double, photo: String?) {
        if (!capturing || submitted) return
        if (capturedFrames.size >= ESS_REQUIRED_FRAMES) return
        if (liveness < ENROLL_MIN_LIVENESS) return

        val now = System.currentTimeMillis()
        if (now - lastFrameMs < ENROLL_MIN_FRAME_INTERVAL_MS) return

        val avg = avgEmbedding
        if (avg != null) {
            val sim = cosineSim(probe, avg)
            if (sim < ENROLL_MIN_PROBE_TO_AVG_COS) {
                runOnUiThread { tvHint.text = getString(R.string.kiosk_enroll_inconsistent) }
                return
            }
        }

        capturedFrames.add(probe)
        lastFrameMs = now
        avgEmbedding = averageAndNormalize(capturedFrames)

        val count = capturedFrames.size
        runOnUiThread {
            tvProgress.text = getString(R.string.enroll_progress, count, ESS_REQUIRED_FRAMES)
        }

        if (capturedFrames.size >= ESS_REQUIRED_FRAMES) {
            capturing = false
            submitted = true
            submitEnrollment()
        }
    }

    private fun submitEnrollment() {
        val finalEmbedding = averageAndNormalize(capturedFrames)

        runOnUiThread {
            tvHint.text = getString(R.string.enroll_uploading)
            progressBar.visibility = View.VISIBLE
        }

        lifecycleScope.launch {
            try {
                val embeddingB64 = embedder.toBase64(finalEmbedding)
                apiClient.enrollSelf(embeddingB64).getOrThrow()
                runOnUiThread {
                    progressBar.visibility = View.GONE
                    tvHint.text = getString(R.string.enroll_success)
                    Toast.makeText(this@EnrollActivity, getString(R.string.enroll_success), Toast.LENGTH_LONG).show()
                }
                kotlinx.coroutines.delay(2000)
                finish()
            } catch (e: Exception) {
                Log.e(TAG, "Enrollment failed: ${e.message}")
                withContext(Dispatchers.Main) {
                    progressBar.visibility = View.GONE
                    tvHint.text = getString(R.string.enroll_failed, e.message ?: "unknown")
                    btnStart.isEnabled = true
                    cbConsent.isEnabled = true
                    capturing = false
                    submitted = false
                    capturedFrames.clear()
                    avgEmbedding = null
                }
            }
        }
    }

    companion object {
        private const val TAG = "EnrollActivity"
        private const val CAMERA_REQUEST_CODE = 1001
        private const val ESS_REQUIRED_FRAMES = 7
        private const val ENROLL_MIN_LIVENESS = 0.70
        private const val ENROLL_MIN_FRAME_INTERVAL_MS = 300L
        private const val ENROLL_MIN_PROBE_TO_AVG_COS = 0.78

        fun cosineSim(a: FloatArray, b: FloatArray): Double {
            var dot = 0.0; var normA = 0.0; var normB = 0.0
            val len = minOf(a.size, b.size)
            for (i in 0 until len) { dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i] }
            val denom = sqrt(normA) * sqrt(normB)
            return if (denom == 0.0) 0.0 else dot / denom
        }

        fun averageAndNormalize(frames: List<FloatArray>): FloatArray {
            if (frames.isEmpty()) return FloatArray(0)
            val size = frames[0].size
            val avg = FloatArray(size)
            for (frame in frames) for (i in 0 until size) avg[i] += frame[i]
            for (i in avg.indices) avg[i] = avg[i] / frames.size
            val norm = sqrt(avg.fold(0f) { acc, v -> acc + v * v })
            return if (norm > 0f) avg.map { it / norm }.toFloatArray() else avg
        }
    }
}
