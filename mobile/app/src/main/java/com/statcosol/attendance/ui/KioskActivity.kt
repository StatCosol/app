package com.statcosol.attendance.ui

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Matrix
import android.os.Bundle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.statcosol.attendance.AttendanceApp
import com.statcosol.attendance.R
import com.statcosol.attendance.api.RosterResponse
import com.statcosol.attendance.databinding.ActivityCameraBinding
import com.statcosol.attendance.db.QueuedPunch
import com.statcosol.attendance.face.FaceDetector
import com.statcosol.attendance.face.FaceEmbedder
import com.statcosol.attendance.face.RosterMatcher
import com.statcosol.attendance.sync.PunchSyncWorker
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Shared-tablet KIOSK mode. Camera runs continuously; whenever a face passes
 * quality + liveness gates we 1:N match against the cached roster and queue a
 * punch.
 */
class KioskActivity : AppCompatActivity() {

    private lateinit var binding: ActivityCameraBinding
    private val app get() = application as AttendanceApp
    private val faceDetector = FaceDetector()
    private var matcher: RosterMatcher? = null
    private var rosterMode: String? = null
    private var lastPunchAt: Long = 0
    private val analysisLock = Mutex()

    private val cameraPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) startCamera() else binding.statusText.text = getString(R.string.permission_camera_required)
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityCameraBinding.inflate(layoutInflater)
        setContentView(binding.root)

        loadRoster()

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED) {
            startCamera()
        } else {
            cameraPermission.launch(Manifest.permission.CAMERA)
        }
    }

    private fun loadRoster() {
        lifecycleScope.launch {
            try {
                val roster: RosterResponse = withContext(Dispatchers.IO) { app.apiClient.fetchRoster() }
                rosterMode = roster.mode
                matcher = RosterMatcher(roster.enrollments)
            } catch (e: Exception) {
                binding.statusText.text = "Roster load failed: ${e.message}"
            }
        }
    }

    private fun startCamera() {
        val provider = ProcessCameraProvider.getInstance(this)
        provider.addListener({
            val cameraProvider = provider.get()
            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(binding.previewView.surfaceProvider)
            }
            val analyzer = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
            analyzer.setAnalyzer(ContextCompat.getMainExecutor(this)) { proxy ->
                handleFrame(proxy)
            }
            cameraProvider.unbindAll()
            cameraProvider.bindToLifecycle(
                this, CameraSelector.DEFAULT_FRONT_CAMERA, preview, analyzer
            )
        }, ContextCompat.getMainExecutor(this))
    }

    private fun handleFrame(proxy: ImageProxy) {
        val now = System.currentTimeMillis()
        val matcherSnap = matcher
        if (matcherSnap == null || now - lastPunchAt < COOLDOWN_MS) {
            proxy.close()
            return
        }
        val rotation = proxy.imageInfo.rotationDegrees
        val bitmap = proxy.toBitmap().rotated(rotation)
        proxy.close()

        lifecycleScope.launch {
            if (!analysisLock.tryLock()) return@launch
            try {
                val detection = faceDetector.detectLargest(bitmap, rotationDegrees = 0) ?: return@launch
                if (detection.livenessScore < MIN_LIVENESS) return@launch
                // TODO: replace with real MobileFaceNet once asset is shipped.
                val embedding = try {
                    com.statcosol.attendance.face.FaceEmbedder(this@KioskActivity).embed(detection.crop)
                } catch (_: Exception) {
                    return@launch
                }
                val match = matcherSnap.match(embedding, MIN_MATCH) ?: run {
                    runOnUiThread {
                        binding.statusText.text = getString(R.string.kiosk_match_low)
                    }
                    return@launch
                }
                lastPunchAt = now
                queuePunch(match.entry.employeeId, match.entry.employeeCode, match.score, detection.livenessScore)
                runOnUiThread {
                    binding.statusText.text =
                        getString(R.string.kiosk_punch_recorded, match.entry.displayName)
                }
            } finally {
                analysisLock.unlock()
            }
        }
    }

    private suspend fun queuePunch(empId: String, empCode: String, matchScore: Double, liveness: Double) {
        val q = QueuedPunch(
            employeeId = empId,
            employeeCode = empCode,
            punchTimeIso = isoNow(),
            direction = "AUTO",
            matchScore = matchScore,
            livenessScore = liveness,
            captureLat = null,
            captureLng = null,
            captureAccuracyM = null
        )
        withContext(Dispatchers.IO) { app.database.punchDao().insert(q) }
        WorkManager.getInstance(this).enqueue(
            OneTimeWorkRequestBuilder<PunchSyncWorker>().build()
        )
    }

    private fun isoNow(): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(Date())
    }

    private fun ImageProxy.toBitmap(): Bitmap {
        val nv21 = yuv420ToNv21(this)
        val yuv = android.graphics.YuvImage(nv21, android.graphics.ImageFormat.NV21, width, height, null)
        val out = ByteArrayOutputStream()
        yuv.compressToJpeg(android.graphics.Rect(0, 0, width, height), 90, out)
        val bytes = out.toByteArray()
        return android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    }

    private fun Bitmap.rotated(deg: Int): Bitmap {
        if (deg == 0) return this
        val m = Matrix().apply { postRotate(deg.toFloat()) }
        return Bitmap.createBitmap(this, 0, 0, width, height, m, true)
    }

    private fun yuv420ToNv21(image: ImageProxy): ByteArray {
        val yBuffer: ByteBuffer = image.planes[0].buffer
        val uBuffer: ByteBuffer = image.planes[1].buffer
        val vBuffer: ByteBuffer = image.planes[2].buffer
        val ySize = yBuffer.remaining()
        val uSize = uBuffer.remaining()
        val vSize = vBuffer.remaining()
        val nv21 = ByteArray(ySize + uSize + vSize)
        yBuffer.get(nv21, 0, ySize)
        vBuffer.get(nv21, ySize, vSize)
        uBuffer.get(nv21, ySize + vSize, uSize)
        return nv21
    }

    companion object {
        private const val MIN_MATCH = 0.78
        private const val MIN_LIVENESS = 0.5
        private const val COOLDOWN_MS = 8_000L  // don't double-punch the same person
    }
}
