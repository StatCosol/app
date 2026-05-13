package com.statcosol.attendance.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.statcosol.attendance.AttendanceApp
import com.statcosol.attendance.R
import com.statcosol.attendance.databinding.ActivityCameraBinding
import com.statcosol.attendance.db.QueuedPunch
import com.statcosol.attendance.face.FaceCaptureSession
import com.statcosol.attendance.face.RosterMatcher
import com.statcosol.attendance.sync.PunchSyncWorker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
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
    private var matcher: RosterMatcher? = null
    private var capture: FaceCaptureSession? = null
    private var lastPunchAt: Long = 0

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
                val roster = withContext(Dispatchers.IO) { app.apiClient.fetchRoster() }
                matcher = RosterMatcher(roster.enrollments)
            } catch (e: Exception) {
                binding.statusText.text = "Roster load failed: ${e.message}"
            }
        }
    }

    private fun startCamera() {
        capture = FaceCaptureSession(
            context = this,
            owner = this,
            previewView = binding.previewView,
            scope = lifecycleScope,
        ) { probe, liveness ->
            handleFace(probe, liveness)
        }.also { it.start() }
    }

    private suspend fun handleFace(probe: FloatArray, liveness: Double) {
        val now = System.currentTimeMillis()
        val matcherSnap = matcher ?: return
        if (now - lastPunchAt < COOLDOWN_MS) return
        if (liveness < MIN_LIVENESS) return

        val match = matcherSnap.match(probe, MIN_MATCH) ?: run {
            runOnUiThread { binding.statusText.text = getString(R.string.kiosk_match_low) }
            return
        }
        lastPunchAt = now

        val q = QueuedPunch(
            employeeId = match.entry.employeeId,
            employeeCode = match.entry.employeeCode,
            punchTimeIso = isoNow(),
            direction = "AUTO",
            matchScore = match.score,
            livenessScore = liveness,
            captureLat = null,
            captureLng = null,
            captureAccuracyM = null
        )
        withContext(Dispatchers.IO) { app.database.punchDao().insert(q) }
        WorkManager.getInstance(this).enqueue(
            OneTimeWorkRequestBuilder<PunchSyncWorker>().build()
        )
        runOnUiThread {
            binding.statusText.text = getString(R.string.kiosk_punch_recorded, match.entry.displayName)
        }
    }

    private fun isoNow(): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(Date())
    }

    companion object {
        private const val MIN_MATCH = 0.78
        private const val MIN_LIVENESS = 0.5
        private const val COOLDOWN_MS = 8_000L  // don't double-punch the same person
    }
}
