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
            .setMinFaceSize(0.25f)
            .build()
    )

    data class Result(val face: Face, val crop: Bitmap, val livenessScore: Double)

    suspend fun detectLargest(source: Bitmap, rotationDegrees: Int = 0): Result? {
        val image = InputImage.fromBitmap(source, rotationDegrees)
        val faces = awaitDetect(image)
        val largest = faces.maxByOrNull { it.boundingBox.width().toLong() * it.boundingBox.height() }
            ?: return null
        val crop = safeCrop(source, largest.boundingBox)
        return Result(face = largest, crop = crop, livenessScore = livenessOf(largest))
    }

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

    private fun safeCrop(src: Bitmap, box: Rect): Bitmap {
        val x = max(0, box.left)
        val y = max(0, box.top)
        val w = min(src.width - x, box.width())
        val h = min(src.height - y, box.height())
        return Bitmap.createBitmap(src, x, y, w, h)
    }
}
