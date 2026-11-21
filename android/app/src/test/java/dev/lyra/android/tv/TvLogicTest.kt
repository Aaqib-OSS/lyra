package dev.lyra.android.tv

import android.view.KeyEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Random

class TvLogicTest {
    @Test fun codesUseOnlyUnambiguousCharacters() {
        val rnd = Random(7)
        repeat(500) {
            val c = PairingCode.generate(rnd)
            assertEquals(PairingCode.LENGTH, c.length)
            assertTrue(c.all { it in PairingCode.ALPHABET })
            assertTrue(c.none { it in "01OIL" })
        }
    }

    @Test fun codeIsShownInTwoGroups() {
        assertEquals("K7M-2QX", PairingCode.format("K7M2QX"))
        assertEquals("K7M", PairingCode.format("K7M")) // not a full code: left alone
    }

    @Test fun typedCodesAreForgiving() {
        assertEquals("K7M2QX", PairingCode.normalize("k7m-2qx"))
        assertEquals("K7M2QX", PairingCode.normalize(" K7M 2QX "))
        assertNull(PairingCode.normalize("K7M2Q")) // too short
        assertNull(PairingCode.normalize("K7M2QO")) // O is not in the alphabet
    }

    @Test fun generatedCodesRoundTrip() {
        val c = PairingCode.generate(Random(1))
        assertEquals(c, PairingCode.normalize(PairingCode.format(c)))
    }

    @Test fun qrLinkCarriesCodeAndEncodedName() {
        assertEquals("lyra://pair?c=K7M2QX&n=Living%20Room%20TV", PairingCode.link("K7M2QX", "Living Room TV"))
        assertEquals("lyra://pair?c=K7M2QX&n=Tom%26Jerry%27s", PairingCode.link("K7M2QX", "Tom&Jerry's"))
    }

    @Test fun mediaKeysAreForwardedToThePage() {
        assertEquals("playpause", TvKeys.nameFor(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE))
        assertEquals("next", TvKeys.nameFor(KeyEvent.KEYCODE_MEDIA_NEXT))
        assertEquals("prev", TvKeys.nameFor(KeyEvent.KEYCODE_MEDIA_PREVIOUS))
        assertEquals("ffwd", TvKeys.nameFor(KeyEvent.KEYCODE_MEDIA_FAST_FORWARD))
        assertEquals("rew", TvKeys.nameFor(KeyEvent.KEYCODE_MEDIA_REWIND))
        assertEquals("pause", TvKeys.nameFor(KeyEvent.KEYCODE_MEDIA_STOP))
        assertEquals("menu", TvKeys.nameFor(KeyEvent.KEYCODE_MENU))
    }

    @Test fun dpadAndBackAreNotIntercepted() {
        for (k in listOf(KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN, KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_BACK)) {
            assertNull("key $k must reach the page / back handler", TvKeys.nameFor(k))
        }
    }

    @Test fun stubTransportNeverConnects() {
        val states = mutableListOf<LinkState>()
        val t = StubConnectTransport()
        t.connect("K7M2QX", "TV", object : ConnectTransport.Listener {
            override fun onState(state: LinkState) { states += state }
            override fun onSnapshot(json: String) = Unit
        })
        assertEquals(listOf(LinkState.WAITING), states)
        assertFalse(t.send("{\"type\":\"toggle\"}"))
        assertNotNull(TvTransports.create())
    }
}
