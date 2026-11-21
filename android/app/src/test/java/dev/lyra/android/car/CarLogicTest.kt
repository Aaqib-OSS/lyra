package dev.lyra.android.car

import android.content.res.Configuration
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CarLogicTest {
    @Test fun carDockOnlyForCarUiMode() {
        assertTrue(CarLogic.isCarDock(Configuration.UI_MODE_TYPE_CAR))
        assertFalse(CarLogic.isCarDock(Configuration.UI_MODE_TYPE_NORMAL))
        assertFalse(CarLogic.isCarDock(Configuration.UI_MODE_TYPE_TELEVISION))
    }

    @Test fun nightFlagIgnoresTypeBits() {
        assertEquals(true, CarLogic.nightOrNull(Configuration.UI_MODE_NIGHT_YES or Configuration.UI_MODE_TYPE_CAR))
        assertEquals(false, CarLogic.nightOrNull(Configuration.UI_MODE_NIGHT_NO or Configuration.UI_MODE_TYPE_NORMAL))
        assertNull(CarLogic.nightOrNull(Configuration.UI_MODE_NIGHT_UNDEFINED))
    }

    @Test fun lyricsStayOffTheSessionInACarUnlessOptedIn() {
        assertTrue(CarLogic.lyricsOnSession(carDock = false, optedIn = false))
        assertFalse(CarLogic.lyricsOnSession(carDock = true, optedIn = false))
        assertTrue(CarLogic.lyricsOnSession(carDock = true, optedIn = true))
    }
}
