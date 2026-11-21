package dev.lyra.android

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RectF
import android.graphics.Shader
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.SizeF
import android.widget.RemoteViews

/**
 * The home-screen "Lyra live lyrics" widget.
 *
 *  - three layouts that the launcher picks by size (Android 12+): a slim player, a lyrics card and a big lyrics card
 *  - the background is a gradient built from the cover's own colours, redrawn for every song
 *  - the current lyric line and the next one change in time with the song (LyricsNotifier keeps the timed lines)
 *  - previous / play-pause / next work from the home screen; tapping the card opens Lyra
 *
 * The widget is drawn by [LyraWidgetUpdater], which follows the media session and wakes itself at the next lyric line.
 */
class LyraWidget : AppWidgetProvider() {
    override fun onEnabled(context: Context) {
        LyraWidgetUpdater.attach(context)
    }

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        LyraWidgetUpdater.attach(context)
        LyraWidgetUpdater.refresh()
    }

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, newOptions: android.os.Bundle) {
        LyraWidgetUpdater.refresh()
    }

    override fun onDisabled(context: Context) {
        LyraWidgetUpdater.detach()
    }
}

/** Previous / play-pause / next pressed on the widget. */
class LyraWidgetAction : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val type = when (intent.action) {
            LyraWidgetUpdater.ACTION_PREV -> "previous"
            LyraWidgetUpdater.ACTION_NEXT -> "next"
            else -> "toggle"
        }
        MediaMonitor.command("""{"type":"$type"}""")
        LyraWidgetUpdater.refreshSoon(350)
    }
}

object LyraWidgetUpdater {
    const val ACTION_PREV = "dev.lyra.android.widget.PREV"
    const val ACTION_TOGGLE = "dev.lyra.android.widget.TOGGLE"
    const val ACTION_NEXT = "dev.lyra.android.widget.NEXT"

    private val main = Handler(Looper.getMainLooper())
    private var appCtx: Context? = null
    private var attached = false
    private var lastDraw = 0L
    private val listener = { refresh() }
    private val tick = Runnable {
        refresh()
    }

    // per-song cache so a redraw every second costs almost nothing
    private var cachedId: String? = null
    private var cachedArt: Bitmap? = null
    private var cachedBg: Bitmap? = null
    private var cachedBgCompact: Bitmap? = null

    fun attach(ctx: Context) {
        appCtx = ctx.applicationContext
        if (!attached) {
            attached = true
            MediaMonitor.addListener(listener)
            MediaMonitor.refresh(ctx)
        }
    }

    fun detach() {
        attached = false
        MediaMonitor.removeListener(listener)
        main.removeCallbacks(tick)
    }

    /** Called when new lyric lines arrive from the app. */
    fun refreshSoon(delayMs: Long = 0) {
        main.removeCallbacks(tick)
        main.postDelayed(tick, delayMs)
    }

    fun refresh() {
        val ctx = appCtx ?: return
        main.removeCallbacks(tick)
        val mgr = AppWidgetManager.getInstance(ctx)
        val ids = mgr.getAppWidgetIds(ComponentName(ctx, LyraWidget::class.java))
        if (ids.isEmpty()) {
            detach()
            return
        }
        val now = try { MediaMonitor.now() } catch (_: Exception) { null }
        val state = describe(now)
        try {
            mgr.updateAppWidget(ids, build(ctx, state))
        } catch (_: Exception) {
            // a launcher that refuses the update must never crash the app
        }
        lastDraw = SystemClock.elapsedRealtime()
        if (now != null && now.playing) main.postDelayed(tick, nextDelay(now))
    }

    // ---------- what to show ----------

    private class State(
        val title: String,
        val artist: String,
        val lyric: String,
        val nextLine: String,
        val playing: Boolean,
        val progress: Int,
        val art: Bitmap?,
        val id: String?
    )

