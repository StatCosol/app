package com.statcosol.attendance.api

import kotlinx.serialization.Serializable

@Serializable
data class RecordPunchRequest(
    val embeddingB64: String,
    val embeddingModel: String? = null,
    val direction: String,
    val livenessNonce: String? = null,
    val livenessChallengeType: String? = null,
    val livenessScore: Double? = null,
    val photoB64: String? = null,
    val captureLat: Double? = null,
    val captureLng: Double? = null,
    val isMockLocation: Boolean? = null,
    val isRooted: Boolean? = null,
    val offlineSync: Boolean? = null,
    val punchTime: String? = null,
)

@Serializable
data class RecordPunchResponse(
    val ok: Boolean = false,
    val review: Boolean = false,
    val message: String? = null,
    val employeeName: String? = null,
    val employeeCode: String? = null,
    val direction: String? = null,
    val punchTime: String? = null,
)

@Serializable
data class LivenessChallengeRequest(
    val employeeId: String? = null,
    val offline: Boolean? = null,
)

@Serializable
data class LivenessChallengeResponse(
    val nonce: String,
    val challengeType: String,
    val expiresAt: String? = null,
)

@Serializable
data class KioskEnrollTicket(
    val id: String,
    val deviceId: String? = null,
    val subjectType: String? = null,
    val employeeId: String? = null,
    val contractorEmployeeId: String? = null,
    val subjectName: String? = null,
    val subjectCode: String? = null,
    val status: String? = null,
)

@Serializable
data class SubmitKioskTicketRequest(
    val ticketId: String,
    val embeddingFrames: List<String>,
    val embeddingModel: String? = null,
    val livenessNonce: String,
    val livenessChallengeType: String? = null,
    val photoB64: String? = null,
    val consentGiven: Boolean = true,
)

@Serializable
data class SubmitKioskTicketResponse(
    val ok: Boolean = false,
    val message: String? = null,
)
