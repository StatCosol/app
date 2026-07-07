package com.statcosol.attendance.facedesk

import kotlinx.serialization.Serializable

/**
 * FaceDesk V2 wire models. Frames carry device-computed embeddings (offline-
 * capable) plus optional per-frame quality/liveness. Mirrors the backend
 * FaceFrameDto / MarkAttendanceDto / SaveEnrollmentDto.
 */
@Serializable
data class FaceFrame(
    val embeddingB64: String,
    val embeddingModel: String? = null,
    val qualityScore: Double? = null,
    val livenessScore: Double? = null,
    val sampleType: String? = null,
)

@Serializable
data class MarkAttendanceRequest(
    val frames: List<FaceFrame>,
    val livenessPassed: Boolean? = null,
    val offlineRef: String? = null,
    val punchTime: String? = null,
    val captureLat: Double? = null,
    val captureLng: Double? = null,
)

@Serializable
data class MarkAttendanceResponse(
    val status: String,
    val message: String,
    val employeeName: String? = null,
    val employeeCode: String? = null,
    val punchType: String? = null,
    val punchTime: String? = null,
    val confidencePercent: Int? = null,
)

@Serializable
data class OfflineSyncRequest(
    val punches: List<MarkAttendanceRequest>,
)

@Serializable
data class OfflineSyncResponse(
    val synced: Int = 0,
    val duplicateSkipped: Int = 0,
    val failed: Int = 0,
)

@Serializable
data class SaveEnrollmentRequest(
    val employeeId: String,
    val frames: List<FaceFrame>,
    val livenessPassed: Boolean? = null,
    val consentGiven: Boolean? = null,
)

@Serializable
data class SaveEnrollmentResponse(
    val ok: Boolean = false,
    val profileId: String? = null,
    val samples: Int = 0,
    val message: String? = null,
)

@Serializable
data class ValidateQualityRequest(val frames: List<FaceFrame>)

@Serializable
data class ValidateQualityResponse(
    val ok: Boolean = false,
    val totalFrames: Int = 0,
    val goodFrames: Int = 0,
    val message: String = "",
)

@Serializable
data class PendingEmployee(
    val employeeId: String,
    val employeeCode: String,
    val name: String,
    val branchId: String? = null,
    val department: String? = null,
    val designation: String? = null,
)
