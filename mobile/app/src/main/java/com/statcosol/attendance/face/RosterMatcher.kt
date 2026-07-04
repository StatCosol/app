package com.statcosol.attendance.face

import com.statcosol.attendance.api.RosterEntry
import kotlin.math.sqrt

data class MatchResult(
    val employeeId: String,
    val displayName: String,
    val score: Double,
    val secondBestScore: Double,
    val margin: Double,
)

class RosterMatcher {

    @Volatile
    private var entries: List<Pair<RosterEntry, FloatArray>> = emptyList()

    fun load(newEntries: List<RosterEntry>) {
        val parsed = newEntries.mapNotNull { entry ->
            val embedding = decodeEmbedding(entry.embeddingB64) ?: return@mapNotNull null
            entry to embedding
        }
        synchronized(this) { entries = parsed }
    }

    fun match(probe: FloatArray): MatchResult? {
        val snapshot = synchronized(this) { entries.toList() }
        if (snapshot.isEmpty()) return null

        val scores = snapshot.map { (entry, embedding) ->
            entry to cosineSim(probe, embedding)
        }.sortedByDescending { it.second }

        val best = scores[0]
        val secondBest = scores.getOrNull(1)?.second ?: 0.0
        val margin = best.second - secondBest
        val requiredThreshold = if (snapshot.size <= 1) {
            SINGLE_ENTRY_MATCH_THRESHOLD
        } else {
            MATCH_THRESHOLD
        }

        if (best.second < requiredThreshold) return null
        if (margin < MARGIN_THRESHOLD) return null

        return MatchResult(
            employeeId = best.first.employeeId,
            displayName = best.first.displayName,
            score = best.second,
            secondBestScore = secondBest,
            margin = margin,
        )
    }

    private fun decodeEmbedding(b64: String): FloatArray? {
        return try {
            val bytes = android.util.Base64.decode(b64, android.util.Base64.NO_WRAP)
            val buffer = java.nio.ByteBuffer.wrap(bytes).apply {
                order(java.nio.ByteOrder.LITTLE_ENDIAN)
            }
            FloatArray(bytes.size / 4) { buffer.float }
        } catch (e: Exception) {
            null
        }
    }

    companion object {
        // MobileFaceNet real-world same-person cosine similarity is ~0.70-0.87.
        // A one-person gallery needs a stricter threshold because there is no
        // second-best candidate for margin separation.
        private const val MATCH_THRESHOLD = 0.78
        private const val SINGLE_ENTRY_MATCH_THRESHOLD = 0.82
        private const val MARGIN_THRESHOLD = 0.06

        fun cosineSim(a: FloatArray, b: FloatArray): Double {
            var dot = 0.0
            var normA = 0.0
            var normB = 0.0
            val len = minOf(a.size, b.size)
            for (i in 0 until len) {
                dot += a[i] * b[i]
                normA += a[i] * a[i]
                normB += b[i] * b[i]
            }
            val denom = sqrt(normA) * sqrt(normB)
            return if (denom == 0.0) 0.0 else dot / denom
        }
    }
}
