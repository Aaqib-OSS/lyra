package dev.lyra.android

import android.app.KeyguardManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.text.TextUtils
import android.text.format.DateFormat
import android.view.View
import java.util.Date

/** What the always-on screen shows. A data class so an identical frame never causes a redraw. */
data class AodFrame(
    val before: String = "",
    val current: String = "",
    val next1: String = "",
    val next2: String = "",
    val title: String = "",
    val artist: String = "",
    val paused: Boolean = false,
    val tint: Int = Color.WHITE
)

/**
 * The always-on lyrics screen, drawn by hand: pure black, a few large dim lines, optional clock, slow pixel shift.
 * No WebView, no animation, no per-frame work: it redraws only when [setFrame] gets a different frame (one per lyric
 * line), when the clock minute changes, or when the pixel shift moves (once a minute).
 */
class AodLyricsView(ctx: Context) : View(ctx) {
    private var frame = AodFrame()
    private var layouts: List<Pair<StaticLayout, Int>> = emptyList() // layout + level (0 current, 1 near, 2 far)
    private var footer: StaticLayout? = null
    private var clockText = ""
    var showClock = true

    /** 1 on phones; the TV screen saver raises it so the lines are readable from a sofa (all text sizes and gaps scale). */
    var textScale = 1f
        set(v) {
            if (v == field) return
            field = v
            clockPaint.textSize = 58 * d * v
            rebuild()
            invalidate()
        }
    private var dx = 0
    private var dy = 0
    private val d = resources.displayMetrics.density

    private val paint = TextPaint(TextPaint.ANTI_ALIAS_FLAG)
    private val clockPaint = TextPaint(TextPaint.ANTI_ALIAS_FLAG).apply { textSize = 58 * d; typeface = Typeface.create("sans-serif-thin", Typeface.NORMAL); textAlign = android.graphics.Paint.Align.CENTER }

    init {
        setBackgroundColor(Color.BLACK)
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    }

    fun setShift(x: Int, y: Int) {
        if (x == dx && y == dy) return
        dx = (x * d).toInt()
        dy = (y * d).toInt()
        invalidate()
    }

    fun setClock(text: String) {
        if (text == clockText) return
        clockText = text
        invalidate()
    }

    fun setFrame(f: AodFrame) {
        if (f == frame) return
        frame = f
        contentDescription = listOf(f.current, f.title, f.artist).filter { it.isNotBlank() }.joinToString(". ")
        rebuild()
        invalidate()
    }

    override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) {
        super.onSizeChanged(w, h, ow, oh)
        rebuild()
    }

    private fun shade(level: Float): Int {
        val t = frame.tint
        return Color.rgb((Color.red(t) * level).toInt(), (Color.green(t) * level).toInt(), (Color.blue(t) * level).toInt())
    }

    private fun lay(text: String, sizeSp: Float, bold: Boolean, width: Int, max: Int): StaticLayout {
        val p = TextPaint(TextPaint.ANTI_ALIAS_FLAG).apply {
            textSize = sizeSp * d * textScale
            typeface = if (bold) Typeface.create("sans-serif-medium", Typeface.NORMAL) else Typeface.DEFAULT
        }
        return StaticLayout.Builder.obtain(text, 0, text.length, p, width)
            .setAlignment(Layout.Alignment.ALIGN_CENTER)
            .setMaxLines(max)
            .setEllipsize(TextUtils.TruncateAt.END)
            .setLineSpacing(0f, 1.1f)
            .build()
    }

    private fun rebuild() {
        val w = (width * 0.84f).toInt()
        if (w <= 0) return
        val f = frame
        val out = ArrayList<Pair<StaticLayout, Int>>()
        if (f.before.isNotBlank()) out.add(lay(f.before, 20f, false, w, 2) to 2)
        if (f.current.isNotBlank()) out.add(lay(f.current, 32f, true, w, 4) to 0)
        if (f.next1.isNotBlank()) out.add(lay(f.next1, 22f, false, w, 2) to 1)
        if (f.next2.isNotBlank()) out.add(lay(f.next2, 20f, false, w, 2) to 2)
        layouts = out
        val sub = listOf(f.title, if (f.paused) "${f.artist} · paused".trimStart(' ', '·') else f.artist).filter { it.isNotBlank() }.joinToString("\n")
        footer = if (sub.isBlank()) null else lay(sub, 14f, false, w, 2)
    }

    override fun onDraw(c: Canvas) {
        c.drawColor(Color.BLACK)
        c.save()
        c.translate(dx.toFloat(), dy.toFloat())
        val cx = width / 2f
        if (showClock && clockText.isNotEmpty()) {
            clockPaint.color = shade(0.38f)
            c.drawText(clockText, cx, height * 0.14f, clockPaint)
        }
        val gap = 18 * d * textScale
        val total = layouts.sumOf { it.first.height.toDouble() }.toFloat() + gap * (layouts.size - 1).coerceAtLeast(0)
        var y = (height * 0.5f - total / 2f).coerceAtLeast(height * 0.2f)
        val left = (width - width * 0.84f) / 2f
        for ((l, level) in layouts) {
            l.paint.color = shade(if (level == 0) 0.62f else if (level == 1) 0.34f else 0.2f)
            c.save()
            c.translate(left, y)
            l.draw(c)
            c.restore()
            y += l.height + gap
        }
        footer?.let {
            it.paint.color = shade(0.3f)
            c.save()
            c.translate(left, height * 0.9f - it.height)
            it.draw(c)
            c.restore()
        }
        c.restore()
    }
}

