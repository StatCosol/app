package com.statcosol.attendance.face

import android.app.ActivityManager
import android.content.Context
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCharacteristics
import android.util.Log
import android.util.Size
import androidx.annotation.OptIn
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.camera2.interop.ExperimentalCamera2Interop
import androidx.camera.core.CameraInfo
import kotlin.math.abs
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * What THIS handset can actually do, decided on this handset.
 *
 * The tuning defaults in [FaceKioskTuning] were profiled on one phone
 * (SM-E076B), but the APK is universal and gets installed on whatever hardware
 * a site has. A 1280x720 analysis target is not a specification — it is one
 * device's answer. On a better sensor it throws away resolution the camera was
 * willing to give; on a weaker one it asks for a stream the SoC cannot keep up
 * with. Either way the operator sees the same thing: captures that "don't work"
 * for reasons nothing on screen explains.
 *
 * So the stream size is chosen at bind time from the camera's own reported
 * capabilities, bounded by what the device can plausibly process per frame.
 * Server config still wins where a site has set it (see
 * [FaceKioskTuning.applyFrom]) — this only decides what to do when nobody has.
 */
object DeviceCameraProfile {
    private const val TAG = "DeviceCameraProfile"

    /**
     * Upper bound on the analysis stream's long edge.
     *
     * Not a hardware limit — a throughput one. Every frame runs ML Kit
     * detection plus a TFLite embedding, and past ~1080p the extra pixels stop
     * improving the face crop (the crop is a fraction of the frame either way)
     * while the per-frame cost keeps climbing. A slower loop is not a cosmetic
     * problem here: blink liveness has to catch a blink, and
     * ATTENDANCE_STALE_GAP_MS discards a batch whose frames arrive too far
     * apart.
     */
    private const val MAX_LONG_EDGE = 1920

    /** Below this the face crop is too small to be worth embedding. */
    private const val MIN_LONG_EDGE = 640

    /** Long edge for devices that should not be asked for 1080p analysis. */
    private const val MODEST_LONG_EDGE = 1280

    private const val TARGET_ASPECT = 16f / 9f

    /**
     * Last resort, and the value this app shipped with before profiling.
     *
     * Held as plain ints because `android.util.Size` accessors throw in JVM unit
     * tests, and the selection below has to stay testable off-device.
     */
    private const val FALLBACK_W = 1280
    private const val FALLBACK_H = 720

    val FALLBACK: Size get() = Size(FALLBACK_W, FALLBACK_H)

