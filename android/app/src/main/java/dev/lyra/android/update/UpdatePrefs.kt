package dev.lyra.android.update

import android.content.Context
import org.json.JSONObject

enum class Phase { IDLE, CHECKING, AVAILABLE, DOWNLOADING, VERIFYING, READY, INSTALLING, ERROR }

/** Everything the updater remembers (settings and progress), so it survives the process being killed. */
class UpdatePrefs(ctx: Context) {
    private val sp = ctx.applicationContext.getSharedPreferences("lyra_update", Context.MODE_PRIVATE)

    var channel: Channel
        get() = Channel.from(sp.getString("channel", null))
        set(v) = sp.edit().putString("channel", v.key).apply()

    /** Background downloads wait for an unmetered network (Wi-Fi) unless the user taps Download themselves. */
    var unmeteredOnly: Boolean
        get() = sp.getBoolean("unmetered", true)
        set(v) = sp.edit().putBoolean("unmetered", v).apply()

    var autoCheck: Boolean
        get() = sp.getBoolean("autoCheck", true)
        set(v) = sp.edit().putBoolean("autoCheck", v).apply()

    /** Install a verified update by itself when nothing is playing (needs the "install unknown apps" permission). */
    var autoInstall: Boolean
        get() = sp.getBoolean("autoInstall", false)
        set(v) = sp.edit().putBoolean("autoInstall", v).apply()

    var lastCheckAt: Long
        get() = sp.getLong("lastCheckAt", 0)
        set(v) = sp.edit().putLong("lastCheckAt", v).apply()

    var phase: Phase
        get() = runCatching { Phase.valueOf(sp.getString("phase", null) ?: "IDLE") }.getOrDefault(Phase.IDLE)
        set(v) = sp.edit().putString("phase", v.name).apply()

    var release: ReleaseInfo?
        get() = sp.getString("release", null)?.let { runCatching { ReleaseInfo.fromJson(JSONObject(it)) }.getOrNull() }
        set(v) = sp.edit().apply { if (v == null) remove("release") else putString("release", v.toJson().toString()) }.apply()

    var downloadedBytes: Long
        get() = sp.getLong("downloaded", 0)
        set(v) = sp.edit().putLong("downloaded", v).apply()

    var error: String?
        get() = sp.getString("error", null)
        set(v) = sp.edit().apply { if (v == null) remove("error") else putString("error", v) }.apply()

    /** SHA-256 of the APK as verified, so the install step can tell the file was not swapped on disk meanwhile. */
    var verifiedSha: String?
        get() = sp.getString("verifiedSha", null)
        set(v) = sp.edit().apply { if (v == null) remove("verifiedSha") else putString("verifiedSha", v) }.apply()

    var notifiedTag: String?
        get() = sp.getString("notifiedTag", null)
        set(v) = sp.edit().apply { if (v == null) remove("notifiedTag") else putString("notifiedTag", v) }.apply()

    var etag: String?
        get() = sp.getString("etag", null)
        set(v) = sp.edit().apply { if (v == null) remove("etag") else putString("etag", v) }.apply()
}
