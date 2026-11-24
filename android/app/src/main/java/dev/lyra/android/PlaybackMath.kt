package dev.lyra.android

/**
 * Pure rules for "where in the song are we" and "is this an ad", shared by the app, the notification, the widget and the
 * overlay. No Android types, so they are unit tested.
 */
object PlaybackMath {
    /** `PlaybackState.PLAYBACK_POSITION_UNKNOWN` */
    const val POSITION_UNKNOWN = -1L

    // PlaybackState.STATE_* values (kept as numbers so this file stays free of Android types)
    const val STATE_PLAYING = 3
    const val STATE_FAST_FORWARDING = 4
    const val STATE_REWINDING = 5
    const val STATE_BUFFERING = 6

    /** Longest gap we are willing to extrapolate over: a player that stopped refreshing its state must not run the clock for hours. */
    private const val MAX_EXTRAPOLATE_MS = 6 * 60 * 60 * 1000L

    /**
     * The position now, from the last state the player published. Returns [POSITION_UNKNOWN] when the player did not say
     * (the caller then falls back to [PositionFallback]).
     *
     * - only PLAYING / FAST_FORWARDING / REWINDING advance the clock (a buffering song is not moving);
     * - some players publish speed 0 while PLAYING: that means "normal speed", not "frozen";
     * - a missing or future update time (0 or ahead of now) means "no extrapolation", never a negative step.
     */
    fun estimate(statePosition: Long, lastUpdateElapsed: Long, speed: Float, state: Int, nowElapsed: Long, durationMs: Long): Long {
        if (statePosition < 0) return POSITION_UNKNOWN
        var pos = statePosition
        val moving = state == STATE_PLAYING || state == STATE_FAST_FORWARDING || state == STATE_REWINDING
        if (moving && lastUpdateElapsed > 0) {
            val gap = (nowElapsed - lastUpdateElapsed).coerceIn(0, MAX_EXTRAPOLATE_MS)
            val s = if (speed == 0f && state == STATE_PLAYING) 1f else speed
            if (s.isFinite()) pos += (gap * s).toLong()
        }
        if (durationMs > 0) pos = pos.coerceIn(0, durationMs) else if (pos < 0) pos = 0
        return pos
    }

    /** Spotify marks ads with "Advertisement" as artist ("Advertisement • 1 of 2") or title, or an ad media id. */
    fun isAd(title: String, artist: String, album: String, mediaId: String): Boolean =
        artist.startsWith("Advertisement", true) || title.equals("Advertisement", true) ||
            mediaId.contains(":ad:") || album.equals("Advertisement", true)
}

/**
 * For players that publish no position (some radio, podcast and web players): count the time the song has been playing
 * since it started. It cannot know about seeks, so the result is marked as an estimate by the caller.
 */
class PositionFallback {
    private var trackId: String? = null
    private var accumulated = 0L
    private var runningSince = -1L

    fun position(id: String, playing: Boolean, nowElapsed: Long): Long {
        if (id != trackId) {
            trackId = id
            accumulated = 0
            runningSince = -1
        }
        if (playing && runningSince < 0) runningSince = nowElapsed
        if (!playing && runningSince >= 0) {
            accumulated += (nowElapsed - runningSince).coerceAtLeast(0)
            runningSince = -1
        }
        return accumulated + if (runningSince >= 0) (nowElapsed - runningSince).coerceAtLeast(0) else 0
    }
}

/** Notification background colour: the cover's average colour, darkened until white text reads (WCAG 4.5:1). */
object NotificationTint {
    /** Relative luminance (0..1) of an sRGB colour. */
    fun luminance(r: Int, g: Int, b: Int): Double {
        fun lin(c: Int): Double {
            val v = c.coerceIn(0, 255) / 255.0
            return if (v <= 0.03928) v / 12.92 else Math.pow((v + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    }

    fun contrastWithWhite(r: Int, g: Int, b: Int): Double = 1.05 / (luminance(r, g, b) + 0.05)

    /** Returns r,g,b scaled down (keeping the hue) just enough for 4.5:1 against white; never brighter than the input. */
    fun darken(r: Int, g: Int, b: Int, target: Double = 4.5): Triple<Int, Int, Int> {
        var f = 0.55 // the old fixed factor is the starting look
        var out = Triple((r * f).toInt(), (g * f).toInt(), (b * f).toInt())
        var guard = 0
        while (contrastWithWhite(out.first, out.second, out.third) < target && guard++ < 40) {
            f *= 0.92
            out = Triple((r * f).toInt(), (g * f).toInt(), (b * f).toInt())
        }
        return out
    }
}

/** Which hosts the `fetch` bridge may reach: public internet only (no loopback, LAN, link-local or metadata addresses). */
object NetGuard {
    fun isAllowedHost(host: String?): Boolean {
        val h = host?.trim()?.trimStart('[')?.trimEnd(']')?.lowercase() ?: return false
        if (h.isEmpty() || h == "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan")) return false
        if (h.contains(':')) return false // an IPv6 literal: nothing Lyra talks to is addressed that way
        val parts = h.split('.')
        if (parts.size == 4 && parts.all { p -> p.isNotEmpty() && p.all { it.isDigit() } }) {
            val n = parts.map { it.toIntOrNull() ?: return false }
            if (n.any { it > 255 }) return false
            val (a, b) = n[0] to n[1]
            return !(a == 0 || a == 10 || a == 127 || (a == 169 && b == 254) || (a == 172 && b in 16..31) || (a == 192 && b == 168) || (a == 100 && b in 64..127) || a >= 224)
        }
        if (h.all { it.isDigit() } || h.startsWith("0x")) return false // 2130706433 / 0x7f000001 style loopback tricks
        return true
    }
}
