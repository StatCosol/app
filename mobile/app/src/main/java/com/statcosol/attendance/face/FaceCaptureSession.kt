package com.statcosol.attendance.face

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import android.util.Base64
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

class FaceCaptureSession(
    private val embedder: FaceEmbedder,
    private val detector: FaceDetector,
    private val minFaceSize: Float = FaceKioskTuning.MIN_FACE_SIZE_ATTENDANCE,
    private val minLuminance: Float = FaceKioskTuning.MIN_LUMINANCE,
    private val maxPitch: Float = FaceKioskTuning.MAX_PITCH_DEG,
    private val minSharpness: Float = FaceKioskTuning.MIN_SHARPNESS_ATTENDANCE,
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
        if (luminance < minLuminance) {
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

        if (faceWidth < minFaceSize) {
            emitPreview(normBox, partialMetrics(face, faceWidth, 0f), "Please move closer to the camera", false)
            onHint("Please move closer to the camera")
            return
        }

        val pitch = face.headEulerAngleX
        val faceBitmap = cropFaceBitmap(bitmap, face.boundingBox)

        if (!relaxPitchGate() && Math.abs(pitch) > maxPitch) {
            emitPreview(normBox, partialMetrics(face, faceWidth, 0f), "Please look straight at the camera", false)
            onHint("Please look straight at the camera")
            return
        }

        val sharpness = computeSharpness(faceBitmap)
        if (sharpness < minSharpness) {
            emitPreview(normBox, partialMetrics(face, faceWidth, sharpness),
                "Image blurry — hold still and look at the camera", false)
            onHint("Image blurry — hold still and look at the camera")
            return
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
        val enhancedFace = normalizeIllumination(faceBitmap, faceLuminance)
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

        val embedding = embedder.embed(enhancedFace)
        val fullFrameEmbedding =
            if (computeFullFrameProbe) embedder.embed(bitmap) else FloatArray(0)
        val photoB64 = if (capturePhoto) bitmapToBase64(enhancedFace) else null

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
        return relative >= 0.5f && secondWidth >= minFaceSize && hasFaceClassification
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
        // Keep the stored photo selfie-grade for admin verification: preserve the
        // crop's aspect ratio (the old 320x320 square stretched the taller
        // head-and-shoulders crop), only downscale when the native crop exceeds
        // the target edge (never upscale/stretch), and use quality 90. The
        // embedding uses its own INPUT_SIZE resize (see FaceEmbedder), so photo
        // resolution/quality here does not affect matching.
        val maxEdge = 640
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
        scaled.compress(Bitmap.CompressFormat.JPEG, 90, out)
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

    /** Brighten an under-exposed face crop via a capped linear gain so a dim
     *  face still yields a usable embedding. Returns the original bitmap when
     *  it's already bright enough (or on any failure). */
    private fun normalizeIllumination(bitmap: Bitmap, luma: Float): Bitmap {
        val gain = lowLightGain(luma)
        if (gain <= 1.02f) return bitmap
        val cm = ColorMatrix(
            floatArrayOf(
                gain, 0f, 0f, 0f, 0f,
                0f, gain, 0f, 0f, 0f,
                0f, 0f, gain, 0f, 0f,
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
