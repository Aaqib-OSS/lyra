package dev.lyra.android

import android.content.Context
import org.json.JSONObject

/**
 * Ambient settings the native side needs without a web page (auto-start on charge, the native always-on screen, the
 * screen saver). The web Settings page is the only editor: it pushes the values through the `ambientConfig` RPC.
 */
object AmbientConfig {
    private fun p(ctx: Context) = ctx.getSharedPreferences("ambient", Context.MODE_PRIVATE)

    /** "minimal" = our native always-on lyrics view; "glow" / "video" = the web ambient page. */
    fun style(ctx: Context): String = p(ctx).getString("style", "video") ?: "video"
    fun native(ctx: Context): Boolean = style(ctx) == "minimal"

    /** "charge" = open by itself when the phone is plugged in while music plays; "demand" = only when asked. */
    fun trigger(ctx: Context): String = p(ctx).getString("trigger", "demand") ?: "demand"
    fun brightness(ctx: Context): Float = p(ctx).getFloat("brightness", 0.2f).coerceIn(0.03f, 1f)
    fun autoBrightness(ctx: Context): Boolean = p(ctx).getBoolean("auto", true)
    fun clock(ctx: Context): Boolean = p(ctx).getBoolean("clock", true)
    fun pixelShift(ctx: Context): Boolean = p(ctx).getBoolean("shift", true)

    /** Keep the lyric on the lock-screen media card / OEM AOD controls updated while the screen is off. */
    fun cardWhileOff(ctx: Context): Boolean = p(ctx).getBoolean("cardOff", true)

    /** Minutes without music activity before the screen dims further (0 = never). */
    fun dimAfterMin(ctx: Context): Int = p(ctx).getInt("dimMin", 10)

    fun set(ctx: Context, json: String) {
        val o = JSONObject(json)
        val e = p(ctx).edit()
        if (o.has("style")) e.putString("style", o.getString("style").takeIf { it == "minimal" || it == "glow" || it == "video" } ?: "video")
        if (o.has("trigger")) e.putString("trigger", if (o.getString("trigger") == "charge") "charge" else "demand")
        if (o.has("brightness")) e.putFloat("brightness", o.getDouble("brightness").toFloat().coerceIn(0.03f, 1f))
        if (o.has("auto")) e.putBoolean("auto", o.getBoolean("auto"))
        if (o.has("clock")) e.putBoolean("clock", o.getBoolean("clock"))
        if (o.has("shift")) e.putBoolean("shift", o.getBoolean("shift"))
        if (o.has("cardOff")) e.putBoolean("cardOff", o.getBoolean("cardOff"))
        e.apply()
        AmbientAutoStart.ensure(ctx)
        LyricsNotificationService.instance?.refresh(force = true)
    }
}
