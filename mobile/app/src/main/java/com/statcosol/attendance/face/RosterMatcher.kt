package com.statcosol.attendance.face

import android.util.Log
import com.statcosol.attendance.api.ContractorRosterEntry
import com.statcosol.attendance.api.RosterEntry

/**
 * Holds the decoded roster embeddings in memory and runs nearest-neighbour
 * matching for KIOSK 1:N identification.
 */
class RosterMatcher(
    roster: List<RosterEntry>,
    contractorRoster: List<ContractorRosterEntry> = emptyList(),
) {

    data class MatchEntry(
        val subjectType: String,
        val employeeId: String?,
        val contractorEmployeeId: String?,
        val employeeCode: String,
        val displayName: String,
        val embeddingB64: String,
    ) {
        val subjectKey: String
            get() = if (subjectType == "CONTRACTOR") {
                "CONTRACTOR:${contractorEmployeeId.orEmpty()}"
            } else {
                "EMPLOYEE:${employeeId.orEmpty()}"
            }
    }

    data class Match(val entry: MatchEntry, val score: Double)

    private val entries: List<Pair<MatchEntry, FloatArray>> =
        roster.map {
            MatchEntry(
                subjectType = "EMPLOYEE",
                employeeId = it.employeeId,
                contractorEmployeeId = null,
                employeeCode = it.employeeCode,
                displayName = it.displayName,
                embeddingB64 = it.embeddingB64,
            )
        }.plus(
            contractorRoster.map {
                MatchEntry(
                    subjectType = "CONTRACTOR",
                    employeeId = null,
                    contractorEmployeeId = it.contractorEmployeeId,
                    employeeCode = "",
                    displayName = it.displayName,
                    embeddingB64 = it.embeddingB64,
                )
            }
        ).map { it to FaceEmbedder.decodeEmbeddingB64(it.embeddingB64) }

    init {
        Log.i(TAG, "RosterMatcher loaded ${entries.size} enrollments")
    }

    /**
     * Returns the best match (cosine-derived score in 0..1) or null when no
     * candidate beats [minScore]. Always logs the top-3 candidates so we can
     * diagnose false negatives in production logs (logcat tag: FaceMatch).
     *
     * In addition to the absolute [minScore] gate, the 1:N kiosk path also
     * enforces an ambiguity margin: the best score must beat the 2nd-best
     * by at least [minMargin]. Without this, a probe that scores ~0.79 on
     * three different roster entries gets silently bound to whichever one
     * happens to win by a hair of noise — i.e. the wrong person is accepted.
     */
    fun match(
        probe: FloatArray,
        minScore: Double = 0.90,
        minMargin: Double = 0.08,
    ): Match? {
        if (entries.isEmpty()) {
            Log.w(TAG, "match() called with empty roster")
            return null
        }
        // Score every candidate, then sort descending so we can log the top-3.
        val scored = entries.map { (entry, emb) ->
            entry to FaceEmbedder.toMatchScore(FaceEmbedder.cosineSimilarity(probe, emb))
        }.sortedByDescending { it.second }

        val topLog = scored.take(3).joinToString(", ") { (e, s) ->
            "${e.employeeCode.ifBlank { e.contractorEmployeeId?.take(6) ?: e.employeeId?.take(6).orEmpty() }}=${"%.3f".format(s)}"
        }
        val (bestEntry, bestScore) = scored.first()
        if (bestScore < minScore) {
            Log.i(TAG, "match REJECT (best=${"%.3f".format(bestScore)} < $minScore) top: $topLog")
            return null
        }
        // Ambiguity guard: require a clear winner over the runner-up.
        if (scored.size >= 2) {
            val secondScore = scored[1].second
            val margin = bestScore - secondScore
            if (margin < minMargin) {
                Log.i(
                    TAG,
                    "match REJECT (ambiguous margin=${"%.3f".format(margin)} < $minMargin) top: $topLog",
                )
                return null
            }
        }
        Log.i(TAG, "match OK ${bestEntry.employeeCode.ifBlank { bestEntry.subjectKey }} score=${"%.3f".format(bestScore)} top: $topLog")
        return Match(bestEntry, bestScore)
    }

    /** ESS path: 1:1 verify against the bound employee. */
    fun verify(probe: FloatArray, employeeId: String, minScore: Double = 0.90): Match? {
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
