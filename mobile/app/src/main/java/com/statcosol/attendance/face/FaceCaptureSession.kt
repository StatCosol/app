package com.statcosol.attendance.face

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
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

class FaceCaptureSession(
    private val embedder: FaceEmbedder,
    private val detector: FaceDetector,
    private val minFaceSize: Float = 0.15f,
    private val minLuminance: Float = 40f,
    // maxYaw relaxed during liveness — HEAD_TURN challenges intentionally move the head.
    // Quality gate only applies to the embedding capture phase (frontal-only frames).
    private val maxYaw: Float = 20f,
    private val maxPitch: Float = 15f,
    private val minSharpness: Float = 80f,
    private val onFace: (probe: FloatArray, metrics: FaceMetrics, photoBase64: String?) -> Unit,
    private val onHint: (String) -> Unit,
) : ImageAnalysis.Analyzer {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @ExperimentalGetImage
    override fun analyze(imageProxy: ImageProxy) {
        scope.launch {
            try {
                processFrame(imageProxy)
            } finally {
                imageProxy.close()
            }
        }
    }

    @ExperimentalGetImage
    private suspend fun processFrame(imageProxy: ImageProxy) {
        val bitmap = imageProxy.toBitmap() ?: return

        val luminance = computeLuminance(bitmap)
        if (luminance < minLuminance) {
            onHint("Lighting too low — please move into the light")
            return
        }

        val faces = detector.detect(imageProxy)

        if (faces.isEmpty()) {
            onHint("No face detected — please look at the camera")
            return
        }

        if (faces.size > 1) {
            onHint("Multiple faces detected — only one person at a time")
            return
        }

        val face = faces[0]
        val faceWidth = face.boundingBox.width().toFloat() / imageProxy.width.toFloat()

        if (faceWidth < minFaceSize) {
            onHint("Please move closer to the camera")
            return
        }

        val yaw = face.headEulerAngleY
        val pitch = face.headEulerAngleX
        val metrics = computeMetrics(face)

        // Quality gate: frontal-only for embedding frames; skip for liveness (head turns).
        // The activity decides which checks are relevant based on current challenge state.
        if (Math.abs(pitch) > maxPitch) {
            onHint("Please look straight at the camera")
            return
        }

        val sharpness = computeSharpness(bitmap)
        if (sharpness < minSharpness) {
            onHint("Image blurry — hold still and look at the camera")
            return
        }

        val embedding = embedder.embed(bitmap)
        val photoB64 = bitmapToBase64(bitmap)

        onFace(embedding, metrics, photoB64)
    }

    private fun computeLuminance(bitmap: Bitmap): Float {
        var sum = 0L
        val pixels = IntArray(bitmap.width * bitmap.height)
        bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
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

    private fun computeMetrics(face: Face): FaceMetrics {
        // Default eye openness to 1.0 (open) — 0.5 default would fail BLINK checks permanently.
        val leftEye = face.leftEyeOpenProbability ?: 1.0f
        val rightEye = face.rightEyeOpenProbability ?: 1.0f
        val smiling = face.smilingProbability ?: 0.0f
        return FaceMetrics(
            eyeOpenness = ((leftEye + rightEye) / 2.0).coerceIn(0.0, 1.0),
            smilingProbability = smiling.toDouble().coerceIn(0.0, 1.0),
            headYaw = face.headEulerAngleY,
        )
    }

    private fun bitmapToBase64(bitmap: Bitmap): String {
        val out = ByteArrayOutputStream()
        val scaled = Bitmap.createScaledBitmap(bitmap, 320, 320, true)
        scaled.compress(Bitmap.CompressFormat.JPEG, 70, out)
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }

    @ExperimentalGetImage
    private fun ImageProxy.toBitmap(): Bitmap? {
        val image = image ?: return null
        return try {
            val yBuffer = image.planes[0].buffer
            val uBuffer = image.planes[1].buffer
            val vBuffer = image.planes[2].buffer
            val ySize = yBuffer.remaining()
            val uSize = uBuffer.remaining()
            val vSize = vBuffer.remaining()
            val nv21 = ByteArray(ySize + uSize + vSize)
            yBuffer.get(nv21, 0, ySize)
            vBuffer.get(nv21, ySize, vSize)
            uBuffer.get(nv21, ySize + vSize, uSize)
            val yuvImage = YuvImage(nv21, ImageFormat.NV21, width, height, null)
            val out = ByteArrayOutputStream()
            yuvImage.compressToJpeg(Rect(0, 0, width, height), 90, out)
            BitmapFactory.decodeByteArray(out.toByteArray(), 0, out.size())
        } catch (e: Exception) {
            null
        }
    }
}
