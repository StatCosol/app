package com.statcosol.attendance.facedesk

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FaceDeskApiErrorsTest {

    @Test
    fun serverMessageOrNull_extractsMessageFromJsonBody() {
        val body =
            """{"success":false,"statusCode":401,"message":"Device not authorized","error":"Unauthorized","path":"/api/v1/facedesk/device/attendance/mark","method":"POST","timestamp":"2026-08-10T12:00:00.000Z"}"""
        val ex = FaceDeskApiException(401, body)
        assertEquals("Device not authorized", ex.serverMessageOrNull())
    }

    @Test
    fun serverMessageOrNull_blankBodyReturnsNull() {
        val ex = FaceDeskApiException(500, "")
        assertNull(ex.serverMessageOrNull())
    }

    @Test
    fun serverMessageOrNull_invalidJsonReturnsNull() {
        val ex = FaceDeskApiException(500, "upstream timeout")
        assertNull(ex.serverMessageOrNull())
    }

    @Test
    fun exceptionMessage_neverIncludesRawJsonBody() {
        val body = """{"message":"Device not authorized"}"""
        val ex = FaceDeskApiException(401, body)
        assertEquals("FaceDesk API HTTP 401", ex.message)
    }

    @Test
    fun isEnrollmentDuplicateConflict_trueForFaceDuplicateMessage() {
        val body = """{"message":"Possible duplicate found — sent to admin review"}"""
        val ex = FaceDeskApiException(409, body)
        assertEquals(true, ex.isEnrollmentDuplicateConflict())
    }

    @Test
    fun isEnrollmentDuplicateConflict_falseForOfflineRefUniqueConstraint() {
        val body = """{"message":"A record with the same offline_ref already exists."}"""
        val ex = FaceDeskApiException(409, body)
        assertEquals(false, ex.isEnrollmentDuplicateConflict())
    }

    @Test
    fun isEnrollmentDuplicateConflict_falseForPinClash() {
        val body = """{"message":"That PIN is already in use — choose a different one"}"""
        val ex = FaceDeskApiException(409, body)
        assertEquals(false, ex.isEnrollmentDuplicateConflict())
    }
}
