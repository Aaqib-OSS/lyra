package dev.lyra.android

import android.app.Activity
import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject

/**
 * "Why isn't it working?": reads the state of everything Lyra depends on (permissions, battery rules, the notification
 * listener) and returns it to the web UI as plain checks with one-tap fixes. The wording lives in [SelfCheckLogic].
 * The report it builds contains no account, song, app-list or identifier data.
 */
object SelfCheck {
    val METHODS = setOf("selfCheck", "selfCheckFix")

    @Suppress("UNUSED_PARAMETER")
    fun call(ctx: Context, activity: Activity?, method: String, args: JSONArray): Any? = when (method) {
        "selfCheck" -> run(ctx)
        "selfCheckFix" -> fix(ctx, args.optString(0, ""))
        else -> null
    }

    private fun inputs(ctx: Context): SelfCheckLogic.Inputs {
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
        val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        return SelfCheckLogic.Inputs(
            sdk = Build.VERSION.SDK_INT,
            manufacturer = Build.MANUFACTURER ?: "",
            notificationAccess = MediaMonitor.hasAccess(ctx),
            listenerConnected = MediaListenerService.connected,
            activeSessions = MediaMonitor.sessionCount(),
            positionReported = MediaMonitor.positionReported(),
            notificationsAllowed = NotificationManagerCompat.from(ctx).areNotificationsEnabled(),
            batteryUnrestricted = pm.isIgnoringBatteryOptimizations(ctx.packageName),
            backgroundRestricted = Build.VERSION.SDK_INT >= 28 && am.isBackgroundRestricted,
            lyricsNotificationOn = LyricsNotifier.enabled(ctx),
            overlayOn = OverlayService.enabled(ctx),
            overlayGranted = Settings.canDrawOverlays(ctx),
            keepRunningOn = KeepAliveService.enabled(ctx)
        )
    }

    fun run(ctx: Context): String {
        val i = inputs(ctx)
        val checks = SelfCheckLogic.evaluate(i)
        val guide = OemGuide.forManufacturer(i.manufacturer)
        val version = runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull() ?: "?"
        val report = buildString {
            appendLine("Lyra self-check")
            appendLine("App: $version")
            appendLine("Device: ${Build.MANUFACTURER} ${Build.MODEL}".trim())
            appendLine("Android: ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
            appendLine("Music apps with a session: ${i.activeSessions}")
            appendLine("Player reports position: ${i.positionReported ?: "no player"}")
            checks.forEach { appendLine("[${it.level}] ${it.title}") }
        }.trimEnd()
        return JSONObject().apply {
            put("checks", JSONArray().apply {
                checks.forEach { c ->
                    put(
                        JSONObject().put("id", c.id).put("level", c.level.name.lowercase()).put("title", c.title).put("detail", c.detail)
                            .put("fix", c.fix ?: JSONObject.NULL).put("fixLabel", c.fixLabel ?: JSONObject.NULL)
                    )
                }
            })
            put("problems", SelfCheckLogic.problems(checks))
            put("oem", guide?.let { g -> JSONObject().put("name", g.name).put("steps", JSONArray(g.steps)) } ?: JSONObject.NULL)
            put("report", report)
        }.toString()
    }

    /** Opens the Android screen for [id] (one of the `fix` ids in [SelfCheckLogic.Check]); unknown ids do nothing. */
    fun fix(ctx: Context, id: String): Boolean {
        val i = when (id) {
            "openAccessSettings" -> Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            "openAppInfo" -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}"))
            "openNotificationSettings" -> Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName)
            "openOverlaySettings" -> Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${ctx.packageName}"))
            "openBatterySettings" -> Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            else -> return false
        }
        return try {
            ctx.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            true
        } catch (_: Exception) {
            // a phone maker that removed that screen: fall back to the app's own info page
            runCatching { ctx.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }.isSuccess
        }
    }
}
