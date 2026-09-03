package com.statcosol.attendance.face

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import android.util.Base64
import android.util.Log
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.google.mlkit.vision.face.Face
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max
import kotlin.math.min

/**
 * Thresholds are providers, not values: the server can revise them per client
 * after this session was constructed, and a captured Float would pin the session
 * to whatever the build shipped with.
 */
class FaceCaptureSession(
    private val embedder: FaceEmbedder,
    private val detector: FaceDetector,
    private val minFaceSize: () -> Float = { FaceKioskTuning.MIN_FACE_SIZE_ATTENDANCE },
    /**
     * Absolute face width floor in pixels. The fraction above says how the
     * worker is framed; this says whether there is enough face to recognise,
     * which is the part that must hold identically on every handset.
     */
    private val minFacePx: () -> Int = { FaceKioskTuning.MIN_FACE_PX },
    private val minLuminance: () -> Float = { FaceKioskTuning.MIN_LUMINANCE },
    private val maxPitch: () -> Float = { FaceKioskTuning.MAX_PITCH_DEG },
    private val minSharpness: () -> Float = { FaceKioskTuning.MIN_SHARPNESS_ATTENDANCE },
    /**
     * Device-independent blur floor. 0 disables the gate, which is the shipped
     * default until a real distribution exists to set it from.
     */
    private val minBlurScore: () -> Float = { FaceKioskTuning.MIN_BLUR_ATTENDANCE },
    /** When true, pitch gate is skipped (for left/right enrollment turns). */
    private val relaxPitchGate: () -> Boolean = { false },
    // Both default on for the V1 kiosk/ESS screens. FaceDesk V2 discards the
    // full-frame probe and the photo, and skipping them roughly triples frame
    // throughput — which is what makes blink-based liveness catchable at all.
    private val computeFullFrameProbe: Boolean = true,
    private val capturePhoto: Boolean = true,
    private val onFace: (
        faceProbe: FloatArray,
        fullFrameProbe: FloatArray,
        metrics: FaceMetrics,
        photoBase64: String?,
    ) -> Unit,
    private val onHint: (String) -> Unit,
    private val onPreview: ((FaceScanPreview) -> Unit)? = null,
) : ImageAnalysis.Analyzer {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val processing = AtomicBoolean(false)

    @ExperimentalGetImage
    override fun analyze(imageProxy: ImageProxy) {
        if (!processing.compareAndSet(false, true)) {
            imageProxy.close()
            return
        }
        scope.launch {
            try {
                processFrame(imageProxy)
            } finally {
                processing.set(false)
                imageProxy.close()
            }
        }
    }

    @ExperimentalGetImage
    private suspend fun processFrame(imageProxy: ImageProxy) {
        val bitmap = imageProxy.toUprightBitmap() ?: return
        val frameW = bitmap.width
        val frameH = bitmap.height

        val luminance = computeLuminance(bitmap)
        if (luminance < minLuminance()) {
            emitPreview(null, null, "Lighting too low — please move into the light", false)
            onHint("Lighting too low — please move into the light")
            return
        }

        val faces = detector.detect(imageProxy)

        if (faces.isEmpty()) {
            emitPreview(null, null, "No face detected — please look at the camera", false)
            onHint("No face detected — please look at the camera")
            return
        }

        val sortedFaces = faces.sortedByDescending { faceArea(it.boundingBox) }
        val face = sortedFaces[0]
        val secondFace = sortedFaces.getOrNull(1)
        if (secondFace != null && isRealSecondPerson(face, secondFace, bitmap.width)) {
            emitPreview(normalizeBox(face.boundingBox, frameW, frameH), null,
                "Multiple faces detected — only one person at a time", false)
            onHint("Multiple faces detected — only one person at a time")
            return
        }

        val faceWidth = face.boundingBox.width().toFloat() / bitmap.width.toFloat()
        val normBox = normalizeBox(face.boundingBox, frameW, frameH)

        // Two gates, same message: the worker's answer to either is to step
        // closer. The fraction keeps them framed inside the oval; the pixel
        // floor is what makes a frame worth embedding on a stream whose
        // resolution this build does not know in advance.
        if (faceWidth < minFaceSize() || face.boundingBox.width() < minFacePx()) {
            emitPreview(normBox, partialMetrics(face, faceWidth, 0f), "Please move closer to the camera", false)
            onHint("Please move closer to the camera")
            return
        }

        val pitch = face.headEulerAngleX
        val faceBitmap = cropFaceBitmap(bitmap, face.boundingBox)

        if (!relaxPitchGate() && Math.abs(pitch) > maxPitch()) {
            emitPreview(normBox, partialMetrics(face, faceWidth, 0f), "Please look straight at the camera", false)
            onHint("Please look straight at the camera")
            return
        }

        val sharpness = computeSharpness(faceBitmap)
        if (sharpness < minSharpness()) {
            emitPreview(normBox, partialMetrics(face, faceWidth, sharpness),
                "Image blurry — hold still and look at the camera", false)
            onHint("Image blurry — hold still and look at the camera")
            return
        }

        // Device-independent blur check. Off unless a floor has been configured
        // for this client — see computeBlurScore for why it ships disabled.
        val blur = computeBlurScore(faceBitmap)
        val blurFloor = minBlurScore()
        if (blurFloor > 0f && blur < blurFloor) {
            emitPreview(normBox, partialMetrics(face, faceWidth, sharpness),
                "Image blurry — hold still and look at the camera", false)
            onHint("Image blurry — hold still and look at the camera")
            return
        }
        // Tuning telemetry, off in production but reachable on a real kiosk.
        //
        // A BuildConfig.DEBUG guard was the wrong switch here, for a reason that
        // only shows up on hardware: kiosks run the RELEASE build, so the line
        // could never fire on the only devices whose numbers matter, and the
        // floor these values exist to calibrate could never be set. Nothing was
        // logged despite frames being accepted.
        //
        // isLoggable keeps the intent — silent by default, no scalars in
        // production logcat — while letting an operator opt a single device in:
        //   adb shell setprop log.tag.FaceCaptureSession DEBUG
        // These are quality scalars (edge energy, contrast, face fraction), not
        // identity: nothing here says who was captured.
        //
        // Gate on DEBUG, emit at INFO: the gate is what controls visibility, and
        // emitting at INFO keeps it independent of whether the release build's
        // minifier drops debug-level calls.
        if (Log.isLoggable(TAG, Log.DEBUG)) {
            Log.i(TAG, "capture blur=%.2f contrast=%.0f face=%.3f".format(blur, sharpness, faceWidth))
        }

        // Face brightness. Measured on the face crop (not the frame) so a bright
        // background can't mask a dark face. Below the hard floor there is
        // essentially no facial signal to recover, so guide the worker to better
        // light rather than amplify pure sensor noise into the embedding.
        val faceLuminance = computeLuminance(faceBitmap)
        if (faceLuminance < HARD_DARK_FLOOR) {
            emitPreview(normBox, partialMetrics(face, faceWidth, sharpness),
                "Face too dark — move into better light", false)
            onHint("Face too dark — move into better light")
            return
        }

        // Low-light normalization: lift an under-exposed (but recoverable) face
        // toward a target brightness before embedding, so a dim face still
        // produces a strong, illumination-consistent embedding instead of being
        // rejected outright. Applied on both enrollment and attendance (shared
        // session) so the two stay comparable. Gain is capped to bound the noise
        // it amplifies; the camera-side exposure boost does the heavy lifting.
        // The embedding is fed the low-light-gain-only crop (NO white balance):
        // every gallery embedding ever enrolled — pre-0.7.8 profiles included —
        // was produced by this pipeline, and the backend cosine-compares them all
        // as one "mobilefacenet" space. White-balancing only the probe would shift
        // it out of that space and could reject already-enrolled workers on the
        // green-cast cameras. Colour correction is applied to the stored photo
        // only (below), where it's cosmetic and can't affect matching.
        val embeddingFace = enhanceFace(faceBitmap, faceLuminance, null)
        val effectiveLuminance =
            (faceLuminance * lowLightGain(faceLuminance)).coerceAtMost(FACE_TARGET_LUMINANCE)

        val sizeScore = (faceWidth / 0.35f).coerceIn(0f, 1f)
        val sharpScore = (sharpness / 80f).coerceIn(0f, 1f)
        // Brightness score reflects the post-normalization face, so a recoverable
        // dim face isn't unfairly gated while a near-black frame (rejected above)
        // still can't sneak through.
        val brightScore = (effectiveLuminance / 120f).coerceIn(0f, 1f)
        val captureQuality =
            (sizeScore * 0.35f + sharpScore * 0.45f + brightScore * 0.20f).toDouble()
        val metrics = computeMetrics(face, captureQuality)

        val embedding = embedder.embed(embeddingFace)
        val fullFrameEmbedding =
            if (computeFullFrameProbe) embedder.embed(bitmap) else FloatArray(0)
        // Stored photo (human-viewable, never matched): additionally white-balance
        // the crop to neutralise the budget sensor's green cast so admin galleries
        // and duplicate alerts show natural-colour faces. Kept off the embedding
        // above so a colour cast can never affect matching.
        val photoB64 =
            if (capturePhoto) {
                val wbGains = computeWhiteBalanceGains(bitmap)
                bitmapToBase64(enhanceFace(faceBitmap, faceLuminance, wbGains))
            } else {
                null
            }

        emitPreview(normBox, metrics, null, true)
        onFace(embedding, fullFrameEmbedding, metrics, photoB64)
    }

    private fun emitPreview(
        box: android.graphics.RectF?,
        metrics: FaceMetrics?,
        hint: String?,
        accepted: Boolean,
    ) {
        onPreview?.invoke(
            FaceScanPreview(
                faceBox = box,
                metrics = metrics,
                hint = hint,
                faceDetected = box != null,
                frameAccepted = accepted,
            ),
        )
    }

    private fun normalizeBox(box: Rect, frameW: Int, frameH: Int): android.graphics.RectF {
        return android.graphics.RectF(
            box.left.toFloat() / frameW,
            box.top.toFloat() / frameH,
            box.right.toFloat() / frameW,
            box.bottom.toFloat() / frameH,
        )
    }

    private fun partialMetrics(face: Face, faceWidth: Float, sharpness: Float): FaceMetrics {
        val sizeScore = (faceWidth / 0.35f).coerceIn(0f, 1f)
        val sharpScore = (sharpness / 80f).coerceIn(0f, 1f)
        val q = (sizeScore * 0.45f + sharpScore * 0.55f).toDouble()
        return computeMetrics(face, q)
    }

    private fun faceArea(box: Rect): Int {
        return max(0, box.width()) * max(0, box.height())
    }

    /**
     * Whether a second detected face is really another person, not a background
     * false positive. Busy backgrounds (patterned curtains, wall art) make ML
     * Kit report phantom faces that blocked capture with "multiple faces".
     * A real second person is: comparable in size to the main face, above the
     * absolute minimum face size, AND carries genuine face classification
     * (eye/smile probabilities) — which texture false-positives lack.
     */
    private fun isRealSecondPerson(
        main: Face,
        second: Face,
        frameWidth: Int,
    ): Boolean {
        val relative = faceArea(second.boundingBox).toFloat() /
            max(1, faceArea(main.boundingBox)).toFloat()
        val secondWidth = second.boundingBox.width().toFloat() / frameWidth.toFloat()
        val hasFaceClassification = second.leftEyeOpenProbability != null ||
            second.rightEyeOpenProbability != null ||
            second.smilingProbability != null
        return relative >= 0.5f && secondWidth >= minFaceSize() && hasFaceClassification
    }

    private fun cropFaceBitmap(bitmap: Bitmap, box: Rect): Bitmap {
        val padX = (box.width() * 0.35f).toInt()
        val padY = (box.height() * 0.45f).toInt()
        val left = max(0, box.left - padX)
        val top = max(0, box.top - padY)
        val right = min(bitmap.width, box.right + padX)
        val bottom = min(bitmap.height, box.bottom + padY)
        val width = right - left
        val height = bottom - top
        return if (width > 24 && height > 24) {
            Bitmap.createBitmap(bitmap, left, top, width, height)
        } else {
            bitmap
        }
    }

    private fun computeLuminance(bitmap: Bitmap): Float {
        // Average brightness doesn't need full resolution — a 32x32 thumbnail
        // gives the same reading without scanning ~300k pixels per frame.
        val small = Bitmap.createScaledBitmap(bitmap, 32, 32, false)
        var sum = 0L
        val pixels = IntArray(small.width * small.height)
        small.getPixels(pixels, 0, small.width, 0, 0, small.width, small.height)
        for (pixel in pixels) {
            val r = (pixel shr 16) and 0xFF
            val g = (pixel shr 8) and 0xFF
            val b = pixel and 0xFF
            sum += (0.299 * r + 0.587 * g + 0.114 * b).toLong()
        }
        return sum.toFloat() / pixels.size
    }

    /**
     * How blurred the face is, independent of the sensor and the lighting.
     *
     * [computeSharpness] below is not a sharpness measure despite the name: it
     * is the global intensity variance of a 64x64 thumbnail, which is CONTRAST.
     * Downscaling that far removes precisely the high-frequency detail that blur
     * destroys, so a sharp face in flat light scores badly while a blurred face
     * in harsh light scores well. That makes MIN_SHARPNESS_* a lighting- and
     * sensor-dependent gate — the exact kind of constant that cannot be right on
     * a handset it was not profiled on.
     *
     * This is a Laplacian variance instead, which responds to edge detail rather
     * than tonal spread, and it is divided by the image's own intensity variance
     * so that doubling the contrast does not double the score. What is left is
     * roughly "how much edge energy per unit of contrast" — comparable across
     * cameras, exposures and white balance.
     *
     * Computed at a fixed 128x128 so the number means the same thing regardless
     * of how many pixels the crop happened to have.
     *
     * DEFAULTED OFF (threshold 0). The scale is new and no field data exists to
     * set a floor from; shipping a guessed threshold to a live attendance system
     * would reject real punches for a reason nobody could see. The value is
     * logged on every accepted frame so a real distribution can be collected,
     * and the floor is server-tunable per client once it is known.
     */
    private fun computeBlurScore(bitmap: Bitmap): Float {
        val n = 128
        val gray = Bitmap.createScaledBitmap(bitmap, n, n, true)
        val pixels = IntArray(n * n)
        gray.getPixels(pixels, 0, n, 0, 0, n, n)

        val lum = FloatArray(n * n)
        var mean = 0.0
        for (i in pixels.indices) {
            val p = pixels[i]
            val v = (p shr 16 and 0xFF) * 0.299f +
                (p shr 8 and 0xFF) * 0.587f +
                (p and 0xFF) * 0.114f
            lum[i] = v
            mean += v
        }
        mean /= lum.size

        var intensityVar = 0.0
        for (v in lum) {
            val d = v - mean
            intensityVar += d * d
        }
        intensityVar /= lum.size
        // A near-flat crop has no edges to find and no contrast to divide by;
        // the ratio would be noise over noise.
        if (intensityVar < 1.0) return 0f

        // 4-neighbour Laplacian over the interior; the border is skipped rather
        // than clamped so an edge artifact cannot masquerade as detail.
        var lapMean = 0.0
        var count = 0
        val lap = FloatArray((n - 2) * (n - 2))
        for (y in 1 until n - 1) {
            for (x in 1 until n - 1) {
                val i = y * n + x
                val l = 4f * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - n] - lum[i + n]
                lap[count] = l
                lapMean += l
                count++
            }
        }
        lapMean /= count

        var lapVar = 0.0
        for (i in 0 until count) {
            val d = lap[i] - lapMean
            lapVar += d * d
        }
        lapVar /= count

        return (lapVar / intensityVar).toFloat()
    }

    private fun computeSharpness(bitmap: Bitmap): Float {
        val gray = Bitmap.createScaledBitmap(bitmap, 64, 64, true)
        val pixels = IntArray(gray.width * gray.height)
        gray.getPixels(pixels, 0, gray.width, 0, 0, gray.width, gray.height)

        var variance = 0.0
        var mean = 0.0

        for (pixel in pixels) {
            val v = (pixel shr 16 and 0xFF) * 0.299 +
                    (pixel shr 8 and 0xFF) * 0.587 +
                    (pixel and 0xFF) * 0.114
            mean += v
        }
        mean /= pixels.size

        for (pixel in pixels) {
            val v = (pixel shr 16 and 0xFF) * 0.299 +
                    (pixel shr 8 and 0xFF) * 0.587 +
                    (pixel and 0xFF) * 0.114
            val diff = v - mean
            variance += diff * diff
        }
        return (variance / pixels.size).toFloat()
    }

    private fun computeMetrics(face: Face, captureQuality: Double): FaceMetrics {
        // Default eye openness to 1.0 (open) — 0.5 default would fail BLINK checks permanently.
        val leftEye = face.leftEyeOpenProbability ?: 1.0f
        val rightEye = face.rightEyeOpenProbability ?: 1.0f
        val smiling = face.smilingProbability ?: 0.0f
        return FaceMetrics(
            eyeOpenness = ((leftEye + rightEye) / 2.0).coerceIn(0.0, 1.0),
            smilingProbability = smiling.toDouble().coerceIn(0.0, 1.0),
            headYaw = face.headEulerAngleY,
            headPitch = face.headEulerAngleX,
            captureQuality = captureQuality,
        )
    }

    private fun bitmapToBase64(bitmap: Bitmap): String {
        val out = ByteArrayOutputStream()
        // Sharper than the old 320x320/q70 square (which stretched the taller
        // head-and-shoulders crop): preserve aspect ratio and only downscale when
        // the native crop exceeds the target edge (never upscale/stretch).
        //
        // Every frame carries this photo, and when face-svc is enabled the server
        // re-embeds each one with ArcFace, so the size is bounded to keep a full
        // multi-frame punch/enrolment under the server's request-body limit while
        // still giving face-svc a good crop. Matching itself is unaffected — the
        // device embedder uses its own INPUT_SIZE resize (see FaceEmbedder).
        //
        // Derived from the analysis stream rather than fixed at 480: on a 720p
        // stream the native crop rarely reaches even that, so a constant cap
        // described the one handset it was profiled on and silently discarded
        // resolution on any better sensor. See DeviceCameraProfile.
        val maxEdge = FaceKioskTuning.PHOTO_MAX_EDGE
        val longest = max(bitmap.width, bitmap.height)
        val scaled = if (longest > maxEdge) {
            val ratio = maxEdge.toFloat() / longest.toFloat()
            Bitmap.createScaledBitmap(
                bitmap,
                (bitmap.width * ratio).toInt().coerceAtLeast(1),
                (bitmap.height * ratio).toInt().coerceAtLeast(1),
                true,
            )
        } else {
            bitmap
        }
        scaled.compress(Bitmap.CompressFormat.JPEG, 88, out)
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }

    // Named distinctly (not toBitmap) so it isn't shadowed by CameraX's built-in
    // ImageProxy.toBitmap() member. The built-in does a correct, stride-aware
    // YUV→RGB conversion but returns the frame in the sensor's (un-rotated)
    // orientation. ML Kit returns face boxes in the rotation-corrected upright
    // space, so rotate the bitmap to match — otherwise normalizeBox (overlay
    // oval), cropFaceBitmap (embedding) and the size gate are all mapped against
    // swapped width/height.
    @ExperimentalGetImage
    private fun ImageProxy.toUprightBitmap(): Bitmap? {
        val base = try {
            toBitmap()
        } catch (e: Exception) {
            return null
        }
        val rotation = imageInfo.rotationDegrees
        if (rotation == 0) return base
        return try {
            val matrix = Matrix().apply { postRotate(rotation.toFloat()) }
            Bitmap.createBitmap(base, 0, 0, base.width, base.height, matrix, true)
                .also { if (it !== base) base.recycle() }
        } catch (e: Exception) {
            base
        }
    }

    /** Capped multiplicative gain that lifts [luma] toward the target. 1.0 when
     *  the face is already bright enough; never above [MAX_LOW_LIGHT_GAIN] so
     *  sensor noise isn't amplified without bound. */
    private fun lowLightGain(luma: Float): Float =
        if (luma <= 1f) 1f
        else (FACE_TARGET_LUMINANCE / luma).coerceIn(1f, MAX_LOW_LIGHT_GAIN)

    /**
     * Per-channel white-balance gains that neutralise a strong colour cast
     * (e.g. the green cast some budget front sensors produce under fluorescent
     * or cheap-LED light) via a capped grey-world estimate on a 32x32 downscale
     * of the full frame. Returns null when the frame is already near-neutral, so
     * a well-behaved camera is left untouched. Gains are clamped so a genuinely
     * coloured scene can't be wildly shifted.
     */
    private fun computeWhiteBalanceGains(bitmap: Bitmap): FloatArray? {
        return try {
            val tiny = Bitmap.createScaledBitmap(bitmap, 32, 32, true)
            val px = IntArray(32 * 32)
            tiny.getPixels(px, 0, 32, 0, 0, 32, 32)
            if (tiny !== bitmap) tiny.recycle()
            var rs = 0L
            var gs = 0L
            var bs = 0L
            for (p in px) {
                rs += (p shr 16) and 0xFF
                gs += (p shr 8) and 0xFF
                bs += p and 0xFF
            }
            val n = px.size.toFloat()
            val rAvg = rs / n
            val gAvg = gs / n
            val bAvg = bs / n
            val grey = (rAvg + gAvg + bAvg) / 3f
            if (grey < 1f) return null
            fun gain(avg: Float) = (grey / avg.coerceAtLeast(1f)).coerceIn(0.7f, 1.4f)
            val r = gain(rAvg)
            val g = gain(gAvg)
            val b = gain(bAvg)
            // Near-neutral frame → no correction (protects balanced cameras).
            if (kotlin.math.abs(r - 1f) < 0.08f &&
                kotlin.math.abs(g - 1f) < 0.08f &&
                kotlin.math.abs(b - 1f) < 0.08f
            ) {
                null
            } else {
                floatArrayOf(r, g, b)
            }
        } catch (e: Exception) {
            null
        }
    }

    /** Colour-correct + brighten a face crop: apply the per-channel white
     *  balance (from the full frame) and the capped low-light gain in a single
     *  pass. Returns the original bitmap when neither is needed (or on failure). */
    private fun enhanceFace(bitmap: Bitmap, luma: Float, wbGains: FloatArray?): Bitmap {
        val g = lowLightGain(luma)
        val rG = (wbGains?.getOrNull(0) ?: 1f) * g
        val gG = (wbGains?.getOrNull(1) ?: 1f) * g
        val bG = (wbGains?.getOrNull(2) ?: 1f) * g
        if (kotlin.math.abs(rG - 1f) < 0.02f &&
            kotlin.math.abs(gG - 1f) < 0.02f &&
            kotlin.math.abs(bG - 1f) < 0.02f
        ) {
            return bitmap
        }
        val cm = ColorMatrix(
            floatArrayOf(
                rG, 0f, 0f, 0f, 0f,
                0f, gG, 0f, 0f, 0f,
                0f, 0f, bG, 0f, 0f,
                0f, 0f, 0f, 1f, 0f,
            ),
        )
        return try {
            val out = Bitmap.createBitmap(bitmap.width, bitmap.height, Bitmap.Config.ARGB_8888)
            Canvas(out).drawBitmap(
                bitmap,
                0f,
                0f,
                Paint().apply { colorFilter = ColorMatrixColorFilter(cm) },
            )
            out
        } catch (e: Exception) {
            bitmap
        }
    }

    private companion object {
        const val TAG = "FaceCaptureSession"

        /** Average face-crop brightness (0–255) below which there is too little
         *  signal to recover — the frame is rejected with a "too dark" hint.
         *  Tune down if a legitimately dim site still blocks real captures. */
        const val HARD_DARK_FLOOR = 24f

        /** Target average face brightness that low-light normalization lifts an
         *  under-exposed crop toward before embedding. */
        const val FACE_TARGET_LUMINANCE = 120f

        /** Upper bound on the low-light gain, to cap amplified sensor noise. */
        const val MAX_LOW_LIGHT_GAIN = 2.4f
    }
}
