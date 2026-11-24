package dev.lyra.android

import dev.lyra.android.SelfCheckLogic.Level
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SelfCheckLogicTest {
    private fun inputs(
        sdk: Int = 34, maker: String = "Google", access: Boolean = true, connected: Boolean = true, sessions: Int = 1,
        position: Boolean? = true, notifs: Boolean = true, battery: Boolean = true, bgRestricted: Boolean = false,
        lyricsNote: Boolean = false, overlay: Boolean = false, overlayGranted: Boolean = true, keep: Boolean = false
    ) = SelfCheckLogic.Inputs(sdk, maker, access, connected, sessions, position, notifs, battery, bgRestricted, lyricsNote, overlay, overlayGranted, keep)

    private fun byId(l: List<SelfCheckLogic.Check>, id: String) = l.firstOrNull { it.id == id }

    @Test fun healthyPhoneHasNoProblems() {
        val c = SelfCheckLogic.evaluate(inputs())
        assertEquals(0, SelfCheckLogic.problems(c))
    }

    @Test fun missingAccessIsTheFirstBadItemWithAFix() {
        val c = SelfCheckLogic.evaluate(inputs(access = false))
        assertEquals("access", c.first().id)
        assertEquals(Level.BAD, c.first().level)
        assertEquals("openAccessSettings", c.first().fix)
    }

    @Test fun restrictedSettingsHelpOnlyOnAndroid13Plus() {
        assertNotNull(byId(SelfCheckLogic.evaluate(inputs(sdk = 34, access = false)), "restricted"))
        assertNull(byId(SelfCheckLogic.evaluate(inputs(sdk = 30, access = false)), "restricted"))
    }

    @Test fun disconnectedListenerIsAWarning() =
        assertEquals(Level.WARN, byId(SelfCheckLogic.evaluate(inputs(connected = false)), "listener")?.level)

    @Test fun playerWithoutPositionIsAWarning() =
        assertEquals(Level.WARN, byId(SelfCheckLogic.evaluate(inputs(position = false)), "position")?.level)

    @Test fun blockedNotificationsOnlyMatterWhenAFeatureNeedsThem() {
        assertNull(byId(SelfCheckLogic.evaluate(inputs(notifs = false)), "notifications"))
        assertEquals(Level.BAD, byId(SelfCheckLogic.evaluate(inputs(notifs = false, lyricsNote = true)), "notifications")?.level)
    }

    @Test fun overlayNeedsItsPermission() =
        assertEquals("openOverlaySettings", byId(SelfCheckLogic.evaluate(inputs(overlay = true, overlayGranted = false)), "overlay")?.fix)

    @Test fun batteryIsLouderOnAggressivePhones() {
        assertEquals(Level.INFO, byId(SelfCheckLogic.evaluate(inputs(maker = "Google", battery = false)), "battery")?.level)
        assertEquals(Level.WARN, byId(SelfCheckLogic.evaluate(inputs(maker = "Xiaomi", battery = false)), "battery")?.level)
        assertEquals(Level.BAD, byId(SelfCheckLogic.evaluate(inputs(bgRestricted = true)), "restricted-bg")?.level)
    }

    @Test fun everyFixIdIsOneTheNativeSideKnows() {
        val known = setOf("openAccessSettings", "openAppInfo", "openNotificationSettings", "openOverlaySettings", "openBatterySettings")
        val c = SelfCheckLogic.evaluate(inputs(access = false, connected = false, notifs = false, lyricsNote = true, overlay = true, overlayGranted = false, battery = false, bgRestricted = true))
        c.mapNotNull { it.fix }.forEach { assertTrue(it, it in known) }
    }

    @Test fun oemGuides() {
        assertNotNull(OemGuide.forManufacturer("samsung"))
        assertNotNull(OemGuide.forManufacturer("Xiaomi"))
        assertNull(OemGuide.forManufacturer("Fairphone"))
        assertTrue(OemGuide.isAggressive("OnePlus"))
    }
}
