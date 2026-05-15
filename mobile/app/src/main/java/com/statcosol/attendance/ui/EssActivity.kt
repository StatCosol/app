package com.statcosol.attendance.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.location.Location
import android.os.Bundle
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.statcosol.attendance.AttendanceApp
import com.statcosol.attendance.R
import com.statcosol.attendance.api.RosterResponse
import com.statcosol.attendance.databinding.ActivityEssBinding
import com.statcosol.attendance.db.QueuedPunch
import com.statcosol.attendance.face.FaceCaptureSession
import com.statcosol.attendance.face.RosterMatcher
import com.statcosol.attendance.security.IntegrityCheck
import com.statcosol.attendance.sync.PunchSyncWorker
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Personal-phone ESS mode. Bound to a single employee at registration time.
 *
 * Per tap of Punch In / Out:
 *   1. Acquire current location.
 *   2. Validate against the geofence from the roster response.
 *   3. Capture the next valid face frame via [FaceCaptureSession].
 *   4. Run 1:1 verify against the bound employee's enrollment.
 *   5. Queue the punch.
 */
class EssActivity : AppCompatActivity() {

    private lateinit var binding: ActivityEssBinding
    private val app get() = application as AttendanceApp
    private var matcher: RosterMatcher? = null
    private var roster: RosterResponse? = null
    private var capture: FaceCaptureSession? = null

    /** Set non-null while a Punch tap is awaiting the next live face frame. */
    private var pending: CompletableDeferred<Pair<FloatArray, Double>>? = null

    private val cameraPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) startCamera() else binding.statusText.text = getString(R.string.permission_camera_required)
        }
    private val locationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* checked at submit */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityEssBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val empId = app.deviceConfig.essEmployeeId
        if (empId.isNullOrBlank()) {
            binding.statusText.text = getString(R.string.ess_no_enrollment)
            disableButtons()
            return
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED) {
            locationPermission.launch(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED) {
            startCamera()
        } else {
            cameraPermission.launch(Manifest.permission.CAMERA)
        }

        loadRoster()

        binding.punchInBtn.setOnClickListener { onPunchTap("IN") }
        binding.punchOutBtn.setOnClickListener { onPunchTap("OUT") }
    }

    private fun disableButtons() {
        binding.punchInBtn.isEnabled = false
        binding.punchOutBtn.isEnabled = false
    }

    private fun loadRoster() {
        lifecycleScope.launch {
            try {
                val r = withContext(Dispatchers.IO) { app.apiClient.fetchRoster() }
                roster = r
                matcher = RosterMatcher(r.enrollments)
                val empId = app.deviceConfig.essEmployeeId
                if (!empId.isNullOrBlank() && r.enrollments.none { it.employeeId == empId }) {
                    // No enrollment for the bound employee — launch self-enroll once.
                    startActivity(android.content.Intent(this@EssActivity, EnrollActivity::class.java))
                    finish()
                }
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
            onFace = { probe, liveness ->
                // Only consume frames while a punch is pending.
                pending?.let { p ->
                    if (!p.isCompleted && liveness >= MIN_LIVENESS) {
                        p.complete(probe to liveness)
                    }
                }
            },
            onError = { code ->
                runOnUiThread {
                    binding.statusText.text = when {
                        code == "face_model_missing" -> getString(R.string.face_model_missing)
                        code.startsWith("face_embed_failed") -> getString(R.string.face_embed_failed, code.substringAfter(':'))
                        code.startsWith("multiple_faces") -> {
                            val n = code.substringAfter(':').toIntOrNull() ?: 2
                            getString(R.string.face_multiple_detected, n)
                        }
                        else -> code
                    }
                }
            },
        ).also { it.start() }
    }

    @SuppressLint("MissingPermission")
    private fun onPunchTap(direction: String) {
        val empId = app.deviceConfig.essEmployeeId ?: return
        val matcherSnap = matcher ?: run {
            binding.statusText.text = "Roster not loaded yet"
            return
        }
        val r = roster ?: return

        binding.punchInBtn.isEnabled = false
        binding.punchOutBtn.isEnabled = false
        binding.statusText.text = "Locating…"

        lifecycleScope.launch {
            try {
                val location = try {
                    fetchLocation()
                } catch (_: Exception) {
                    Toast.makeText(this@EssActivity, R.string.permission_location_required, Toast.LENGTH_SHORT).show()
                    return@launch
                }
                if (!isWithinGeofence(location, r)) {
                    binding.statusText.text = getString(R.string.ess_outside_geofence)
                    return@launch
                }
                if (IntegrityCheck.isMockLocation(location)) {
                    binding.statusText.text = getString(R.string.ess_mock_location_blocked)
                    return@launch
                }

                binding.statusText.text = "Look at the camera…"
                val deferred = CompletableDeferred<Pair<FloatArray, Double>>()
                pending = deferred
                val captured = withTimeoutOrNull(CAPTURE_TIMEOUT_MS) { deferred.await() }
                pending = null
                if (captured == null) {
                    binding.statusText.text = "No face captured — try again"
                    return@launch
                }
                val (probe, liveness) = captured

                val match = matcherSnap.verify(probe, empId, MIN_MATCH)
                if (match == null) {
                    binding.statusText.text = "Face did not match — try again"
                    return@launch
                }

                val empCode = r.enrollments.firstOrNull { it.employeeId == empId }?.employeeCode ?: ""
                val q = QueuedPunch(
                    employeeId = empId,
                    employeeCode = empCode,
                    punchTimeIso = isoNow(),
                    direction = direction,
                    matchScore = match.score,
                    livenessScore = liveness,
                    captureLat = location.latitude,
                    captureLng = location.longitude,
                    captureAccuracyM = location.accuracy.toDouble()
                )
                withContext(Dispatchers.IO) { app.database.punchDao().insert(q) }
                WorkManager.getInstance(this@EssActivity).enqueue(
                    OneTimeWorkRequestBuilder<PunchSyncWorker>().build()
                )
                binding.statusText.text = "Punch queued ($direction)"
            } finally {
                binding.punchInBtn.isEnabled = true
                binding.punchOutBtn.isEnabled = true
            }
        }
    }

    @SuppressLint("MissingPermission")
    private suspend fun fetchLocation(): Location = suspendCancellableCoroutine { cont ->
        val client = LocationServices.getFusedLocationProviderClient(this)
        client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
            .addOnSuccessListener { loc ->
                cont.resume(loc ?: Location("none"))
            }
            .addOnFailureListener { cont.resume(Location("none")) }
    }

    private fun isWithinGeofence(loc: Location, r: RosterResponse): Boolean {
        val lat = r.geofenceLat ?: return true
        val lng = r.geofenceLng ?: return true
        val rad = r.geofenceRadiusM ?: return true
        return haversineMeters(loc.latitude, loc.longitude, lat, lng) <= rad
    }

    private fun haversineMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val r = 6371000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2) * sin(dLat / 2) +
                cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
                sin(dLon / 2) * sin(dLon / 2)
        return 2 * r * atan2(sqrt(a), sqrt(1 - a))
    }

    private fun isoNow(): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(Date())
    }

    companion object {
        private const val MIN_MATCH = 0.78
        private const val MIN_LIVENESS = 0.5
        private const val CAPTURE_TIMEOUT_MS = 10_000L
    }
}
