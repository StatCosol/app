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
}
