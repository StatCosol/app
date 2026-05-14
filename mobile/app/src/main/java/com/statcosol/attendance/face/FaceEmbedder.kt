package com.statcosol.attendance.face

import android.content.Context
import android.graphics.Bitmap
import android.util.Base64
import org.tensorflow.lite.DataType
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.support.image.TensorImage
import org.tensorflow.lite.support.image.ops.ResizeOp
import org.tensorflow.lite.support.image.ImageProcessor
import java.io.FileInputStream
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel
import kotlin.math.sqrt

/**
 * MobileFaceNet wrapper. Expects a 112×112 RGB face crop in -> 192-D L2-normalised
 * embedding out. Drop the model file at `app/src/main/assets/mobilefacenet.tflite`.
 *
 * Until the model is shipped, [embed] will throw — callers should treat that as
 * a "no embedding" error and surface it in setup logs.
 */
class FaceEmbedder(context: Context) {

    private val interpreter: Interpreter by lazy {
        val mapped = loadModel(context, "mobilefacenet.tflite")
        Interpreter(mapped)
    }

    /** Read once: some MobileFaceNet TFLite builds expect FLOAT32 input, others UINT8. */
    private val inputDataType: DataType by lazy { interpreter.getInputTensor(0).dataType() }

    private val processor: ImageProcessor by lazy {
        ImageProcessor.Builder()
            .add(ResizeOp(INPUT_SIZE, INPUT_SIZE, ResizeOp.ResizeMethod.BILINEAR))
            .build()
    }

    fun embed(face: Bitmap): FloatArray {
        // TFLite needs ARGB_8888; some upstream sources hand us RGB_565 or HARDWARE bitmaps.
        val rgba = if (face.config == Bitmap.Config.ARGB_8888) face
                   else face.copy(Bitmap.Config.ARGB_8888, false)
        // TensorImage(dtype) lazily casts uint8 pixels to FLOAT32 when the model demands it,
        // matching the dtype-aware behaviour of face-svc/app/main.py.
        val tensor = TensorImage(inputDataType).apply { load(rgba) }
        val processed = processor.process(tensor)
        val out = Array(1) { FloatArray(EMBED_DIM) }
        interpreter.run(processed.buffer, out)
        return l2Normalize(out[0])
    }

    private fun loadModel(ctx: Context, asset: String): MappedByteBuffer {
        ctx.assets.openFd(asset).use { fd ->
            FileInputStream(fd.fileDescriptor).use { fis ->
                return fis.channel.map(FileChannel.MapMode.READ_ONLY, fd.startOffset, fd.declaredLength)
            }
        }
    }

    companion object {
        const val INPUT_SIZE = 112
        const val EMBED_DIM = 192

        fun l2Normalize(v: FloatArray): FloatArray {
            var s = 0.0
            for (x in v) s += x * x
            val n = sqrt(s).toFloat().coerceAtLeast(1e-9f)
            val out = FloatArray(v.size)
            for (i in v.indices) out[i] = v[i] / n
            return out
        }

        /** Cosine similarity for two L2-normalised vectors equals the dot product, in [-1,1]. */
        fun cosineSimilarity(a: FloatArray, b: FloatArray): Float {
            require(a.size == b.size) { "embedding dim mismatch" }
            var d = 0f
            for (i in a.indices) d += a[i] * b[i]
            return d
        }

        /** Map cosine into [0,1] for our backend's matchScore field. */
        fun toMatchScore(cos: Float): Double = ((cos + 1f) / 2f).toDouble()

        /** Server expects bytes; embeddings are stored as base64 in the roster JSON. */
        fun decodeEmbeddingB64(b64: String): FloatArray {
            val bytes = Base64.decode(b64, Base64.DEFAULT)
            val floats = FloatArray(bytes.size / 4)
            val bb = java.nio.ByteBuffer.wrap(bytes).order(java.nio.ByteOrder.LITTLE_ENDIAN)
            for (i in floats.indices) floats[i] = bb.float
            return floats
        }
    }
}
