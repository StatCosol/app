package com.statcosol.attendance.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Base64
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.statcosol.attendance.AttendanceApp
import com.statcosol.attendance.R
import com.statcosol.attendance.api.EnrollSelfBody
import com.statcosol.attendance.databinding.ActivityEnrollBinding
import com.statcosol.attendance.face.FaceCaptureSession
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.sqrt

/**
 * One-time face self-enrollment for ESS-bound personal phones.
 *
 * Flow:
 *   1. User checks consent.
 *   2. Tap Start Enrollment — captures REQUIRED_FRAMES live frames.
 *   3. Average the embeddings, re-L2-normalize, encode Float32-LE → base64.
 *   4. POST to /mobile-attendance/enroll-self with X-Device-Token.
 *   5. On success → launch EssActivity and finish.
 */
class EnrollActivity : AppCompatActivity() {

    private lateinit var binding: ActivityEnrollBinding
    private val app get() = application as AttendanceApp

    private var capture: FaceCaptureSession? = null
    private val collected = mutableListOf<FloatArray>()
    private var pending: CompletableDeferred<FloatArray>? = null
    private var enrolling = false

    private val cameraPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) startCamera()
            else binding.statusText.text = getString(R.string.permission_camera_required)
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityEnrollBinding.inflate(layoutInflater)
        setContentView(binding.root)

        renderProgress()

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED) {
            startCamera()
        } else {
            cameraPermission.launch(Manifest.permission.CAMERA)
        }

        binding.captureBtn.setOnClickListener { startEnrollment() }
    }

    private fun startCamera() {
        capture = FaceCaptureSession(
            context = this,
            owner = this,
            previewView = binding.previewView,
            scope = lifecycleScope,
        ) { probe, liveness ->
            pending?.let { p ->
                if (!p.isCompleted && liveness >= MIN_LIVENESS) {
                    p.complete(probe)
                }
            }
        }.also { it.start() }
    }

    private fun startEnrollment() {
        if (enrolling) return
        if (!binding.consentCheck.isChecked) {
            Toast.makeText(this, R.string.enroll_consent_required, Toast.LENGTH_SHORT).show()
            return
        }
        enrolling = true
        binding.captureBtn.isEnabled = false
        collected.clear()
        renderProgress()

        lifecycleScope.launch {
            try {
                while (collected.size < REQUIRED_FRAMES) {
                    val deferred = CompletableDeferred<FloatArray>()
                    pending = deferred
                    val frame = withTimeoutOrNull(CAPTURE_TIMEOUT_MS) { deferred.await() }
                    pending = null
                    if (frame == null) {
                        binding.statusText.text = getString(R.string.enroll_failed, "no face captured")
                        return@launch
                    }
                    collected += frame
                    renderProgress()
                }

                binding.statusText.text = getString(R.string.enroll_uploading)
                val averaged = averageAndNormalize(collected)
                val b64 = floatArrayToBase64(averaged)
                val resp = withContext(Dispatchers.IO) {
                    app.apiClient.enrollSelf(EnrollSelfBody(embeddingBase64 = b64))
                }
                if (resp.ok) {
                    binding.statusText.text = getString(R.string.enroll_success)
                    startActivity(Intent(this@EnrollActivity, EssActivity::class.java))
                    finish()
                } else {
                    binding.statusText.text =
                        getString(R.string.enroll_failed, resp.message ?: "server rejected")
                }
            } catch (e: Exception) {
                binding.statusText.text = getString(R.string.enroll_failed, e.message ?: "unknown")
            } finally {
                enrolling = false
                binding.captureBtn.isEnabled = true
            }
        }
    }

    private fun renderProgress() {
        binding.progressText.text =
            getString(R.string.enroll_progress, collected.size, REQUIRED_FRAMES)
    }

    private fun averageAndNormalize(frames: List<FloatArray>): FloatArray {
        require(frames.isNotEmpty())
        val dim = frames[0].size
        val sum = FloatArray(dim)
        for (f in frames) for (i in 0 until dim) sum[i] += f[i]
        for (i in 0 until dim) sum[i] /= frames.size.toFloat()
        var norm = 0.0
        for (v in sum) norm += v.toDouble() * v
        norm = sqrt(norm).coerceAtLeast(1e-12)
        for (i in 0 until dim) sum[i] = (sum[i] / norm).toFloat()
        return sum
    }

    private fun floatArrayToBase64(arr: FloatArray): String {
        val bb = ByteBuffer.allocate(arr.size * 4).order(ByteOrder.LITTLE_ENDIAN)
        for (v in arr) bb.putFloat(v)
        return Base64.encodeToString(bb.array(), Base64.NO_WRAP)
    }

    companion object {
        private const val REQUIRED_FRAMES = 5
        private const val MIN_LIVENESS = 0.5
        private const val CAPTURE_TIMEOUT_MS = 15_000L
    }
}
