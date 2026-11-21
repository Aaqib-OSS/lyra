package dev.lyra.android.car

import android.app.UiModeManager
import android.content.Context
import org.json.JSONObject

/** Android side of Car mode: reports the car environment to the page and applies the "no running text on a car display" default. */
object CarModeSupport {
    private fun prefs(ctx: Context) = ctx.getSharedPreferences("car-mode", Context.MODE_PRIVATE)

    fun isCarDock(ctx: Context): Boolean {
        val um = ctx.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager ?: return false
        return CarLogic.isCarDock(um.currentModeType)
    }

    /** What the page needs: is the phone docked in a car (offer Car mode), and is it night. */
    fun infoJson(ctx: Context): JSONObject {
        val night = CarLogic.nightOrNull(ctx.resources.configuration.uiMode)
        return JSONObject().put("dock", isCarDock(ctx)).put("night", night ?: JSONObject.NULL)
    }

    fun lyricsOnCarSurfaces(ctx: Context): Boolean = prefs(ctx).getBoolean("lyricsOnSession", false)
    fun setLyricsOnCarSurfaces(ctx: Context, on: Boolean) = prefs(ctx).edit().putBoolean("lyricsOnSession", on).apply()

    /** True while docked in a car and the user has not opted in: the session then carries song and artist only. */
    fun suppressLyricsOnSession(ctx: Context): Boolean = !CarLogic.lyricsOnSession(isCarDock(ctx), lyricsOnCarSurfaces(ctx))
}
