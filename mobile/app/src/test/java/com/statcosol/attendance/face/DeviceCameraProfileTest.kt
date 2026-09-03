package com.statcosol.attendance.face

import com.statcosol.attendance.face.DeviceCameraProfile.Dims
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The point of this class is handsets nobody here owns, so the cases that
 * matter are the awkward ones: a sensor with no 16:9 stream, one whose smallest
 * option is already above the throughput cap, one that offers almost nothing.
 */
class DeviceCameraProfileTest {

    /** What an ordinary modern front camera tends to offer. */
    private val typical = listOf(
        Dims(176, 144), Dims(320, 240), Dims(640, 480), Dims(1280, 720),
        Dims(1920, 1080), Dims(2592, 1944), Dims(3264, 2448),
    )

    @Test
    fun `takes the largest 16 by 9 within the cap`() {
        assertEquals(Dims(1920, 1080), DeviceCameraProfile.chooseDims(typical, 1920))
    }

    @Test
    fun `a modest device is held to its lower cap`() {
        assertEquals(Dims(1280, 720), DeviceCameraProfile.chooseDims(typical, 1280))
    }

    @Test
    fun `prefers true 16 by 9 over the encoder-aligned twin at the same size`() {
        // Real case, caught on a Xiaomi: the driver offers 1920x1088 (1080
        // rounded up to a multiple of 16) BEFORE 1920x1080. Both clear the
        // aspect tolerance and both are 1920 long, so without an explicit
        // tie-break the winner is just whichever the driver listed first.
        val listedFirst = listOf(Dims(1280, 720), Dims(1920, 1088), Dims(1920, 1080))
        assertEquals(Dims(1920, 1080), DeviceCameraProfile.chooseDims(listedFirst, 1920))

        // ...and the answer must not depend on the order either.
        val listedLast = listOf(Dims(1280, 720), Dims(1920, 1080), Dims(1920, 1088))
        assertEquals(Dims(1920, 1080), DeviceCameraProfile.chooseDims(listedLast, 1920))
    }

    @Test
    fun `still takes the aligned size when no true 16 by 9 exists at that size`() {
        // 1088 is better than dropping to 1280 just because it isn't exact.
        val noExact = listOf(Dims(1280, 720), Dims(1920, 1088))
        assertEquals(Dims(1920, 1088), DeviceCameraProfile.chooseDims(noExact, 1920))
    }

    @Test
    fun `never picks below the floor when something bigger is offered`() {
        val chosen = DeviceCameraProfile.chooseDims(typical, 1920)
        assertTrue(chosen.longEdge >= 640)
    }

    @Test
    fun `falls back to closest aspect when the sensor offers no 16 by 9`() {
        val fourThreeOnly = listOf(Dims(640, 480), Dims(1024, 768), Dims(1600, 1200))
        // 4:3 throughout, so the largest within cap is the best available.
        assertEquals(Dims(1600, 1200), DeviceCameraProfile.chooseDims(fourThreeOnly, 1920))
    }

    @Test
    fun `overshoots the cap rather than returning a face too small to embed`() {
        // Every option is above the cap: take the smallest that still clears
        // the floor, not the largest, and not nothing.
        val bigOnly = listOf(Dims(2592, 1944), Dims(3840, 2160), Dims(4000, 3000))
        assertEquals(Dims(2592, 1944), DeviceCameraProfile.chooseDims(bigOnly, 1280))
    }

    @Test
    fun `takes the largest available when nothing clears the floor`() {
        val tinyOnly = listOf(Dims(176, 144), Dims(320, 240))
        assertEquals(Dims(320, 240), DeviceCameraProfile.chooseDims(tinyOnly, 1920))
    }

    @Test
    fun `an undescribed camera falls back rather than throwing`() {
        assertEquals(Dims(1280, 720), DeviceCameraProfile.chooseDims(emptyList(), 1920))
    }

    @Test
    fun `photo edge grows with the stream but stays inside the payload budget`() {
        // A punch can carry ATTENDANCE_MAX_FRAMES photos against a 2 MB JSON
        // body, so this must never run away with a better sensor.
        assertEquals(576, DeviceCameraProfile.photoMaxEdgeForShortEdge(720))
        assertEquals(640, DeviceCameraProfile.photoMaxEdgeForShortEdge(1080))
        assertEquals(640, DeviceCameraProfile.photoMaxEdgeForShortEdge(2160))
        assertEquals(480, DeviceCameraProfile.photoMaxEdgeForShortEdge(480))
    }

    @Test
    fun `face pixel floor is constant on any usable stream`() {
        assertEquals(110, DeviceCameraProfile.minFacePxForShortEdge(720))
        assertEquals(110, DeviceCameraProfile.minFacePxForShortEdge(1080))
    }

    @Test
    fun `face pixel floor relaxes on a small stream instead of refusing every frame`() {
        // 0.22 x 240 = 53. A gate of 110 on a 240-line stream would demand a
        // face nearly half the frame wide and reject everything the camera can
        // produce.
        assertEquals(53, DeviceCameraProfile.minFacePxForShortEdge(240))
    }
}
