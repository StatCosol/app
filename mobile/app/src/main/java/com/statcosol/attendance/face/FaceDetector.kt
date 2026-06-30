package com.statcosol.attendance.face

import androidx.camera.core.ImageProxy
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetector
import com.google.mlkit.vision.face.FaceDetectorOptions
import kotlinx.coroutines.tasks.await

class FaceDetector {

    private val options = FaceDetectorOptions.Builder()
        .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
        .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
        .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
        // Tracking disabled: ML Kit skips classification on tracked frames, causing
        // eyeOpenProbability to return null and breaking BLINK liveness checks.
        .build()

    private val detector: FaceDetector = FaceDetection.getClient(options)

    @androidx.camera.core.ExperimentalGetImage
    suspend fun detect(imageProxy: ImageProxy): List<Face> {
        val mediaImage = imageProxy.image ?: return emptyList()
        val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
        return detector.process(image).await()
    }

    fun close() = detector.close()
}
