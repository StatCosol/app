package com.statcosol.attendance.api

import com.squareup.moshi.JsonClass

/** GET /api/v1/mobile-attendance/roster response. */
@JsonClass(generateAdapter = true)
data class RosterResponse(
    val deviceId: String,
    val mode: String,                 // "KIOSK" | "ESS"
    val clientId: String,
    val branchId: String?,
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
    val photoB64: String? = null
)

@JsonClass(generateAdapter = true)
data class PunchResponse(
    val ok: Boolean,
    val punchId: String? = null,
    val message: String? = null
)
