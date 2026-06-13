package com.statcosol.attendance.face

import android.graphics.Bitmap
import android.graphics.Rect
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * ML Kit face detector wrapper. Returns the largest detected face plus a
 * naive liveness score derived from eye-open probabilities and head pose.
 *
 * For Phase 2 swap this for an Azure Face liveness call once Limited Access
 * is approved, or a dedicated PAD model.
 */
class FaceDetector {

    private val detector = FaceDetection.getClient(
        FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
            .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_NONE)
            .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
            .setMinFaceSize(0.18f)
            .build()
    )

    data class Result(
        val face: Face,
        val crop: Bitmap?,
        val livenessScore: Double,
        /** Total number of faces ML Kit detected in this frame. >1 means
         *  the caller MUST reject the punch (multi-face / proxy attempt). */
        val faceCount: Int,
        /** Per-frame ML Kit signals exposed for active-liveness challenges.
         *  Null means the classifier did not report a value. Yaw is in
         *  degrees: positive = head turned to the user's right (so the
         *  face appears toward the left of the front-camera mirror image). */
        val smilingProb: Float?,
        val leftEyeOpenProb: Float?,
        val rightEyeOpenProb: Float?,
        val headYawDeg: Float,
        val headPitchDeg: Float,
    )

    suspend fun detectLargest(image: InputImage, cropSource: Bitmap? = null): Result? {
        val faces = awaitDetect(image)
        val largest = faces.maxByOrNull { it.boundingBox.width().toLong() * it.boundingBox.height() }
            ?: return null
        val crop = cropSource?.let { safeCrop(it, largest.boundingBox) }
        return Result(
            face = largest,
            crop = crop,
            livenessScore = livenessOf(largest),
            faceCount = faces.size,
            smilingProb = largest.smilingProbability,
            leftEyeOpenProb = largest.leftEyeOpenProbability,
            rightEyeOpenProb = largest.rightEyeOpenProbability,
            headYawDeg = largest.headEulerAngleY,
            headPitchDeg = largest.headEulerAngleX,
        )
    }

    suspend fun detectLargest(source: Bitmap, rotationDegrees: Int = 0): Result? =
        detectLargest(InputImage.fromBitmap(source, rotationDegrees), source)

    private suspend fun awaitDetect(image: InputImage): List<Face> =
        suspendCancellableCoroutine { cont ->
            detector.process(image)
                .addOnSuccessListener { cont.resume(it) }
                .addOnFailureListener { cont.resumeWithException(it) }
        }

    /**
     * Cheap liveness heuristic: weighted blend of eye-open probabilities and
     * (1 - |head pose|). Real liveness arrives in Phase 2.
     */
    private fun livenessOf(face: Face): Double {
        val left = face.leftEyeOpenProbability ?: 0.5f
        val right = face.rightEyeOpenProbability ?: 0.5f
        val pose = 1f - (abs(face.headEulerAngleY) + abs(face.headEulerAngleX)) / 90f
        val eye = (left + right) / 2f
        return (eye * 0.6f + pose.coerceIn(0f, 1f) * 0.4f).toDouble().coerceIn(0.0, 1.0)
    }

    fun cropFace(src: Bitmap, box: Rect): Bitmap = safeCrop(src, box)

    private fun safeCrop(src: Bitmap, box: Rect): Bitmap {
        val side = max(box.width(), box.height())
        val padded = (side * 1.35f).toInt()
        val cx = box.centerX()
        val cy = box.centerY()
        val x = max(0, cx - padded / 2)
        val y = max(0, cy - padded / 2)
        val w = min(src.width - x, padded)
        val h = min(src.height - y, padded)
        return Bitmap.createBitmap(src, x, y, w, h)
    }
}
