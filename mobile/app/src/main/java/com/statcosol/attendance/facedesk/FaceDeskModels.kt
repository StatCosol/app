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
    // A representative capture photo stored on the punch so the branch can
    // verify a PIN-correct/face-mismatch punch.
    val photoB64: String? = null,
    val livenessPassed: Boolean? = null,
    val offlineRef: String? = null,
    val punchTime: String? = null,
    val captureLat: Double? = null,
    val captureLng: Double? = null,
    val appVersion: String? = null,
    val offlineQueueDepth: Int? = null,
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
    val appVersion: String? = null,
    val offlineQueueDepth: Int? = null,
)

@Serializable
data class OfflineSyncPunchResult(
    val offlineRef: String? = null,
    val status: String,
    val message: String? = null,
)

@Serializable
data class OfflineSyncResponse(
    val synced: Int = 0,
    val duplicateSkipped: Int = 0,
    val failed: Int = 0,
    val results: List<OfflineSyncPunchResult> = emptyList(),
)

@Serializable
data class SaveEnrollmentRequest(
    val employeeId: String,
    val frames: List<FaceFrame>,
    val livenessPassed: Boolean? = null,
    val consentGiven: Boolean? = null,
    // EMPLOYEE (default) or CONTRACTOR — which roster employeeId belongs to.
    val subjectType: String? = null,
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
    val appVersion: String? = null,
)

@Serializable
data class FaceDeskKioskBranding(
    val deviceName: String = "",
    val location: String? = null,
    val branchName: String? = null,
    val clientName: String? = null,
    val clientLogoUrl: String? = null,
)

@Serializable
data class FaceDeskDeviceConfig(
    val mode: String? = null,
    val identificationMode: String? = null,
    val frameCaptureCount: Int? = null,
    val livenessRequired: Boolean? = null,
    val offlineSyncEnabled: Boolean? = null,
    val captureTuning: FaceDeskCaptureTuning? = null,
    val branding: FaceDeskKioskBranding? = null,
)

/**
 * Capture thresholds from the server, overriding this build's defaults.
 *
 * The APK is one universal binary, but its thresholds were profiled on a single
 * handset and then applied everywhere — gates set for a soft 8 MP sensor with no
 * flash are too permissive on a better camera, so weaker captures than necessary
 * become enrolled embeddings.
 *
 * Every field is nullable: the server may send none, some or all, and anything
 * absent keeps the built-in default. An older server that does not send this at
 * all therefore behaves exactly as before.
 */
@Serializable
data class FaceDeskCaptureTuning(
    val minFaceSizeAttendance: Float? = null,
    val minFaceSizeEnrollment: Float? = null,
    val minSharpnessAttendance: Float? = null,
    val minSharpnessEnrollment: Float? = null,
    val minBlurAttendance: Float? = null,
    val minBlurEnrollment: Float? = null,
    val minLuminance: Float? = null,
    val maxPitchDeg: Float? = null,
    val blinkAbsThreshold: Double? = null,
    val blinkDropDelta: Double? = null,
    val analysisWidth: Int? = null,
    val analysisHeight: Int? = null,
)

@Serializable
data class FaceDeskRegisterResponse(
    val deviceToken: String,
    val deviceId: String,
    val mode: String,
    val clientId: String,
    val branchId: String? = null,
    val identificationMode: String? = null,
    val branding: FaceDeskKioskBranding? = null,
)

@Serializable
data class EnrollTicket(
    val ticketId: String,
    val employeeId: String,
    val employeeName: String? = null,
    val employeeCode: String? = null,
    val subjectType: String? = null,
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
