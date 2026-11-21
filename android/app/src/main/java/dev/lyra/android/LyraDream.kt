package dev.lyra.android

import android.graphics.Color
import android.service.dreams.DreamService
import android.view.ViewGroup
import android.widget.FrameLayout

/**
 * Lyra as an Android screen saver ("dream"): Settings → Display → Screen saver → Lyra. Android starts it by itself
 * while the phone charges or sits on a dock (the system owns that trigger, so it needs no extra permission).
 * With the "Minimal" ambient style it is the same hand-drawn native view as the ambient screen: true black, dim
 * cover-tinted lyrics, pixel shift, one update per lyric line, no WebView. "Glow" / "Video" use the web page.
 */
class LyraDream : DreamService() {
    private var rpc: Rpc? = null
    private var web: LyraWebView? = null
    private var driver: AodDriver? = null

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        isInteractive = false
        isFullscreen = true
        isScreenBright = false // the system's own "dim dream" mode; the window brightness below goes lower still

        val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        window?.attributes = window?.attributes?.apply { screenBrightness = AmbientConfig.brightness(this@LyraDream) }
        if (AmbientConfig.native(this)) {
            val v = AodLyricsView(this).apply { layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT) }
            root.addView(v)
            driver = AodDriver(this, v)
            setContentView(root)
        } else {
            val view = LyraWebView(this).apply { layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT) }
            WebSetup.configure(view, this)
            root.addView(view)
            setContentView(root)
            rpc = Rpc(applicationContext, view).also { it.install() }
            web = view
            WebSetup.load(view, "?ambient=1")
        }
    }

    override fun onDreamingStarted() {
        super.onDreamingStarted()
        rpc?.pushState()
        driver?.start()
    }

    override fun onDreamingStopped() {
        driver?.stop()
        super.onDreamingStopped()
    }

    override fun onDetachedFromWindow() {
        driver?.stop()
        rpc?.dispose()
        web?.destroy()
        rpc = null
        web = null
        driver = null
        super.onDetachedFromWindow()
    }
}
