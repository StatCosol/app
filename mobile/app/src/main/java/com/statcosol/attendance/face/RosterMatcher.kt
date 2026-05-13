package com.statcosol.attendance.face

import com.statcosol.attendance.api.RosterEntry

/**
 * Holds the decoded roster embeddings in memory and runs nearest-neighbour
 * matching for KIOSK 1:N identification.
 */
class RosterMatcher(roster: List<RosterEntry>) {

    data class Match(val entry: RosterEntry, val score: Double)

    private val entries: List<Pair<RosterEntry, FloatArray>> =
        roster.map { it to FaceEmbedder.decodeEmbeddingB64(it.embeddingB64) }

    /**
     * Returns the best match (cosine-derived score in 0..1) or null when no
     * candidate beats [minScore].
     */
    fun match(probe: FloatArray, minScore: Double = 0.78): Match? {
        var bestScore = -1.0
        var best: RosterEntry? = null
        for ((entry, emb) in entries) {
            val s = FaceEmbedder.toMatchScore(FaceEmbedder.cosineSimilarity(probe, emb))
            if (s > bestScore) {
                bestScore = s
                best = entry
            }
        }
        if (best == null || bestScore < minScore) return null
        return Match(best, bestScore)
    }

    /** ESS path: 1:1 verify against the bound employee. */
    fun verify(probe: FloatArray, employeeId: String, minScore: Double = 0.78): Match? {
        val target = entries.firstOrNull { it.first.employeeId == employeeId } ?: return null
        val s = FaceEmbedder.toMatchScore(FaceEmbedder.cosineSimilarity(probe, target.second))
        return if (s >= minScore) Match(target.first, s) else null
    }
}