    private fun describe(now: MediaMonitor.Now?): State {
        if (now == null || now.isAd) {
            return State("Lyra", if (now?.isAd == true) "Ad playing" else "Nothing playing", "Play a song to see its lyrics here", "", false, 0, null, null)
        }
        var lyric = "♪"
        var next = ""
        val lines = LyricsNotifier.lines
        val mine = LyricsNotifier.linesTrack == now.id && lines.isNotEmpty() && LyricsNotifier.status == "synced"
        if (mine) {
            val i = LyricsNotifier.activeIndex(now.positionMs)
            if (i >= 0) {
                lyric = lines[i].text.ifBlank { "♪" }
                next = lines.getOrNull(i + 1)?.text.orEmpty()
            } else {
                next = lines.firstOrNull()?.text.orEmpty()
            }
        } else {
            lyric = when {
                LyricsNotifier.linesTrack == now.id && LyricsNotifier.status == "none" -> "No synced lyrics for this song"
                LyricsNotifier.linesTrack == now.id && LyricsNotifier.status == "loading" -> "Finding the lyrics…"
                else -> "Open Lyra to load the lyrics"
            }
        }
        val progress = if (now.durationMs > 0) ((now.positionMs * 1000) / now.durationMs).toInt().coerceIn(0, 1000) else 0
        return State(now.title, now.artist, lyric, next, now.playing, progress, now.art, now.id)
    }

    /** When to draw next: the moment the next lyric line starts (never faster than 0.4 s), else every few seconds for the progress bar. */
    private fun nextDelay(now: MediaMonitor.Now): Long {
        val lines = LyricsNotifier.lines
        if (LyricsNotifier.linesTrack == now.id && lines.isNotEmpty()) {
            val i = LyricsNotifier.activeIndex(now.positionMs)
            val nextT = lines.getOrNull(i + 1)?.t
            if (nextT != null) {
                val wait = nextT - (now.positionMs + LyricsNotifier.offsetMs)
                return wait.coerceIn(400, 4000)
            }
        }
        return 4000
    }

    // ---------- drawing ----------

    private fun build(ctx: Context, s: State): RemoteViews {
        refreshCaches(ctx, s)
        val medium = fill(ctx, RemoteViews(ctx.packageName, R.layout.lyra_widget_medium), s, 2)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return medium
        val compact = fill(ctx, RemoteViews(ctx.packageName, R.layout.lyra_widget_compact), s, 1)
        val large = fill(ctx, RemoteViews(ctx.packageName, R.layout.lyra_widget_large), s, 3)
        return RemoteViews(
            mapOf(
                SizeF(110f, 56f) to compact,
                SizeF(250f, 110f) to medium,
                SizeF(250f, 200f) to large
            )
        )
    }

