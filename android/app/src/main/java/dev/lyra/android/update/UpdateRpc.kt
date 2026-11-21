package dev.lyra.android.update

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** The web Settings page's door to the updater. All calls run on a background thread (see Rpc.kt). */
object UpdateRpc {
    val METHODS = setOf("updateStatus", "updateCheck", "updateDownload", "updateInstall", "updateSettings")

    fun call(ctx: Context, method: String, args: JSONArray): Any? {
        val prefs = UpdatePrefs(ctx)
        when (method) {
            "updateStatus" -> UpdateManager.schedule(ctx)
            "updateCheck" -> try {
                UpdateManager.check(ctx, manual = true)
            } catch (e: java.io.IOException) {
                return UpdateManager.status(ctx).put("error", e.message?.let { "Could not reach GitHub ($it)." } ?: "Could not reach GitHub.")
            }
            "updateDownload" -> UpdateManager.startDownload(ctx)
            "updateInstall" -> return UpdateManager.install(ctx, userInitiated = true).also { it.put("state", UpdateManager.status(ctx)) }
            "updateSettings" -> {
                val s = args.getJSONObject(0)
                if (s.has("channel")) prefs.channel = Channel.from(s.getString("channel"))
                if (s.has("unmeteredOnly")) prefs.unmeteredOnly = s.getBoolean("unmeteredOnly")
                if (s.has("autoCheck")) prefs.autoCheck = s.getBoolean("autoCheck")
                if (s.has("autoInstall")) prefs.autoInstall = s.getBoolean("autoInstall")
                UpdateManager.schedule(ctx, replace = true)
            }
        }
        return UpdateManager.status(ctx)
    }
}
