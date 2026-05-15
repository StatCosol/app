package com.statcosol.attendance.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.animation.AnimationUtils
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.google.android.material.dialog.MaterialAlertDialogBuilder
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
 *
 * UX rules (see issue from on-site rollout):
 *   1. First match for an employee on this device today  -> immediate IN punch
 *      with a green-tick overlay ("Login recorded — name • HH:mm AM").
 *   2. Subsequent match for the same employee (after the cooldown) opens a
 *      confirmation dialog ("attendance already recorded, punch out?"). Only on
 *      explicit Yes do we queue an OUT punch and show "Logout recorded".
 *   3. Global 30 s cooldown between any two captures so the camera doesn't
 *      immediately re-capture the same face the moment a punch is recorded.
 */
class KioskActivity : AppCompatActivity() {

    private lateinit var binding: ActivityCameraBinding
    private val app get() = application as AttendanceApp
    private var matcher: RosterMatcher? = null
    private var capture: FaceCaptureSession? = null

    /** Last time ANY face was processed — used to throttle the camera. */
    private var lastPunchAt: Long = 0

    /** Per-employee punch state for the current local day (in-memory only). */
    private data class PunchState(val direction: String, val at: Long)
    private val todayPunches: MutableMap<String, PunchState> = mutableMapOf()
    private var todayKey: String = currentDayKey()

    /** True while the logout-confirmation dialog is on screen. */
    @Volatile private var dialogActive: Boolean = false

    private val mainHandler = Handler(Looper.getMainLooper())
    private val hideOverlayRunnable = Runnable {
        val overlay = binding.successOverlay
        if (overlay.visibility != View.VISIBLE) return@Runnable
        val card = binding.successCard
        val anim = AnimationUtils.loadAnimation(this, R.anim.kiosk_card_out)
        anim.setAnimationListener(object : android.view.animation.Animation.AnimationListener {
            override fun onAnimationStart(a: android.view.animation.Animation?) {}
            override fun onAnimationRepeat(a: android.view.animation.Animation?) {}
            override fun onAnimationEnd(a: android.view.animation.Animation?) {
                overlay.visibility = View.GONE
                binding.statusText.text = getString(R.string.kiosk_look_at_camera)
            }
        })
        card.startAnimation(anim)
    }

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

    override fun onDestroy() {
        mainHandler.removeCallbacks(hideOverlayRunnable)
        super.onDestroy()
    }

