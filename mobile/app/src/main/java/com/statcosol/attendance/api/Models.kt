package com.statcosol.attendance.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class RegisterDeviceRequest(
    val installToken: String,
    val androidId: String,
    val deviceName: String,
)

@Serializable
data class RegisterDeviceResponse(
    val deviceToken: String,
    val deviceId: String,
    val mode: String,
    val clientId: String,
    @SerialName("branchId") val branchId: String? = null,
)

@Serializable
data class RosterEntry(
    val employeeId: String,
    val displayName: String,
    val embeddingB64: String,
    val embeddingModel: String,
)

@Serializable
data class RosterResponse(
    val enrollments: List<RosterEntry>,
)

@Serializable
data class LivenessChallengeRequest(
    val employeeId: String? = null,
)

@Serializable
data class LivenessChallengeResponse(
    val nonce: String,
    val challengeType: String,
)

@Serializable
data class MobilePunchRequest(
    val embeddingB64: String,          // field name must match RecordPunchDto
    val embeddingModel: String,
    val livenessScore: Double,
    val livenessChallengeType: String,
    val livenessNonce: String,
    val direction: String,
    val punchTime: String,
    val photoB64: String? = null,
    val captureLat: Double? = null,
    val captureLng: Double? = null,
    val isMockLocation: Boolean,
    val isRooted: Boolean,
    val offlineSync: Boolean,
)

@Serializable
data class MobilePunchResponse(
    val ok: Boolean,
    val employeeCode: String,
    val employeeName: String,
    val direction: String,
    val punchTime: String,
)

@Serializable
data class KioskEnrollTicketResponse(
    val id: String,
    val subjectType: String,
    val employeeId: String? = null,
    val contractorEmployeeId: String? = null,
    val subjectName: String,
    val subjectCode: String? = null,
    val status: String,
    val expiresAt: String,
)

@Serializable
data class SubmitKioskEnrollRequest(
    val ticketId: String,              // required by SubmitKioskTicketDto
    val embeddingFrames: List<String>, // list of per-frame base64 embeddings
    val embeddingModel: String? = null,
    val livenessNonce: String,
    val livenessChallengeType: String,
    val consentGiven: Boolean = true,
    val photoB64: String? = null,
)
