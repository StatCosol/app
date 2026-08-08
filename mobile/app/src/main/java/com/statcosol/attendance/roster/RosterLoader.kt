package com.statcosol.attendance.roster

import com.statcosol.attendance.face.FaceEmbedder
import com.statcosol.attendance.face.RosterMatcher
import com.statcosol.attendance.prefs.DeviceConfig

object RosterLoader {

    fun buildMatcher(config: DeviceConfig, response: RosterResponse): RosterMatcher {
        config.applyRosterResponse(response)
        val installToken = config.installToken
        val rosterDeviceId = config.rosterDeviceId
        require(rosterDeviceId.isNotBlank()) { "roster device id missing — re-fetch roster" }
        require(installToken.isNotBlank()) { "install token missing" }

        val entries = response.enrollments.map { enrollment ->
            val floats = when (response.format) {
                "encrypted-v1" -> {
                    val cipher = enrollment.embeddingCipherB64
                        ?: throw IllegalStateException("missing embeddingCipherB64")
                    RosterCrypto.decryptEmbeddingFloats(rosterDeviceId, installToken, cipher)
                }
                "plain-v1" -> {
                    val plain = enrollment.embeddingB64
                        ?: throw IllegalStateException("missing embeddingB64")
                    FaceEmbedder.decodeEmbeddingB64(plain)
                }
                else -> throw IllegalStateException("unsupported roster format: ${response.format}")
            }
            RosterMatcher.Entry(
                subjectId = enrollment.employeeId,
                displayName = enrollment.displayName,
                embeddingModel = enrollment.embeddingModel,
                embedding = floats,
            )
        }
        return RosterMatcher(entries)
    }
}
