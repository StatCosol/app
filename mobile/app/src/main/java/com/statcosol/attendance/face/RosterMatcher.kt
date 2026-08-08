package com.statcosol.attendance.face

import android.util.Log

/**
 * In-memory 1:N matcher for the V1 offline kiosk path.
 */
class RosterMatcher(entries: List<Entry>) {

    data class Entry(
        val subjectId: String,
        val displayName: String,
        val embeddingModel: String = "",
        val embedding: FloatArray,
    )

    data class Match(val entry: Entry, val score: Double)

    private val roster: List<Entry> = entries

    init {
        Log.i(TAG, "RosterMatcher loaded ${roster.size} enrollments")
    }

    fun match(
        probe: FloatArray,
        minScore: Double = 0.78,
        minMargin: Double = 0.04,
    ): Match? {
        if (roster.isEmpty()) {
            Log.w(TAG, "match() called with empty roster")
            return null
        }
        val scored = roster.map { entry ->
            entry to FaceEmbedder.toMatchScore(FaceEmbedder.cosineSimilarity(probe, entry.embedding))
        }.sortedByDescending { it.second }

        val topLog = scored.take(3).joinToString(", ") { (e, s) ->
            "${e.displayName.take(12)}=${"%.3f".format(s)}"
        }
        val (bestEntry, bestScore) = scored.first()
        if (bestScore < minScore) {
            Log.i(TAG, "match REJECT (best=${"%.3f".format(bestScore)} < $minScore) top: $topLog")
            return null
        }
        if (scored.size >= 2) {
            val margin = bestScore - scored[1].second
            if (margin < minMargin) {
                Log.i(TAG, "match REJECT (ambiguous margin=${"%.3f".format(margin)} < $minMargin) top: $topLog")
                return null
            }
        }
        Log.i(TAG, "match OK ${bestEntry.displayName} score=${"%.3f".format(bestScore)} top: $topLog")
        return Match(bestEntry, bestScore)
    }

    companion object {
        private const val TAG = "FaceMatch"
    }
}
