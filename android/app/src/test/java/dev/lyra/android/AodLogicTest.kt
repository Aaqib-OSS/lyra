package dev.lyra.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AodLogicTest {
    @Test fun nextDelayWaitsForTheNextLine() = assertEquals(2000L, AodLogic.nextDelayMs(12_000, 9_000, 1_000))

    @Test fun nextDelayNeverBusyLoops() = assertEquals(400L, AodLogic.nextDelayMs(9_100, 9_000, 0))

    @Test fun nextDelayRechecksAfterTheCap() {
        assertEquals(10_000L, AodLogic.nextDelayMs(90_000, 0, 0))
        assertEquals(10_000L, AodLogic.nextDelayMs(null, 0, 0))
    }

    @Test fun minuteBoundary() {
        assertEquals(51L, AodLogic.msToNextMinute(59_999))
        assertTrue(AodLogic.msToNextMinute(0) in 1..60_100)
    }

    @Test fun pixelShiftStaysInBoundsAndMoves() {
        var prev = AodLogic.pixelShift(0, 6)
        for (i in 1..40) {
            val p = AodLogic.pixelShift(i, 6)
            assertTrue(kotlin.math.abs(p.first) <= 6 && kotlin.math.abs(p.second) <= 6)
            assertNotEquals(prev, p)
            prev = p
        }
        assertEquals(AodLogic.pixelShift(-1, 6), AodLogic.pixelShift(8, 6))
    }

    @Test fun dimAfterIdle() {
        assertEquals(1f, AodLogic.dimFactor(9 * 60_000L, 10 * 60_000L), 0f)
        assertEquals(0.5f, AodLogic.dimFactor(10 * 60_000L, 10 * 60_000L), 0f)
        assertEquals(1f, AodLogic.dimFactor(99 * 60_000L, 0), 0f)
    }

    @Test fun autoStartNeedsEveryCondition() {
        assertTrue(AodLogic.shouldAutoStart("charge", true, true, true, false, true, false))
        assertFalse(AodLogic.shouldAutoStart("demand", true, true, true, false, true, false))
        assertFalse(AodLogic.shouldAutoStart("charge", false, true, true, false, true, false))
        assertFalse(AodLogic.shouldAutoStart("charge", true, false, true, false, true, false)) // dark phone stays dark
        assertFalse(AodLogic.shouldAutoStart("charge", true, true, false, false, true, false))
        assertFalse(AodLogic.shouldAutoStart("charge", true, true, true, true, true, false)) // user closed it
        assertFalse(AodLogic.shouldAutoStart("charge", true, true, true, false, false, false)) // no overlay permission
        assertFalse(AodLogic.shouldAutoStart("charge", true, true, true, false, true, true))
    }
}
