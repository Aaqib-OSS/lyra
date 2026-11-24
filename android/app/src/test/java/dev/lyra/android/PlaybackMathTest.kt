package dev.lyra.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackMathTest {
    private val playing = PlaybackMath.STATE_PLAYING

    @Test fun extrapolatesWhilePlaying() =
        assertEquals(13_000L, PlaybackMath.estimate(10_000, 1_000, 1f, playing, 4_000, 200_000))

    @Test fun respectsPlaybackSpeed() =
        assertEquals(16_000L, PlaybackMath.estimate(10_000, 1_000, 2f, playing, 4_000, 200_000))

    @Test fun speedZeroWhilePlayingMeansNormalSpeed() =
        assertEquals(13_000L, PlaybackMath.estimate(10_000, 1_000, 0f, playing, 4_000, 200_000))

    @Test fun pausedAndBufferingDoNotAdvance() {
        assertEquals(10_000L, PlaybackMath.estimate(10_000, 1_000, 1f, 2, 9_000, 200_000))
        assertEquals(10_000L, PlaybackMath.estimate(10_000, 1_000, 1f, PlaybackMath.STATE_BUFFERING, 9_000, 200_000))
    }

    @Test fun unknownPositionIsReportedAsUnknown() =
        assertEquals(PlaybackMath.POSITION_UNKNOWN, PlaybackMath.estimate(-1, 1_000, 1f, playing, 4_000, 200_000))

    @Test fun missingOrFutureUpdateTimeNeverGoesBackwards() {
        assertEquals(10_000L, PlaybackMath.estimate(10_000, 0, 1f, playing, 4_000, 200_000))
        assertEquals(10_000L, PlaybackMath.estimate(10_000, 9_000, 1f, playing, 4_000, 200_000))
    }

    @Test fun clampsToTheSongLength() =
        assertEquals(200_000L, PlaybackMath.estimate(199_000, 0 + 1, 1f, playing, 50_000, 200_000))

    @Test fun aStalePlayerDoesNotRunForHours() {
        val day = 24 * 60 * 60 * 1000L
        assertEquals(10_000L + 6 * 60 * 60 * 1000L, PlaybackMath.estimate(10_000, 1, 1f, playing, day, 0))
    }

    @Test fun adDetection() {
        assertTrue(PlaybackMath.isAd("Song", "Advertisement • 1 of 2", "", ""))
        assertTrue(PlaybackMath.isAd("advertisement", "", "", ""))
        assertTrue(PlaybackMath.isAd("Song", "Artist", "", "spotify:ad:123"))
        assertFalse(PlaybackMath.isAd("Advert Of The Year", "Band", "Album", "spotify:track:abc"))
    }

    @Test fun fallbackCountsPlayTimeAndResetsPerSong() {
        val f = PositionFallback()
        assertEquals(0L, f.position("a", true, 1_000))
        assertEquals(2_000L, f.position("a", true, 3_000))
        assertEquals(2_500L, f.position("a", false, 3_500)) // paused: frozen from here
        assertEquals(2_500L, f.position("a", false, 9_000))
        assertEquals(3_500L, f.position("a", true, 9_000).let { f.position("a", true, 10_000) })
        assertEquals(0L, f.position("b", true, 12_000)) // new song starts from 0
    }

    @Test fun tintAlwaysReadsWithWhiteText() {
        val samples = listOf(Triple(255, 255, 255), Triple(240, 220, 80), Triple(10, 10, 10), Triple(120, 200, 255), Triple(200, 40, 40))
        for ((r, g, b) in samples) {
            val (tr, tg, tb) = NotificationTint.darken(r, g, b)
            assertTrue("contrast for $r,$g,$b", NotificationTint.contrastWithWhite(tr, tg, tb) >= 4.5)
            assertTrue(tr <= r && tg <= g && tb <= b)
        }
    }

    @Test fun fetchOnlyReachesThePublicInternet() {
        assertTrue(NetGuard.isAllowedHost("lrclib.net"))
        assertTrue(NetGuard.isAllowedHost("itunes.apple.com"))
        assertTrue(NetGuard.isAllowedHost("93.184.216.34"))
        for (h in listOf("localhost", "127.0.0.1", "10.0.0.5", "192.168.1.20", "172.16.0.1", "169.254.169.254", "100.64.0.1", "[::1]", "printer.local", "2130706433", "0x7f000001", "0.0.0.0", "", null)) {
            assertFalse("host $h", NetGuard.isAllowedHost(h))
        }
        assertTrue(NetGuard.isAllowedHost("172.32.0.1")) // outside the private 172.16/12 block
    }
}
