package com.statcosol.attendance.face

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.YuvImage
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

/**
 * Shared front-camera session. Binds CameraX to a [PreviewView] and forwards
 * each analysed frame (largest face + crop + liveness) to [onFace].
 *
 * The [FaceEmbedder] and [FaceDetector] are instantiated once per session so
 * the TFLite interpreter is loaded a single time, not per frame.
 */
class FaceCaptureSession(
    private val context: Context,
    private val owner: LifecycleOwner,
    private val previewView: PreviewView,
    private val scope: CoroutineScope,
    private val onFace: suspend (probe: FloatArray, livenessScore: Double) -> Unit,
    private val onError: ((message: String) -> Unit)? = null,
) {
    private val detector = FaceDetector()
    private val embedder by lazy { FaceEmbedder(context) }
    private val analysisLock = Mutex()
    @Volatile private var modelMissing = false
    @Volatile private var lastErrorAt: Long = 0

    fun start() {
        val provider = ProcessCameraProvider.getInstance(context)
        provider.addListener({
            val cameraProvider = provider.get()
            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(previewView.surfaceProvider)
            }
            val analyzer = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
            analyzer.setAnalyzer(ContextCompat.getMainExecutor(context)) { proxy ->
                handleFrame(proxy)
            }
            cameraProvider.unbindAll()
            cameraProvider.bindToLifecycle(
                owner, CameraSelector.DEFAULT_FRONT_CAMERA, preview, analyzer
            )
        }, ContextCompat.getMainExecutor(context))
    }

    private fun handleFrame(proxy: ImageProxy) {
        val rotation = proxy.imageInfo.rotationDegrees
        val bitmap = proxy.toBitmap().rotated(rotation)
        proxy.close()

        scope.launch {
            if (!analysisLock.tryLock()) return@launch
            try {
                val detection = detector.detectLargest(bitmap, rotationDegrees = 0) ?: return@launch
                if (modelMissing) {
                    // Don't keep retrying once we know the asset is absent;
                    // re-emit the message at most once every 5s so the UI keeps it visible.
                    val now = System.currentTimeMillis()
                    if (now - lastErrorAt > 5_000) {
                        lastErrorAt = now
                        onError?.invoke("face_model_missing")
                    }
                    return@launch
                }
                val embedding = try {
                    embedder.embed(detection.crop)
                } catch (e: java.io.FileNotFoundException) {
                    modelMissing = true
                    lastErrorAt = System.currentTimeMillis()
                    onError?.invoke("face_model_missing")
                    return@launch
                } catch (e: Exception) {
                    val now = System.currentTimeMillis()
                    if (now - lastErrorAt > 5_000) {
                        lastErrorAt = now
                        onError?.invoke("face_embed_failed:${e.javaClass.simpleName}")
                    }
                    return@launch
                }
                onFace(embedding, detection.livenessScore)
            } finally {
                analysisLock.unlock()
            }
        }
    }

    private fun ImageProxy.toBitmap(): Bitmap {
        val nv21 = yuv420ToNv21(this)
        val yuv = YuvImage(nv21, ImageFormat.NV21, width, height, null)
        val out = ByteArrayOutputStream()
        yuv.compressToJpeg(Rect(0, 0, width, height), 90, out)
        val bytes = out.toByteArray()
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    }

    private fun Bitmap.rotated(deg: Int): Bitmap {
        if (deg == 0) return this
        val m = Matrix().apply { postRotate(deg.toFloat()) }
        return Bitmap.createBitmap(this, 0, 0, width, height, m, true)
    }

    private fun yuv420ToNv21(image: ImageProxy): ByteArray {
        val yBuffer: ByteBuffer = image.planes[0].buffer
        val uBuffer: ByteBuffer = image.planes[1].buffer
        val vBuffer: ByteBuffer = image.planes[2].buffer
        val ySize = yBuffer.remaining()
        val uSize = uBuffer.remaining()
        val vSize = vBuffer.remaining()
        val nv21 = ByteArray(ySize + uSize + vSize)
        yBuffer.get(nv21, 0, ySize)
        vBuffer.get(nv21, ySize, vSize)
        uBuffer.get(nv21, ySize + vSize, uSize)
        return nv21
    }
}
