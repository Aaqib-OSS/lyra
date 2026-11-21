package dev.lyra.android

/** Pure rules for the always-on lyrics screen, the lock-screen card updates and charge auto-start (unit tested, no Android types). */
object AodLogic {
    /** How long to sleep until the next lyric line starts: never busy-loop (min), and re-check the clock now and then (max). */
    fun nextDelayMs(nextLineAtMs: Long?, posMs: Long, offsetMs: Long, minMs: Long = 400, maxMs: Long = 10_000): Long {
        if (nextLineAtMs == null) return maxMs
        return (nextLineAtMs - (posMs + offsetMs)).coerceIn(minMs, maxMs)
    }

    /** Milliseconds until the wall clock shows the next minute (the on-screen clock only changes then). */
    fun msToNextMinute(nowMs: Long): Long = 60_000L - (nowMs % 60_000L) + 50L

    /** Anti burn-in: a slow walk over 9 positions around the centre, [stepPx] pixels apart. No two steps in a row are the same. */
    fun pixelShift(step: Int, stepPx: Int): Pair<Int, Int> {
        val p = SHIFT[Math.floorMod(step, SHIFT.size)]
        return Pair(p.first * stepPx, p.second * stepPx)
    }

    /** Brightness multiplier: full until [dimAfterMs] without activity, then half. 0 disables the extra dimming. */
    fun dimFactor(idleMs: Long, dimAfterMs: Long): Float = if (dimAfterMs > 0 && idleMs >= dimAfterMs) 0.5f else 1f

    /**
     * Start the ambient screen by itself? Only when the user chose "on charge", the phone is charging, the screen is
     * on (we never wake a dark phone), music is playing, the user did not just close it, and Android lets a
     * background app open an activity (the "display over other apps" permission is the documented exemption).
     */
    fun shouldAutoStart(trigger: String, charging: Boolean, interactive: Boolean, playing: Boolean, suppressed: Boolean, overlayGranted: Boolean, alreadyOn: Boolean): Boolean =
        trigger == "charge" && charging && interactive && playing && !suppressed && overlayGranted && !alreadyOn

    private val SHIFT = listOf(0 to 0, 1 to 0, 1 to 1, 0 to 1, -1 to 1, -1 to 0, -1 to -1, 0 to -1, 1 to -1)
}
