package dev.lyra.android.tv

import android.graphics.Color
import android.os.Bundle
import android.view.KeyEvent
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import dev.lyra.android.LyraWebView
import dev.lyra.android.Rpc
import dev.lyra.android.WebSetup

/**
 * Lyra on Android TV / Google TV / Fire TV: the shared page in a full-screen WebView with `?tv=1` (data-platform="tv",
 * see src/android-web/tv.ts and styles/tv.css). It is started by the TV launcher through LEANBACK_LAUNCHER and is the
 * only activity a TV shows. Everything is operated with the remote: D-pad and OK reach the page as arrow keys and Enter,
 * media keys are forwarded by [forwardKey], Back asks the page first.
 *
 * Where the songs come from is [TvSource]: this TV's own media session or a paired Lyra app.
 */
class TvActivity : ComponentActivity() {
    private var web: LyraWebView? = null
    private var rpc: Rpc? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            hide(WindowInsetsCompat.Type.systemBars())
        }
        TvSource.init(this)

        // keys are taken at the root, before the WebView sees them (Android and Chromium treat media keys specially)
        val root = object : FrameLayout(this) {
            override fun dispatchKeyEvent(event: KeyEvent): Boolean = forwardKey(event) || super.dispatchKeyEvent(event)
        }.apply { setBackgroundColor(Color.BLACK) }
        val view = LyraWebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            isFocusable = true
            isFocusableInTouchMode = true
        }
        WebSetup.configure(view, this)
        // The page is laid out as 1920 CSS px wide whatever the TV's density (entry.ts sets the viewport meta), so 10-foot
        // sizes in CSS are the same on a 720p, 1080p and 4K set; the wide viewport makes the WebView honour that meta.
        view.settings.useWideViewPort = true
        view.settings.loadWithOverviewMode = true
        root.addView(view)
        setContentView(root)

        rpc = Rpc(applicationContext, view, this, TvSource).also { it.install() }
        web = view
        WebSetup.load(view, "?tv=1")
        view.requestFocus()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // close what the page has open (setup screen, a panel); with nothing open Back leaves, as TV apps do
                view.evaluateJavascript("window.__lyraNative ? window.__lyraNative.back() : false") { r ->
                    if (r != "true") finish()
                }
            }
        })
    }

    /** True when the key is one of ours (media keys, Menu): the page gets it, down and up are both consumed. */
    private fun forwardKey(event: KeyEvent): Boolean {
        val name = TvKeys.nameFor(event.keyCode) ?: return false
        if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
            web?.evaluateJavascript("window.__lyraTv&&window.__lyraTv.key('$name')", null)
        }
        return true
    }

    override fun onResume() {
        super.onResume()
        TvSource.refresh(this) // e.g. back from the notification-access screen
        rpc?.pushState()
        web?.requestFocus()
    }

    override fun onDestroy() {
        rpc?.dispose()
        web?.destroy()
        super.onDestroy()
    }
}
