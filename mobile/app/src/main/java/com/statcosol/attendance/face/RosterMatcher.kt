package com.statcosol.attendance.face

import android.util.Log
import com.statcosol.attendance.api.RosterEntry

/**
 * Holds the decoded roster embeddings in memory and runs nearest-neighbour
 * matching for KIOSK 1:N identification.
 */
class RosterMatcher(roster: List<RosterEntry>) {

    data class Match(val entry: RosterEntry, val score: Double)

    private val entries: List<Pair<RosterEntry, FloatArray>> =
        roster.map { it to FaceEmbedder.decodeEmbeddingB64(it.embeddingB64) }

    init {
        Log.i(TAG, "RosterMatcher loaded ${entries.size} enrollments")
    }

    /**
     * Returns the best match (cosine-derived score in 0..1) or null when no
     * candidate beats [minScore]. Always logs the top-3 candidates so we can
     * diagnose false negatives in production logs (logcat tag: FaceMatch).
     */
    fun match(probe: FloatArray, minScore: Double = 0.70): Match? {
        if (entries.isEmpty()) {
            Log.w(TAG, "match() called with empty roster")
            return null
        }
        // Score every candidate, then sort descending so we can log the top-3.
        val scored = entries.map { (entry, emb) ->
            entry to FaceEmbedder.toMatchScore(FaceEmbedder.cosineSimilarity(probe, emb))
        }.sortedByDescending { it.second }

        val topLog = scored.take(3).joinToString(", ") { (e, s) ->
            "${e.employeeCode.ifBlank { e.employeeId.take(6) }}=${"%.3f".format(s)}"
        }
        val (bestEntry, bestScore) = scored.first()
        if (bestScore < minScore) {
            Log.i(TAG, "match REJECT (best=${"%.3f".format(bestScore)} < $minScore) top: $topLog")
            return null
        }
        Log.i(TAG, "match OK ${bestEntry.employeeCode} score=${"%.3f".format(bestScore)} top: $topLog")
        return Match(bestEntry, bestScore)
    }

    /** ESS path: 1:1 verify against the bound employee. */
    fun verify(probe: FloatArray, employeeId: String, minScore: Double = 0.70): Match? {
        val target = entries.firstOrNull { it.first.employeeId == employeeId } ?: run {
            Log.w(TAG, "verify: bound employee $employeeId not in roster (size=${entries.size})")
            return null
        }
        val s = FaceEmbedder.toMatchScore(FaceEmbedder.cosineSimilarity(probe, target.second))
        if (s < minScore) {
            Log.i(TAG, "verify REJECT ${target.first.employeeCode} score=${"%.3f".format(s)} < $minScore")
            return null
        }
        Log.i(TAG, "verify OK ${target.first.employeeCode} score=${"%.3f".format(s)}")
        return Match(target.first, s)
    }

    companion object {
        private const val TAG = "FaceMatch"
    }
}