    private fun fill(ctx: Context, v: RemoteViews, s: State, kind: Int): RemoteViews {
        v.setTextViewText(R.id.lw_title, s.title)
        v.setTextViewText(R.id.lw_artist, s.artist)
        if (kind >= 2) {
            v.setTextViewText(R.id.lw_lyric, s.lyric)
            v.setProgressBar(R.id.lw_progress, 1000, s.progress, false)
        }
        if (kind == 3) v.setTextViewText(R.id.lw_next_line, s.nextLine)
        val art = cachedArt
        if (art != null) v.setImageViewBitmap(R.id.lw_art, art) else v.setImageViewResource(R.id.lw_art, R.drawable.ic_ambient)
        v.setImageViewBitmap(R.id.lw_bg, (if (kind == 1) cachedBgCompact else cachedBg) ?: return v)
        v.setImageViewResource(R.id.lw_play, if (s.playing) R.drawable.ic_w_pause_dark else R.drawable.ic_w_play_dark)
        v.setOnClickPendingIntent(R.id.lw_play, broadcast(ctx, ACTION_TOGGLE, 1))
        if (kind >= 2) {
            v.setOnClickPendingIntent(R.id.lw_prev, broadcast(ctx, ACTION_PREV, 2))
            v.setOnClickPendingIntent(R.id.lw_next, broadcast(ctx, ACTION_NEXT, 3))
        }
        val open = PendingIntent.getActivity(ctx, 4, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        v.setOnClickPendingIntent(R.id.lw_root, open)
        return v
    }

    private fun broadcast(ctx: Context, action: String, code: Int): PendingIntent =
        PendingIntent.getBroadcast(ctx, code, Intent(ctx, LyraWidgetAction::class.java).setAction(action), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    /** Rebuild the rounded cover and the colour background only when the song changes. */
    private fun refreshCaches(ctx: Context, s: State) {
        if (s.id == cachedId && cachedBg != null) return
        cachedId = s.id
        val dp = ctx.resources.displayMetrics.density
        val src = s.art
        cachedArt = src?.let { rounded(it, (96 * dp).toInt(), 18 * dp) }
        val accent = src?.let { accentOf(it) } ?: Color.parseColor("#6a3d8a")
        cachedBg = gradient((420 * dp).toInt().coerceAtMost(900), (200 * dp).toInt().coerceAtMost(500), accent, 26 * dp)
        cachedBgCompact = gradient((260 * dp).toInt().coerceAtMost(700), (96 * dp).toInt().coerceAtMost(300), accent, 22 * dp)
    }

    /** A square, rounded copy of the cover. */
    private fun rounded(src: Bitmap, size: Int, radius: Float): Bitmap {
        val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val c = Canvas(out)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        c.drawRoundRect(RectF(0f, 0f, size.toFloat(), size.toFloat()), radius, radius, p)
        p.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
        val side = minOf(src.width, src.height)
        val left = (src.width - side) / 2
        val top = (src.height - side) / 2
        c.drawBitmap(src, android.graphics.Rect(left, top, left + side, top + side), RectF(0f, 0f, size.toFloat(), size.toFloat()), p)
        return out
    }

    /** The most vivid colour of the cover (sampled on a tiny copy), pulled to a dark value so white text always reads well. */
    private fun accentOf(src: Bitmap): Int {
        val t = Bitmap.createScaledBitmap(src, 12, 12, true)
        var best = Color.parseColor("#6a3d8a")
        var bestScore = -1f
        val hsv = FloatArray(3)
        for (y in 0 until t.height) for (x in 0 until t.width) {
            Color.colorToHSV(t.getPixel(x, y), hsv)
            val score = hsv[1] * (0.4f + hsv[2]) // saturated and not black
            if (score > bestScore) {
                bestScore = score
                best = Color.HSVToColor(floatArrayOf(hsv[0], hsv[1], hsv[2]))
            }
        }
        return best
    }

    /** Dark, rich two-tone gradient from the accent colour, with rounded corners. */
    private fun gradient(w: Int, h: Int, accent: Int, radius: Float): Bitmap {
        val hsv = FloatArray(3)
        Color.colorToHSV(accent, hsv)
        val top = Color.HSVToColor(floatArrayOf(hsv[0], (hsv[1] * 0.9f).coerceIn(0.25f, 0.9f), 0.46f))
        val bottom = Color.HSVToColor(floatArrayOf((hsv[0] + 24f) % 360f, (hsv[1] * 0.8f).coerceIn(0.2f, 0.85f), 0.2f))
        val out = Bitmap.createBitmap(w.coerceAtLeast(2), h.coerceAtLeast(2), Bitmap.Config.ARGB_8888)
        val c = Canvas(out)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.shader = LinearGradient(0f, 0f, w.toFloat(), h.toFloat(), top, bottom, Shader.TileMode.CLAMP)
        c.drawRoundRect(RectF(0f, 0f, w.toFloat(), h.toFloat()), radius, radius, p)
        // a soft light in the top-left corner, like glass catching the light
        val glow = Paint(Paint.ANTI_ALIAS_FLAG)
        glow.shader = android.graphics.RadialGradient(w * 0.15f, 0f, w * 0.7f, Color.argb(46, 255, 255, 255), Color.TRANSPARENT, Shader.TileMode.CLAMP)
        glow.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_ATOP)
        c.drawRoundRect(RectF(0f, 0f, w.toFloat(), h.toFloat()), radius, radius, glow)
        return out
    }
}
