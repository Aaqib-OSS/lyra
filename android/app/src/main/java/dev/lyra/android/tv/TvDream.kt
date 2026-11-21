package dev.lyra.android.tv

import android.graphics.Color
import android.service.dreams.DreamService
import android.view.ViewGroup
import android.widget.FrameLayout
import dev.lyra.android.AodDriver
import dev.lyra.android.AodLyricsView

/**
 * Lyra as the TV's screen saver: true black, a few large dim lyric lines tinted by the cover, a slow pixel shift. It is
 * the phone's "Minimal" ambient screen (hand-drawn native view, no WebView, no animation, one redraw per lyric line)
 * with text scaled for a sofa. Black is what keeps this cheap: on an OLED TV black pixels are off; an LCD TV keeps its
 * backlight on whatever is drawn, so there the saving is only that nothing animates.
 *
 * Select it in Settings > Device Preferences > Screen saver where the TV offers that (see docs/android-tv.md for the
 * adb command for TVs, like Google TV, that hide it). The lines shown are the ones the Lyra TV screen loaded last; with
 * none loaded the saver shows the title and artist.
 */
class TvDream : DreamService() {
    private var driver: AodDriver? = null

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        isInteractive = false
        isFullscreen = true
        TvSource.init(this)

        val view = AodLyricsView(this).apply {
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            // phones are tuned for ~360 x 800 dp; scale so the current line is about 6 % of the screen height
            val m = resources.displayMetrics
            textScale = (m.heightPixels / (540f * m.density)).coerceIn(1f, 2.5f)
        }
        setContentView(FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
            addView(view)
        })
        driver = AodDriver(this, view, TvSource)
    }

    override fun onDreamingStarted() {
        super.onDreamingStarted()
        driver?.start()
    }

    override fun onDreamingStopped() {
        driver?.stop()
        super.onDreamingStopped()
    }

    override fun onDetachedFromWindow() {
        driver?.stop()
        driver = null
        super.onDetachedFromWindow()
    }
}
