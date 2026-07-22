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
    // Face crop JPEG. When face-svc is deployed the server re-embeds photos
    // with ArcFace (alignment + 512-d) and ignores the device embedding, so
    // sending this on every frame is what activates the upgraded model —
    // the device embedding stays as the offline/degraded fallback.
    val photoB64: String? = null,
    val qualityScore: Double? = null,
    val livenessScore: Double? = null,
    val sampleType: String? = null,
)

@Serializable
data class MarkAttendanceRequest(
    val frames: List<FaceFrame>,
    // PIN_THEN_FACE: the code + PIN the employee entered before capture.
    val employeeCode: String? = null,
    val pin: String? = null,
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
data class FaceDeskRegisterRequest(
    val installToken: String,
    val androidId: String,
)

@Serializable
data class FaceDeskRegisterResponse(
    val deviceToken: String,
    val deviceId: String,
    val mode: String,
    val clientId: String,
    val branchId: String? = null,
    val adminPin: String = "0000",
    // FACE_ONLY (default) or PIN_THEN_FACE — which capture flow to run.
    val identificationMode: String = "FACE_ONLY",
)

@Serializable
data class FaceDeskConfigResponse(
    val mode: String,
    val identificationMode: String = "FACE_ONLY",
    val frameCaptureCount: Int = 15,
    val livenessRequired: Boolean = true,
    val offlineSyncEnabled: Boolean = true,
)

@Serializable
data class EnrollTicket(
    val ticketId: String,
    val employeeId: String,
    val employeeName: String? = null,
    val employeeCode: String? = null,
    val status: String,
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
