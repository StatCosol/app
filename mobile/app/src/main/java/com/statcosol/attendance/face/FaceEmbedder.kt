package com.statcosol.attendance.face

import android.content.Context
import android.graphics.Bitmap
import android.util.Base64
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel
import kotlin.math.sqrt

class FaceEmbedder(context: Context) {

    private val interpreter: Interpreter

    init {
        val model = loadModelFile(context)
        val options = Interpreter.Options().apply {
            setNumThreads(2)
        }
        interpreter = Interpreter(model, options)
    }

    private fun loadModelFile(context: Context): MappedByteBuffer {
        val assetFileDescriptor = context.assets.openFd(MODEL_FILENAME)
        val inputStream = FileInputStream(assetFileDescriptor.fileDescriptor)
        val fileChannel = inputStream.channel
        return fileChannel.map(
            FileChannel.MapMode.READ_ONLY,
            assetFileDescriptor.startOffset,
            assetFileDescriptor.declaredLength,
        )
    }

    fun embed(bitmap: Bitmap): FloatArray {
        val resized = Bitmap.createScaledBitmap(bitmap, INPUT_SIZE, INPUT_SIZE, true)
        val inputBuffer = ByteBuffer.allocateDirect(1 * INPUT_SIZE * INPUT_SIZE * 3 * 4).apply {
            order(ByteOrder.nativeOrder())
            rewind()
        }

        val pixels = IntArray(INPUT_SIZE * INPUT_SIZE)
        resized.getPixels(pixels, 0, INPUT_SIZE, 0, 0, INPUT_SIZE, INPUT_SIZE)

        for (pixel in pixels) {
            val r = ((pixel shr 16) and 0xFF) / 128f - 1f
            val g = ((pixel shr 8) and 0xFF) / 128f - 1f
            val b = (pixel and 0xFF) / 128f - 1f
            inputBuffer.putFloat(r)
            inputBuffer.putFloat(g)
            inputBuffer.putFloat(b)
        }

        inputBuffer.rewind()

        val output = Array(1) { FloatArray(EMBEDDING_SIZE) }
        interpreter.run(inputBuffer, output)

        val embedding = output[0]
        return l2Normalize(embedding)
    }

    private fun l2Normalize(vector: FloatArray): FloatArray {
        val norm = sqrt(vector.fold(0f) { acc, v -> acc + v * v })
        return if (norm > 0f) FloatArray(vector.size) { vector[it] / norm } else vector
    }

    fun toBase64(embedding: FloatArray): String {
        val buffer = ByteBuffer.allocate(embedding.size * 4).apply {
            order(ByteOrder.LITTLE_ENDIAN)
            embedding.forEach { putFloat(it) }
            rewind()
        }
        val bytes = ByteArray(buffer.remaining())
        buffer.get(bytes)
        return Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

    fun close() = interpreter.close()

    companion object {
        private const val MODEL_FILENAME = "mobilefacenet.tflite"
        private const val INPUT_SIZE = 112
        private const val EMBEDDING_SIZE = 192

        fun warmup(context: Context) {
            FaceEmbedder(context).close()
        }

        fun cosineSimilarity(a: FloatArray, b: FloatArray): Float {
            require(a.size == b.size) { "embedding dim mismatch" }
            var d = 0f
            for (i in a.indices) d += a[i] * b[i]
            return d
        }

        fun toMatchScore(cos: Float): Double = ((cos + 1f) / 2f).toDouble()

        fun decodeEmbeddingB64(b64: String): FloatArray {
            val bytes = Base64.decode(b64, Base64.NO_WRAP)
            val floats = FloatArray(bytes.size / 4)
            val bb = java.nio.ByteBuffer.wrap(bytes).order(java.nio.ByteOrder.LITTLE_ENDIAN)
            for (i in floats.indices) floats[i] = bb.float
            return floats
        }

        fun encodeEmbeddingB64(emb: FloatArray): String {
            val bb = java.nio.ByteBuffer.allocate(emb.size * 4).order(java.nio.ByteOrder.LITTLE_ENDIAN)
            for (v in emb) bb.putFloat(v)
            return Base64.encodeToString(bb.array(), Base64.NO_WRAP)
        }
    }
}