/**
 * Keeps an [AodLyricsView] current with the least possible wake-ups: one update per lyric line while music plays,
 * one per minute for the clock and the pixel shift, and nothing at all while paused (apart from the clock minute).
 */
class AodDriver(
    private val ctx: Context,
    private val view: AodLyricsView,
    /** Where "what is playing" comes from: this device (default) or, on a TV, a paired Lyra app. */
    private val source: dev.lyra.android.tv.PlaybackSource = dev.lyra.android.tv.LocalSource
) {
    private val h = Handler(Looper.getMainLooper())
    private val listener = { tick() }
    private val kg = ctx.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
    private val clockOn = AmbientConfig.clock(ctx)
    private val shiftOn = AmbientConfig.pixelShift(ctx)
    private var step = 0
    private var lastShiftAt = SystemClock.elapsedRealtime()
    private var tintFor: String? = null
    private var tint = Color.WHITE
    private var running = false
    private val tickRunnable = Runnable { tick() }

    fun start() {
        if (running) return
        running = true
        view.showClock = clockOn
        source.addListener(listener)
        tick()
    }

    fun stop() {
        running = false
        h.removeCallbacks(tickRunnable)
        source.removeListener(listener)
    }

    /** Cover colour pushed to full strength; the view then draws it very dim. Neutral when the cover is grey. */
    private fun tintOf(id: String, art: Bitmap?): Int {
        if (tintFor == id) return tint
        tintFor = id
        tint = Color.rgb(235, 235, 235)
        if (art != null) {
            val px = Bitmap.createScaledBitmap(art, 1, 1, true).getPixel(0, 0)
            val m = maxOf(Color.red(px), Color.green(px), Color.blue(px))
            val spread = m - minOf(Color.red(px), Color.green(px), Color.blue(px))
            if (m > 40 && spread > 30) {
                val k = 255f / m
                tint = Color.rgb((Color.red(px) * k).toInt().coerceAtMost(255), (Color.green(px) * k).toInt().coerceAtMost(255), (Color.blue(px) * k).toInt().coerceAtMost(255))
            }
        }
        return tint
    }

    private fun tick() {
        if (!running) return
        h.removeCallbacks(tickRunnable)
        val now = source.now()
        val locked = kg.isKeyguardLocked && !LyricsNotifier.publicOnLock(ctx) // privacy: no lyric lines over a locked screen
        var delay = Long.MAX_VALUE
        if (now == null || now.isAd) {
            view.setFrame(AodFrame(title = if (now?.isAd == true) "Ad playing" else "Nothing playing"))
        } else {
            val lines = if (LyricsNotifier.linesTrack == now.id && !locked) LyricsNotifier.lines else emptyList()
            val idx = if (lines.isEmpty()) -1 else LyricsNotifier.activeIndex(now.positionMs)
            fun text(i: Int) = lines.getOrNull(i)?.text?.ifBlank { "♪" } ?: ""
            view.setFrame(
                AodFrame(
                    before = if (idx > 0) text(idx - 1) else "",
                    current = if (lines.isEmpty()) now.title else if (idx < 0) "♪" else text(idx),
                    next1 = if (lines.isEmpty()) now.artist else text(idx + 1),
                    next2 = if (lines.isEmpty()) "" else text(idx + 2),
                    title = if (lines.isEmpty()) "" else now.title,
                    artist = if (lines.isEmpty()) "" else now.artist,
                    paused = !now.playing,
                    tint = tintOf(now.id, now.art)
                )
            )
            if (now.playing && lines.isNotEmpty()) {
                delay = AodLogic.nextDelayMs(lines.getOrNull(idx + 1)?.t, now.positionMs, LyricsNotifier.offsetMs)
            }
        }
        val wall = System.currentTimeMillis()
        if (clockOn) {
            val f = if (DateFormat.is24HourFormat(ctx)) "HH:mm" else "h:mm"
            view.setClock(DateFormat.format(f, Date(wall)).toString())
            delay = minOf(delay, AodLogic.msToNextMinute(wall))
        }
        if (shiftOn) {
            val t = SystemClock.elapsedRealtime()
            if (t - lastShiftAt >= SHIFT_EVERY_MS) {
                lastShiftAt = t
                step++
                val (x, y) = AodLogic.pixelShift(step, 6)
                view.setShift(x, y)
            }
            delay = minOf(delay, (SHIFT_EVERY_MS - (t - lastShiftAt)).coerceAtLeast(1000L))
        }
        // nothing to animate (paused, no clock, no shift): no timer, the media listener wakes us
        if (delay != Long.MAX_VALUE) h.postDelayed(tickRunnable, delay)
    }

    companion object {
        const val SHIFT_EVERY_MS = 60_000L
    }
}
