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
    @Volatile private var lastHintAt: Long = 0
    @Volatile private var lastHintCode: String? = null

    /** Emit a hint code (e.g. "hint:too_small") at most once per HINT_INTERVAL_MS,
     *  and never the same code back-to-back, so the kiosk doesn't flicker. */
    private fun emitHint(code: String) {
        val now = System.currentTimeMillis()
        if (code == lastHintCode && now - lastHintAt < HINT_INTERVAL_MS) return
        lastHintCode = code
        lastHintAt = now
        onError?.invoke(code)
    }

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
                // Quick luminance gate before running ML Kit. Cheap (avg of
                // every 64th pixel) so we can fail fast in dark conditions
                // and tell the user to step into the light.
                val lum = quickLuminance(bitmap)
                if (lum < MIN_LUMINANCE) {
                    emitHint("hint:too_dim")
                    return@launch
                }

                val detection = detector.detectLargest(bitmap, rotationDegrees = 0)
                if (detection == null) {
                    emitHint("hint:no_face")
                    return@launch
                }
                if (detection.faceCount > 1) {
                    // Multi-face frame: refuse to embed/match. Surfaced to
                    // the UI via onError so the user knows to step away
                    // from anyone else in the camera view (anti-proxy).
                    val now = System.currentTimeMillis()
                    if (now - lastErrorAt > 1_500) {
                        lastErrorAt = now
                        onError?.invoke("multiple_faces:${detection.faceCount}")
                    }
                    return@launch
                }
                // Face area ratio gate. Below MIN_FACE_AREA_RATIO of the
                // frame the worker is too far away → embeddings are noisy
                // and matches degrade quickly.
                val faceBox = detection.face.boundingBox
                val areaRatio = (faceBox.width().toDouble() * faceBox.height()) /
                        (bitmap.width.toDouble() * bitmap.height)
                if (areaRatio < MIN_FACE_AREA_RATIO) {
                    emitHint("hint:too_small")
                    return@launch
                }
                // Clear any stale hint now that we're about to do real work.
                lastHintCode = null
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
                        val msg = (e.message ?: "").take(120)
                        onError?.invoke("face_embed_failed:${e.javaClass.simpleName}: $msg")
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

    /** Cheap mean-luma estimate. Samples every 64th pixel of the bitmap and
     *  computes the BT.601 luma. Good enough as a "is it pitch dark" gate. */
    private fun quickLuminance(bm: Bitmap): Double {
        var sum = 0L
        var n = 0
        val step = 8
        var y = 0
        while (y < bm.height) {
            var x = 0
            while (x < bm.width) {
                val p = bm.getPixel(x, y)
                val r = (p shr 16) and 0xFF
                val g = (p shr 8) and 0xFF
                val b = p and 0xFF
                // BT.601 luma
                sum += (0.299 * r + 0.587 * g + 0.114 * b).toLong()
                n++
                x += step
            }
            y += step
        }
        return if (n > 0) sum.toDouble() / n else 0.0
    }

    companion object {
        /** Don't re-emit the same hint more often than this. */
        private const val HINT_INTERVAL_MS = 1_200L

        /** Below this average luma the frame is too dark for reliable
         *  face matching. Tuned for indoor factory lighting; daytime
         *  outdoor frames will be 100+. */
        private const val MIN_LUMINANCE = 55.0

        /** Face must occupy at least this fraction of the camera frame
         *  to be considered close enough for a confident embedding. */
        private const val MIN_FACE_AREA_RATIO = 0.06
    }
}
