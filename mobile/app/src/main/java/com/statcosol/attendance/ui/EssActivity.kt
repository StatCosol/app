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
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.statcosol.attendance.AttendanceApp
import com.statcosol.attendance.R
import com.statcosol.attendance.api.RosterResponse
import com.statcosol.attendance.databinding.ActivityCameraBinding
import com.statcosol.attendance.db.QueuedPunch
import com.statcosol.attendance.face.RosterMatcher
import com.statcosol.attendance.sync.PunchSyncWorker
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
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
 * On user tap we:
 *   1. Acquire current location.
 *   2. Validate against the geofence from the roster response.
 *   3. Capture a face frame, run 1:1 verify against the bound employee's
 *      enrollment.
 *   4. Queue the punch.
 *
 * The camera capture pipeline reuses the same code as KIOSK; the activity
 * here intentionally focuses on the gating logic and leaves the actual frame
 * capture for the follow-up implementation pass.
 */
class EssActivity : AppCompatActivity() {

    private lateinit var binding: ActivityCameraBinding
    private val app get() = application as AttendanceApp
    private var matcher: RosterMatcher? = null
    private var roster: RosterResponse? = null

    private val locationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* state checked at submit */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityCameraBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val empId = app.deviceConfig.essEmployeeId
        if (empId.isNullOrBlank()) {
            binding.statusText.text = getString(R.string.ess_no_enrollment)
            return
        }
        binding.statusText.text = getString(R.string.ess_punch_in)

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED) {
            locationPermission.launch(Manifest.permission.ACCESS_FINE_LOCATION)
        }

        loadRoster(empId)

        binding.statusText.setOnClickListener { onPunchTap("AUTO") }
    }

    private fun loadRoster(empId: String) {
        lifecycleScope.launch {
            try {
                val r = withContext(Dispatchers.IO) { app.apiClient.fetchRoster() }
                roster = r
                matcher = RosterMatcher(r.enrollments)
            } catch (e: Exception) {
                binding.statusText.text = "Roster load failed: ${e.message}"
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun onPunchTap(direction: String) {
        val empId = app.deviceConfig.essEmployeeId ?: return
        val matcherSnap = matcher ?: return
        val r = roster ?: return

        lifecycleScope.launch {
            val location = try {
                fetchLocation()
            } catch (_: Exception) {
                Toast.makeText(this@EssActivity, R.string.permission_location_required, Toast.LENGTH_SHORT).show()
                return@launch
            }

            val withinFence = isWithinGeofence(location, r)
            if (!withinFence) {
                binding.statusText.text = getString(R.string.ess_outside_geofence)
                return@launch
            }

            // TODO: capture a face frame here using CameraX (mirroring KioskActivity),
            // then call matcherSnap.verify(probe, empId). Until that capture pipeline
            // is wired, queue with a placeholder match score so server quality gates
            // will reject — preventing accidental real punches in this scaffold.
            val match = matcherSnap.verify(FloatArray(192), empId, 0.78)
            val matchScore = match?.score ?: 0.0
            val liveness = 0.0

            val q = QueuedPunch(
                employeeId = empId,
                employeeCode = r.enrollments.firstOrNull { it.employeeId == empId }?.employeeCode ?: "",
                punchTimeIso = isoNow(),
                direction = direction,
                matchScore = matchScore,
                livenessScore = liveness,
                captureLat = location.latitude,
                captureLng = location.longitude,
                captureAccuracyM = location.accuracy.toDouble()
            )
            withContext(Dispatchers.IO) { app.database.punchDao().insert(q) }
            WorkManager.getInstance(this@EssActivity).enqueue(
                OneTimeWorkRequestBuilder<PunchSyncWorker>().build()
            )
            binding.statusText.text = "Queued"
        }
    }

    @SuppressLint("MissingPermission")
    private suspend fun fetchLocation(): Location = suspendCancellableCoroutine { cont ->
        val client = LocationServices.getFusedLocationProviderClient(this)
        client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
            .addOnSuccessListener { loc ->
                if (loc == null) cont.resume(Location("none"))
                else cont.resume(loc)
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
}
