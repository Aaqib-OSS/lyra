package dev.lyra.android.tv

import android.annotation.SuppressLint
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import dev.lyra.android.MediaListenerService
import dev.lyra.android.MediaMonitor
import org.json.JSONObject

enum class TvMode { LOCAL, PAIRED }

/** What the TV remembers: where the music comes from, and the pairing code (kept so the QR stays valid across restarts). */
object TvPrefs {
    private const val FILE = "lyra_tv"
    private fun p(ctx: Context) = ctx.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun mode(ctx: Context): TvMode = if (p(ctx).getString("mode", "local") == "paired") TvMode.PAIRED else TvMode.LOCAL
    fun setMode(ctx: Context, m: TvMode) = p(ctx).edit().putString("mode", if (m == TvMode.PAIRED) "paired" else "local").apply()

    fun code(ctx: Context): String {
        val existing = p(ctx).getString("code", null)
        if (existing != null && PairingCode.normalize(existing) != null) return existing
        return PairingCode.generate().also { p(ctx).edit().putString("code", it).apply() }
    }

    /** A new code, e.g. when the old one was shown somewhere it should not have been. */
    fun resetCode(ctx: Context): String = PairingCode.generate().also { p(ctx).edit().putString("code", it).apply() }

    /** The name people know this TV by (Settings > About), shown in the pairing screen and on the other device. */
    fun deviceName(ctx: Context): String =
        runCatching { Settings.Global.getString(ctx.contentResolver, "device_name") }.getOrNull()?.takeIf { it.isNotBlank() } ?: Build.MODEL
}

/**
 * The source the TV page and the screen saver use: the TV's own media session ([LocalSource]) or a paired Lyra app
 * ([PairedSource]), chosen by [TvPrefs]. Switching is instant; listeners (the page push, the screen saver) are told.
 */
object TvSource : PlaybackSource {
    private val paired = PairedSource(TvTransports.create())
    private val listeners = mutableListOf<() -> Unit>()
    private val forward = { listeners.toList().forEach { it() } }
    private var wired = false
    @SuppressLint("StaticFieldLeak") // always the application context
    private var appCtx: Context? = null

    /** Call once from whatever starts first (activity or screen saver). Idempotent. */
    fun init(ctx: Context) {
        val app = ctx.applicationContext
        appCtx = app
        if (!wired) {
            wired = true
            LocalSource.addListener(forward)
            paired.addListener(forward)
        }
        apply(app)
    }

    private fun apply(ctx: Context) {
        if (TvPrefs.mode(ctx) == TvMode.PAIRED) paired.start(TvPrefs.code(ctx), TvPrefs.deviceName(ctx)) else paired.stop()
    }

    private fun active(): PlaybackSource {
        val c = appCtx
        return if (c != null && TvPrefs.mode(c) == TvMode.PAIRED) paired else LocalSource
    }

    fun setMode(ctx: Context, m: TvMode) {
        TvPrefs.setMode(ctx, m)
        apply(ctx.applicationContext)
        if (m == TvMode.LOCAL) LocalSource.refresh(ctx)
        forward()
    }

    /** A new pairing code (the old QR stops working); a running pairing restarts with it. */
    fun resetCode(ctx: Context) {
        TvPrefs.resetCode(ctx)
        paired.stop()
        apply(ctx.applicationContext)
        forward()
    }

    val isPaired: Boolean get() = paired.connected

    override fun snapshotJson(ctx: Context) = active().snapshotJson(ctx)
    override fun statusJson(ctx: Context) = active().statusJson(ctx)
    override fun queueJson() = active().queueJson()
    override fun command(json: String) = active().command(json)
    override fun addListener(l: () -> Unit) { listeners.add(l) }
    override fun removeListener(l: () -> Unit) { listeners.remove(l) }
    override fun refresh(ctx: Context) = active().refresh(ctx)
    override fun hasAccess(ctx: Context) = active().hasAccess(ctx)
    override fun now() = active().now()
}

/** The page's `tvState` / `tvSetMode` / `tvOpenAccess` calls (see src/android-web/tv.ts). Added to Rpc.kt as one `when` branch. */
object TvRpc {
    val METHODS = setOf("tvState", "tvSetMode", "tvOpenAccess", "tvResetCode")

    /** Whether this TV has a screen where the user can allow notification access (many Android TV builds hide it). */
    fun canOpenAccessSettings(ctx: Context): Boolean =
        Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).resolveActivity(ctx.packageManager) != null

    fun state(ctx: Context): JSONObject {
        val code = TvPrefs.code(ctx)
        val name = TvPrefs.deviceName(ctx)
        val listener = ComponentName(ctx, MediaListenerService::class.java).flattenToString()
        return JSONObject()
            .put("mode", if (TvPrefs.mode(ctx) == TvMode.PAIRED) "paired" else "local")
            .put("hasAccess", MediaMonitor.hasAccess(ctx))
            .put("canOpenAccessSettings", canOpenAccessSettings(ctx))
            .put("paired", TvSource.isPaired)
            .put("code", PairingCode.format(code))
            .put("link", PairingCode.link(code, name))
            .put("deviceName", name)
            .put("adb", "adb shell cmd notification allow_listener $listener")
    }

    fun call(ctx: Context, method: String, args: org.json.JSONArray): Any? = when (method) {
        "tvState" -> state(ctx)
        "tvSetMode" -> {
            TvSource.setMode(ctx, if (args.optString(0) == "paired") TvMode.PAIRED else TvMode.LOCAL)
            true
        }
        "tvResetCode" -> {
            TvSource.resetCode(ctx)
            true
        }
        "tvOpenAccess" -> runCatching {
            ctx.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            true
        }.getOrDefault(false)
        else -> false
    }
}
