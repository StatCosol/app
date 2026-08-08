package com.statcosol.attendance.roster

import com.statcosol.attendance.prefs.DeviceConfig
import kotlinx.serialization.Serializable

@Serializable
data class RosterEnrollment(
    val employeeId: String,
    val displayName: String,
    val embeddingModel: String = "",
    val embeddingB64: String? = null,
    val embeddingCipherB64: String? = null,
)

/** Wire model for `GET /api/v1/mobile-attendance/punches/roster`. */
@Serializable
data class RosterResponse(
    val format: String,
    val issuedAt: String? = null,
    val expiresAt: String? = null,
    /** `mobile_attendance_devices.id` — use for [RosterCrypto] key derivation. */
    val deviceId: String,
    val enrollments: List<RosterEnrollment> = emptyList(),
)

/** Wire model for `POST /api/v1/mobile-attendance/devices/register`. */
@Serializable
data class MobileAttendanceRegisterResponse(
    val deviceToken: String,
    /** `mobile_attendance_devices.id` — persist as [DeviceConfig.rosterDeviceId]. */
    val deviceId: String,
    val mode: String,
    val clientId: String,
    val branchId: String? = null,
)

/** Persist the roster-bound device id from V1 mobile-attendance registration. */
fun DeviceConfig.applyMobileAttendanceRegister(response: MobileAttendanceRegisterResponse) {
    rosterDeviceId = response.deviceId
}

/** Persist the roster-bound device id returned by the V1 roster endpoint. */
fun DeviceConfig.applyRosterResponse(response: RosterResponse) {
    rosterDeviceId = response.deviceId
}
