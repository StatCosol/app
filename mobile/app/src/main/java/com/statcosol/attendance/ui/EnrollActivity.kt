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

    /** Wall-clock of the last accepted frame; used to enforce a minimum
     *  spacing between captures so we don't average 5 near-identical
     *  frames produced inside ~100 ms. */
    @Volatile private var lastAcceptedAtMs: Long = 0L
    /** Running unit-norm average of accepted embeddings. Each new candidate
     *  frame must be at least [MIN_PROBE_TO_AVG_COS] cosine-similar to this
     *  vector before we accept it, so a different face wandering into the
     *  view can't pollute the enrollment template. */
    private var runningAvg: FloatArray? = null

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

    override fun onDestroy() {
        capture?.stop()
        capture = null
        super.onDestroy()
    }

    private fun startCamera() {
        capture = FaceCaptureSession(
            context = this,
            owner = this,
            previewView = binding.previewView,
            scope = lifecycleScope,
            onFace = { probe, liveness, _ ->
                val p = pending ?: return@FaceCaptureSession
                if (p.isCompleted) return@FaceCaptureSession
                // Tighter liveness gate during enrollment so the template
                // is built from clearly-live frames only.
                if (liveness < MIN_LIVENESS) return@FaceCaptureSession
                // Temporal spacing: skip frames that arrive too quickly
                // after the previous accepted one (avoids 5 near-identical
                // copies of the same instant).
                val now = System.currentTimeMillis()
                if (now - lastAcceptedAtMs < MIN_FRAME_INTERVAL_MS) {
                    return@FaceCaptureSession
                }
                // Consistency gate: starting from the second frame, the
                // candidate must be cosine-similar to the running average.
                // Rejects bystanders who briefly enter the view.
                val avg = runningAvg
                if (avg != null) {
                    val cos = cosine(avg, probe)
                    if (cos < MIN_PROBE_TO_AVG_COS) return@FaceCaptureSession
                }
                lastAcceptedAtMs = now
                p.complete(probe)
            },
        ).also { it.start() }
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
        runningAvg = null
        lastAcceptedAtMs = 0L
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
                    runningAvg = averageAndNormalize(collected)
                    renderProgress()
                }

                // Final consistency check: every accepted frame must be
                // strongly similar to the averaged template. Any outlier
                // means a different face slipped in (e.g. the user
                // swapped places mid-capture) — better to fail and retry
                // than to enroll a polluted vector.
                val averaged = runningAvg ?: averageAndNormalize(collected)
                val minCos = collected.minOf { cosine(averaged, it) }
                if (minCos < MIN_PROBE_TO_AVG_COS) {
                    binding.statusText.text = getString(
                        R.string.enroll_failed,
                        "frames inconsistent (please retry, keeping the same face in view)",
                    )
                    return@launch
                }

                binding.statusText.text = getString(R.string.enroll_uploading)
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

    /** Plain cosine of two equal-length vectors; embeddings coming out of
     *  the embedder are already L2-normalised so this is a dot product
     *  in (-1, 1). */
    private fun cosine(a: FloatArray, b: FloatArray): Double {
        if (a.size != b.size) return 0.0
        var dot = 0.0
        for (i in a.indices) dot += a[i].toDouble() * b[i]
        return dot
    }

    companion object {
        private const val REQUIRED_FRAMES = 7
        private const val MIN_LIVENESS = 0.7
        private const val CAPTURE_TIMEOUT_MS = 8_000L
        /** Minimum wall-clock gap between accepted enrollment frames so
         *  the captured set covers a small window of expressions and
         *  micro-poses, not a single instant. */
        private const val MIN_FRAME_INTERVAL_MS = 250L
        /** Each new candidate (and the final accepted set) must have at
         *  least this cosine similarity to the running average. Tuned to
         *  reject a different face wandering into view while keeping
         *  natural micro-expression variance. */
        private const val MIN_PROBE_TO_AVG_COS = 0.78
    }
}
