package com.statcosol.attendance.face

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.YuvImage
import android.util.Base64
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.google.mlkit.vision.common.InputImage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

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
    private val onFace: suspend (
        probe: FloatArray,
        livenessScore: Double,
        facePhotoBase64: String?,
    ) -> Unit,
    private val onError: ((message: String) -> Unit)? = null,
    /** Fired for every analysed frame that contains exactly one face,
     *  before any embedding work. Used by the active-liveness challenge
     *  flow to track gestures (blink/smile/head-turn). */
    private val onFaceSignal: ((signal: FaceSignal) -> Unit)? = null,
) {
    private val detector = FaceDetector()
    private val embedder by lazy { FaceEmbedder(context) }
    private val analysisLock = Mutex()
    @Volatile private var analysisExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    @Volatile private var cameraProvider: ProcessCameraProvider? = null
    @Volatile private var modelMissing = false
    @Volatile private var lastErrorAt: Long = 0
    @Volatile private var lastHintAt: Long = 0
    @Volatile private var lastHintCode: String? = null
    @Volatile private var stopped = false

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
        stopped = false
        if (analysisExecutor.isShutdown) {
            analysisExecutor = Executors.newSingleThreadExecutor()
        }
        val provider = ProcessCameraProvider.getInstance(context)
        provider.addListener({
            if (stopped) return@addListener
            val cameraProvider = provider.get()
            this.cameraProvider = cameraProvider
            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(previewView.surfaceProvider)
            }
            val analyzer = ImageAnalysis.Builder()
                .setTargetResolution(Size(640, 480))
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
            analyzer.setAnalyzer(analysisExecutor) { proxy ->
                handleFrame(proxy)
            }
            cameraProvider.unbindAll()
            cameraProvider.bindToLifecycle(
                owner, CameraSelector.DEFAULT_FRONT_CAMERA, preview, analyzer
            )
        }, ContextCompat.getMainExecutor(context))
    }

    /** Release the front camera and analyzer. Safe to call multiple times.
     *  Without this, switching between Kiosk/Enroll screens or backgrounding
     *  the ESS punch flow can leave a stale binding that fights the next
     *  Activity for the camera. */
    fun stop() {
        stopped = true
        try {
            cameraProvider?.unbindAll()
        } catch (_: Throwable) { /* best-effort */ }
        analysisExecutor.shutdown()
        cameraProvider = null
    }

    private fun handleFrame(proxy: ImageProxy) {
        val rotation = proxy.imageInfo.rotationDegrees
        val mediaImage = proxy.image
        if (mediaImage == null) {
            proxy.close()
            return
        }

        scope.launch(Dispatchers.Default) {
            if (!analysisLock.tryLock()) {
                proxy.close()
                return@launch
            }
            try {
                // Quick luminance gate before running ML Kit. Cheap (avg of
                // every 64th pixel) so we can fail fast in dark conditions
                // and tell the user to step into the light.
                val lum = quickLuminance(proxy)
                if (lum < MIN_LUMINANCE) {
                    emitHint("hint:too_dim")
                    return@launch
                }

                val image = InputImage.fromMediaImage(mediaImage, rotation)
                val detection = detector.detectLargest(image)
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
                // Surface per-frame ML Kit signals so a caller-side liveness
                // challenge tracker can observe blink / smile / head-turn
                // without needing its own analyzer.
                onFaceSignal?.invoke(
                    FaceSignal(
                        smilingProb = detection.smilingProb,
                        leftEyeOpenProb = detection.leftEyeOpenProb,
                        rightEyeOpenProb = detection.rightEyeOpenProb,
                        headYawDeg = detection.headYawDeg,
                        headPitchDeg = detection.headPitchDeg,
                    )
                )
                if (
                    kotlin.math.abs(detection.headYawDeg) > MAX_EMBED_YAW_DEG ||
                    kotlin.math.abs(detection.headPitchDeg) > MAX_EMBED_PITCH_DEG
                ) {
                    emitHint("hint:not_straight")
                    return@launch
                }
                // Face area ratio gate. Below MIN_FACE_AREA_RATIO of the
                // frame the worker is too far away → embeddings are noisy
                // and matches degrade quickly.
                val faceBox = detection.face.boundingBox
                val frameWidth = if (rotation == 90 || rotation == 270) proxy.height else proxy.width
                val frameHeight = if (rotation == 90 || rotation == 270) proxy.width else proxy.height
                val areaRatio = (faceBox.width().toDouble() * faceBox.height()) /
                        (frameWidth.toDouble() * frameHeight)
                if (areaRatio < MIN_FACE_AREA_RATIO) {
                    emitHint("hint:too_small")
                    return@launch
                }
                val bitmap = proxy.toBitmap().rotated(rotation)
                val crop = detector.cropFace(bitmap, faceBox)
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
                    embedder.embed(crop)
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
                onFace(embedding, detection.livenessScore, crop.toJpegBase64())
            } finally {
                analysisLock.unlock()
                proxy.close()
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

    private fun Bitmap.toJpegBase64(): String {
        val out = ByteArrayOutputStream()
        compress(Bitmap.CompressFormat.JPEG, 88, out)
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }

    private fun yuv420ToNv21(image: ImageProxy): ByteArray {
        val width = image.width
        val height = image.height
        val nv21 = ByteArray(width * height * 3 / 2)

        val yPlane = image.planes[0]
        val uPlane = image.planes[1]
        val vPlane = image.planes[2]
        val yBuffer: ByteBuffer = yPlane.buffer
        val uBuffer: ByteBuffer = uPlane.buffer
        val vBuffer: ByteBuffer = vPlane.buffer

        var out = 0
        for (row in 0 until height) {
            val rowStart = row * yPlane.rowStride
            if (yPlane.pixelStride == 1) {
                yBuffer.position(rowStart)
                yBuffer.get(nv21, out, width)
                out += width
            } else {
                for (col in 0 until width) {
                    nv21[out++] = yBuffer.get(rowStart + col * yPlane.pixelStride)
                }
            }
        }

        val chromaWidth = width / 2
        val chromaHeight = height / 2
        // Guard against rare OEM layouts where the chroma planes are smaller
        // than width*height/4 (e.g. cropped sensors, MediaTek YUV oddities).
        // Reading past `remaining()` would either ArrayIndexOutOfBoundsException
        // or splice in stale bytes from an adjacent allocation. If the planes
        // are too small, leave the chroma block zeroed → grayscale-ish frame
        // that ML Kit can still detect a face in.
        val uNeeded = (chromaHeight - 1) * uPlane.rowStride +
            (chromaWidth - 1) * uPlane.pixelStride + 1
        val vNeeded = (chromaHeight - 1) * vPlane.rowStride +
            (chromaWidth - 1) * vPlane.pixelStride + 1
        if (uBuffer.limit() < uNeeded || vBuffer.limit() < vNeeded) {
            return nv21
        }
        for (row in 0 until chromaHeight) {
            val uRowStart = row * uPlane.rowStride
            val vRowStart = row * vPlane.rowStride
            for (col in 0 until chromaWidth) {
                // NV21 stores chroma as VU pairs. CameraX planes often have
                // row/pixel padding, so copying remaining() bytes directly can
                // corrupt crops and make enrolled faces fail to match later.
                nv21[out++] = vBuffer.get(vRowStart + col * vPlane.pixelStride)
                nv21[out++] = uBuffer.get(uRowStart + col * uPlane.pixelStride)
            }
        }
        return nv21
    }

    /** Cheap mean-luma estimate from the camera Y plane. Avoids building a
     *  Bitmap for frames that are too dark to use. */
    private fun quickLuminance(image: ImageProxy): Double {
        val plane = image.planes[0]
        val buffer = plane.buffer
        var sum = 0L
        var n = 0
        val step = 16
        var y = 0
        while (y < image.height) {
            var x = 0
            while (x < image.width) {
                val idx = y * plane.rowStride + x * plane.pixelStride
                if (idx < buffer.limit()) {
                    sum += buffer.get(idx).toInt() and 0xFF
                }
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
        private const val MAX_EMBED_YAW_DEG = 18f
        private const val MAX_EMBED_PITCH_DEG = 15f
    }
}

/**
 * Per-frame ML Kit signals exposed to the active-liveness challenge layer.
 * All probabilities are 0..1 (or null when ML Kit could not classify).
 * `headYawDeg` is positive when the user turns to their right (so the face
 * in the front-camera mirror image moves toward the LEFT side of the screen).
 */
data class FaceSignal(
    val smilingProb: Float?,
    val leftEyeOpenProb: Float?,
    val rightEyeOpenProb: Float?,
    val headYawDeg: Float,
    val headPitchDeg: Float,
)