    /**
     * Pick an analysis size for [cameraInfo].
     *
     * Returns [FALLBACK] rather than throwing if the camera declines to
     * describe itself — an unusual handset should degrade to the old behaviour,
     * not fail to open the camera.
     */
    @OptIn(ExperimentalCamera2Interop::class)
    fun analysisSizeFor(context: Context, cameraInfo: CameraInfo): Size {
        val supported = try {
            Camera2CameraInfo.from(cameraInfo)
                .getCameraCharacteristic(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                ?.getOutputSizes(ImageFormat.YUV_420_888)
                ?.toList()
                .orEmpty()
        } catch (e: Exception) {
            Log.w(TAG, "camera capabilities unavailable, using fallback: ${e.message}")
            emptyList()
        }
        if (supported.isEmpty()) return FALLBACK

        val cap = min(preferredLongEdge(context), MAX_LONG_EDGE)
        val chosen = choose(supported, cap)
        Log.i(
            TAG,
            "analysis size ${chosen.width}x${chosen.height} " +
                "(cap $cap, ${supported.size} sizes offered)",
        )
        return chosen
    }

    /**
     * How hard we are willing to push this device.
     *
     * A low-RAM device or a small core count means the per-frame budget is
     * tight, and asking for 1080p there buys a sharper crop the loop is then
     * too slow to use. This is deliberately coarse: it separates "budget kiosk
     * handset" from "ordinary modern phone", which is the distinction that
     * actually matters, and does not pretend to rank SoCs.
     */
    private fun preferredLongEdge(context: Context): Int {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
        val lowRam = am?.isLowRamDevice ?: false
        val cores = Runtime.getRuntime().availableProcessors()
        return if (lowRam || cores < 6) MODEST_LONG_EDGE else MAX_LONG_EDGE
    }

    private fun choose(supported: List<Size>, cap: Int): Size =
        chooseDims(supported.map { Dims(it.width, it.height) }, cap)
            .let { Size(it.width, it.height) }

    /**
     * A candidate stream size, free of [android.util.Size].
     *
     * The selection below is the part most likely to be wrong on a handset
     * nobody here owns — aspect tie-breaks, everything-above-cap, a sensor that
     * offers no 16:9 at all — so it has to be reachable from a plain JVM unit
     * test. `android.util.Size` is a stub in unit tests and would make that
     * impossible.
     */
    internal data class Dims(val width: Int, val height: Int) {
        val longEdge: Int get() = maxOf(width, height)
        val aspect: Float get() = longEdge.toFloat() / minOf(width, height).toFloat()
    }

    /**
     * Largest 16:9 size within [cap]; falls back to the closest aspect, then to
     * whatever is nearest the cap. Never returns something below
     * [MIN_LONG_EDGE] when anything larger is on offer.
     */
    internal fun chooseDims(supported: List<Dims>, cap: Int): Dims {
        if (supported.isEmpty()) return Dims(FALLBACK_W, FALLBACK_H)

        val usable = supported.filter { it.longEdge in MIN_LONG_EDGE..cap }
            .ifEmpty {
                // Every option is above the cap or below the floor. Prefer the
                // smallest that clears the floor — overshooting the throughput
                // budget beats a face crop too small to embed. If nothing
                // clears it, the largest on offer is still the best available.
                supported.filter { it.longEdge >= MIN_LONG_EDGE }
                    .minByOrNull { it.longEdge }
                    ?.let { listOf(it) }
                    ?: listOf(supported.maxByOrNull { it.longEdge }!!)
            }

        val widescreen = usable.filter { abs(it.aspect - TARGET_ASPECT) < 0.05f }
        if (widescreen.isNotEmpty()) return widescreen.maxByOrNull { it.longEdge }!!

        // No true 16:9 offered. Closest aspect wins, ties broken by size, so a
        // 4:3-only sensor still gets its best usable stream.
        return usable.minByOrNull {
            abs(it.aspect - TARGET_ASPECT) * 1000f - it.longEdge / 10000f
        }!!
    }

    /**
     * Longest edge for a stored face photo, given the stream it is cropped from.
     *
     * Bounded at both ends for different reasons. The floor keeps the admin
     * gallery and Azure's 1:N usable on a modest stream. The ceiling is a
     * payload limit, not a quality judgement: a punch sends up to
     * ATTENDANCE_MAX_FRAMES frames and EVERY one carries its own photo, against
     * a 2 MB JSON body limit on the server, so per-photo size has to be divided
     * by a batch that can be 18 deep. Raising this without also capping how
     * many photos a batch carries is how a punch starts failing with 413 on
     * exactly the good sensors it was meant to help.
     */
    fun photoMaxEdgeFor(analysis: Size): Int =
        photoMaxEdgeForShortEdge(minOf(analysis.width, analysis.height))

    internal fun photoMaxEdgeForShortEdge(shortEdge: Int): Int =
        (shortEdge * 0.8f).roundToInt().coerceIn(480, 640)

    /**
     * Absolute minimum face width, in real pixels, for a frame to be usable.
     *
     * The existing gate is a FRACTION of frame width, which says nothing about
     * how many pixels of face there actually are — 0.12 of a 640-wide stream is
     * 77 px, and no amount of enrolment fixes a 77 px face. Recognition quality
     * is a function of pixels on the face, so this gate is stated in pixels and
     * applies identically on every device; the fraction gate stays as the
     * framing/distance cue.
     *
     * Scaled down on genuinely small streams so a low-resolution device asks
     * the worker to step closer instead of refusing every frame it can produce.
     */
    fun minFacePxFor(analysis: Size): Int =
        minFacePxForShortEdge(minOf(analysis.width, analysis.height))

    internal fun minFacePxForShortEdge(shortEdge: Int): Int =
        min(110, (shortEdge * 0.22f).roundToInt())
}
