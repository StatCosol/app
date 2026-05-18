package com.statcosol.attendance.api

import com.squareup.moshi.JsonClass

/** GET /api/v1/mobile-attendance/roster response. */
@JsonClass(generateAdapter = true)
data class RosterResponse(
    val deviceId: String,
    val mode: String,                 // "KIOSK" | "ESS"
    val clientId: String,
    val clientName: String? = null,
    val branchId: String?,
    val branchName: String? = null,
    val geofenceLat: Double?,
    val geofenceLng: Double?,
    val geofenceRadiusM: Int?,
    val essEmployeeId: String?,       // populated when mode == ESS
    val enrollments: List<RosterEntry>
)

/** One enrolled employee. `embeddingB64` decodes to a Float32[] of 192 dims. */
@JsonClass(generateAdapter = true)
data class RosterEntry(
    val employeeId: String,
    val employeeCode: String,
    val displayName: String,
    val embeddingB64: String
)

/** POST /api/v1/mobile-attendance/punch body. */
@JsonClass(generateAdapter = true)
data class PunchBody(
    val employeeId: String,
    val employeeCode: String,
    val punchTime: String,            // ISO-8601
    val direction: String,            // "IN" | "OUT" | "AUTO"
    val matchScore: Double,           // 0..1
    val livenessScore: Double,        // 0..1
    val captureLat: Double?,
    val captureLng: Double?,
    val captureAccuracyM: Double?,
    val photoB64: String? = null,
    /** Phase 3f: device probe embedding (192 floats LE -> base64) so the
     *  server can recompute the match and reject tampered matchScore values. */
    val probeEmbeddingB64: String? = null,
    /** Phase 3a: integrity hints sent to the server gate. */
    val isMockLocation: Boolean? = null,
    val isRooted: Boolean? = null,
    /** Set true by the offline drain worker so the server skips the strict 24h backlog cap. */
    val offlineSync: Boolean? = null,
    /** Phase 3d: active-liveness challenge type, one of
     *  BLINK | SMILE | HEAD_TURN_LEFT | HEAD_TURN_RIGHT.
     *  Server enforces presence when env `FACE_LIVENESS_CHALLENGE_REQUIRED` is set. */
    val livenessChallengeType: String? = null,
    /** ISO-8601 UTC timestamp when the challenge was satisfied on-device.
     *  Server requires it within ±2 minutes of receipt. */
    val livenessChallengePassedAt: String? = null,
)

@JsonClass(generateAdapter = true)
data class PunchResponse(
    val ok: Boolean,
    val punchId: String? = null,
    val message: String? = null
)

/** POST /api/v1/mobile-attendance/enroll-self body. */
@JsonClass(generateAdapter = true)
data class EnrollSelfBody(
    /** Base64-encoded Float32 (little-endian) embedding bytes — 192 dims = 768 bytes. */
    val embeddingBase64: String,
    val embeddingModel: String = "mobilefacenet-v1",
    val consentGiven: Boolean = true
)

@JsonClass(generateAdapter = true)
data class EnrollSelfResponse(
    val ok: Boolean,
    val employeeId: String? = null,
    val message: String? = null
)