    private fun loadRoster() {
        lifecycleScope.launch {
            try {
                val roster = withContext(Dispatchers.IO) { app.apiClient.fetchRoster() }
                matcher = RosterMatcher(roster.enrollments)
                if (roster.enrollments.isEmpty()) {
                    binding.statusText.text = getString(R.string.roster_empty)
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
            onFace = { probe, liveness -> handleFace(probe, liveness) },
            onError = { code -> runOnUiThread { showCaptureError(code) } },
        ).also { it.start() }
    }

    private fun showCaptureError(code: String) {
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

    private suspend fun handleFace(probe: FloatArray, liveness: Double) {
        val now = System.currentTimeMillis()
        val matcherSnap = matcher ?: return
        if (dialogActive) return
        if (now - lastPunchAt < COOLDOWN_MS) return
        if (liveness < MIN_LIVENESS) return

        val match = matcherSnap.match(probe, MIN_MATCH) ?: run {
            runOnUiThread { binding.statusText.text = getString(R.string.kiosk_match_low) }
            return
        }

        // Roll the per-day map over at midnight.
        val day = currentDayKey()
        if (day != todayKey) {
            todayKey = day
            todayPunches.clear()
        }

        val empId = match.entry.employeeId
        val prev = todayPunches[empId]
        when {
            prev == null -> {
                // First time today on this device -> log them IN immediately.
                recordPunch(match, "IN", liveness)
            }
            prev.direction == "IN" -> {
                // Already punched in today — confirm before queuing OUT so accidental
                // looks at the camera don't log the user out.
                lastPunchAt = now  // still throttle so we don't spam the dialog
                runOnUiThread { showLogoutConfirmation(match, liveness) }
            }
            else -> {
                // Already punched out today -> just acknowledge, never queue
                // another OUT (which would otherwise overwrite the time).
                lastPunchAt = now
                runOnUiThread { showAlreadyDoneInfo(match) }
            }
        }
    }

    private fun showAlreadyDoneInfo(match: RosterMatcher.Match) {
        if (dialogActive) return
        dialogActive = true
        MaterialAlertDialogBuilder(this)
            .setIcon(R.drawable.ic_shield_check)
            .setTitle(R.string.kiosk_already_done_title)
            .setMessage(getString(R.string.kiosk_already_done_message, match.entry.displayName))
            .setCancelable(false)
            .setPositiveButton(R.string.kiosk_already_done_ok) { d, _ ->
                d.dismiss()
                dialogActive = false
                lastPunchAt = System.currentTimeMillis()
                binding.statusText.text = getString(R.string.kiosk_look_at_camera)
            }
            .show()
    }

    private fun showLogoutConfirmation(match: RosterMatcher.Match, liveness: Double) {
        if (dialogActive) return
        dialogActive = true
        MaterialAlertDialogBuilder(this)
            .setIcon(R.drawable.ic_shield_check)
            .setTitle(R.string.kiosk_logout_confirm_title)
            .setMessage(getString(R.string.kiosk_logout_confirm_message, match.entry.displayName))
            .setCancelable(false)
            .setPositiveButton(R.string.kiosk_logout_confirm_yes) { d, _ ->
                d.dismiss()
                dialogActive = false
                lastPunchAt = System.currentTimeMillis()
                lifecycleScope.launch { recordPunch(match, "OUT", liveness) }
            }
            .setNegativeButton(R.string.kiosk_logout_confirm_no) { d, _ ->
                d.dismiss()
                dialogActive = false
                // Reset cooldown so the dialog doesn't pop again immediately.
                lastPunchAt = System.currentTimeMillis()
                binding.statusText.text = getString(R.string.kiosk_look_at_camera)
            }
            .show()
    }

    private suspend fun recordPunch(match: RosterMatcher.Match, direction: String, liveness: Double) {
        val now = System.currentTimeMillis()
        lastPunchAt = now
        val q = QueuedPunch(
            employeeId = match.entry.employeeId,
            employeeCode = match.entry.employeeCode,
            punchTimeIso = isoNow(),
            direction = direction,
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
        todayPunches[match.entry.employeeId] = PunchState(direction, now)
        runOnUiThread { showPunchSuccess(match.entry.displayName, direction) }
    }

    private fun showPunchSuccess(name: String, direction: String) {
        val isOut = direction == "OUT"
        binding.successTitle.text = getString(
            if (isOut) R.string.kiosk_punch_out_title else R.string.kiosk_punch_in_title
        )
        binding.successName.text = name
        binding.successTime.text = getString(
            R.string.kiosk_time_format, formatLocalTime(), formatLocalDate()
        )
        binding.successBadge.setBackgroundResource(
            if (isOut) R.drawable.bg_badge_out else R.drawable.bg_badge_in
        )
        binding.successBadgeIcon.setImageResource(
            if (isOut) R.drawable.ic_logout_white else R.drawable.ic_check_white
        )
        binding.successBadgeChip.text = getString(
            if (isOut) R.string.kiosk_badge_out else R.string.kiosk_badge_in
        )
        binding.successOverlay.visibility = View.VISIBLE
        binding.successCard.startAnimation(
            AnimationUtils.loadAnimation(this, R.anim.kiosk_card_in)
        )
        binding.statusText.text = getString(R.string.kiosk_look_at_camera)
        mainHandler.removeCallbacks(hideOverlayRunnable)
        mainHandler.postDelayed(hideOverlayRunnable, OVERLAY_VISIBLE_MS)
    }

    private fun formatLocalDate(): String =
        SimpleDateFormat("dd MMM", Locale.getDefault()).format(Date())

    private fun isoNow(): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(Date())
    }

    private fun formatLocalTime(): String =
        SimpleDateFormat("hh:mm a", Locale.getDefault()).format(Date())

    private fun currentDayKey(): String =
        SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

    companion object {
        private const val MIN_MATCH = 0.70
        private const val MIN_LIVENESS = 0.5
        // Bumped from 8 s -> 30 s so the kiosk doesn't immediately re-capture
        // a person right after their punch is recorded (which previously felt
        // like an instant logout).
        private const val COOLDOWN_MS = 30_000L
        private const val OVERLAY_VISIBLE_MS = 4_000L
    }
}
