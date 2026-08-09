package com.statcosol.attendance.ui

import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.animation.AnimationUtils
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.statcosol.attendance.R
import com.statcosol.attendance.facedesk.FaceDeskKioskBranding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * Shared kiosk chrome: header clock/branch labels, client logo, and the branded
 * punch-success overlay used by FaceDesk attendance/enrollment screens.
 */
class KioskChrome(
    private val activity: AppCompatActivity,
    private val apiBase: String,
) {
    private val handler = Handler(Looper.getMainLooper())
    private var clockRunnable: Runnable? = null

    private val headerStrip: View? = activity.findViewById(R.id.headerStrip)
    private val headerClientLogo: ImageView? = activity.findViewById(R.id.headerClientLogo)
    private val headerBrandIcon: ImageView? = activity.findViewById(R.id.headerBrandIcon)
    private val headerBrand: TextView? = activity.findViewById(R.id.headerBrand)
    private val headerBranch: TextView? = activity.findViewById(R.id.headerBranch)
    private val headerClock: TextView? = activity.findViewById(R.id.headerClock)
    private val headerDate: TextView? = activity.findViewById(R.id.headerDate)

    private val successOverlay: FrameLayout? = activity.findViewById(R.id.successOverlay)
    private val successCard: LinearLayout? = activity.findViewById(R.id.successCard)
    private val successTitle: TextView? = activity.findViewById(R.id.successTitle)
    private val successName: TextView? = activity.findViewById(R.id.successName)
    private val successTime: TextView? = activity.findViewById(R.id.successTime)
    private val successBadge: ImageView? = activity.findViewById(R.id.successBadge)
    private val successBadgeIcon: ImageView? = activity.findViewById(R.id.successBadgeIcon)
    private val successBadgeChip: TextView? = activity.findViewById(R.id.successBadgeChip)

    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    fun bindBranding(branding: FaceDeskKioskBranding?) {
        if (branding == null) return
        headerBrand?.text = branding.clientName?.takeIf { it.isNotBlank() }
            ?: activity.getString(R.string.brand_name)
        headerBranch?.text = formatSubtitle(branding)
        branding.clientLogoUrl?.takeIf { it.isNotBlank() }?.let { path ->
            loadClientLogo(path)
        }
    }

    fun startClock() {
        if (headerClock == null || headerDate == null) return
        clockRunnable?.let { handler.removeCallbacks(it) }
        val tick = object : Runnable {
            override fun run() {
                headerClock.text =
                    SimpleDateFormat("hh:mm a", Locale.getDefault()).format(Date())
                headerDate.text =
                    SimpleDateFormat("EEE, dd MMM", Locale.getDefault()).format(Date())
                handler.postDelayed(this, 30_000L)
            }
        }
        clockRunnable = tick
        tick.run()
    }

    fun stopClock() {
        clockRunnable?.let { handler.removeCallbacks(it) }
        clockRunnable = null
    }

    fun showSuccess(name: String, punchType: String?, onHidden: () -> Unit) {
        if (successOverlay == null) {
            onHidden()
            return
        }
        val isOut = punchType.equals("OUT", ignoreCase = true)
        successTitle?.text = activity.getString(
            if (isOut) R.string.kiosk_punch_out_title else R.string.kiosk_punch_in_title,
        )
        successName?.text = name
        successTime?.text = activity.getString(
            R.string.kiosk_time_format,
            SimpleDateFormat("hh:mm a", Locale.getDefault()).format(Date()),
            SimpleDateFormat("dd MMM", Locale.getDefault()).format(Date()),
        )
        successBadge?.setBackgroundResource(
            if (isOut) R.drawable.bg_badge_out else R.drawable.bg_badge_in,
        )
        successBadgeIcon?.setImageResource(
            if (isOut) R.drawable.ic_logout_white else R.drawable.ic_check_white,
        )
        successBadgeChip?.text = activity.getString(
            if (isOut) R.string.kiosk_badge_out else R.string.kiosk_badge_in,
        )
        successOverlay.visibility = View.VISIBLE
        successCard?.startAnimation(AnimationUtils.loadAnimation(activity, R.anim.kiosk_card_in))
        handler.postDelayed({
            successOverlay.visibility = View.GONE
            onHidden()
        }, OVERLAY_VISIBLE_MS)
    }

    fun hideSuccess() {
        successOverlay?.visibility = View.GONE
    }

    private fun formatSubtitle(branding: FaceDeskKioskBranding): String {
        val parts = mutableListOf<String>()
        branding.branchName?.takeIf { it.isNotBlank() }?.let { parts.add(it) }
        branding.deviceName.takeIf { it.isNotBlank() }?.let { parts.add(it) }
        branding.location?.takeIf { it.isNotBlank() }?.let { parts.add(it) }
        return parts.joinToString(" · ").ifBlank {
            activity.getString(R.string.kiosk_branch_unknown)
        }
    }

    private fun loadClientLogo(path: String) {
        val url = if (path.startsWith("http")) path else "${apiBase.trimEnd('/')}$path"
        Thread {
            runCatching {
                val req = Request.Builder().url(url).get().build()
                http.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) return@use
                    val bytes = resp.body?.bytes() ?: return@use
                    val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return@use
                    activity.runOnUiThread {
                        headerClientLogo?.setImageBitmap(bmp)
                        headerClientLogo?.visibility = View.VISIBLE
                        headerBrandIcon?.visibility = View.GONE
                    }
                }
            }
        }.start()
    }

    suspend fun loadClientLogoAsync(path: String) = withContext(Dispatchers.IO) {
        val url = if (path.startsWith("http")) path else "${apiBase.trimEnd('/')}$path"
        runCatching {
            val req = Request.Builder().url(url).get().build()
            http.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@runCatching null
                val bytes = resp.body?.bytes() ?: return@runCatching null
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            }
        }.getOrNull()
    }

    companion object {
        private const val OVERLAY_VISIBLE_MS = 3_000L
    }
}
