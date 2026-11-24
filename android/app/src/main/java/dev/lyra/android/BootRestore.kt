package dev.lyra.android

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Settings

/**
 * Brings back what the user already switched on (lyrics notification, floating widget, "Keep Lyra running") after a
 * reboot or an app update, without opening Lyra. Nothing starts for a feature that is off. Android 12+ may refuse to
 * start a foreground service from the background; that is caught, and the features then return when Lyra is next opened
 * (MainActivity does the same restore).
 */
object BootRestore {
    fun restore(ctx: Context) {
        val app = ctx.applicationContext
        runCatching { if (LyricsNotifier.enabled(app)) LyricsNotifier.restoreIfEnabled(app) }
        runCatching { if (OverlayService.enabled(app) && Settings.canDrawOverlays(app)) OverlayService.restoreIfEnabled(app) }
        runCatching { if (KeepAliveService.enabled(app)) KeepAliveService.set(app, true) }
    }
}

/** Not exported: the system sends these broadcasts. `specialUse` services are not among those Android 15 bars from boot receivers. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> {
                MediaMonitor.refresh(context)
                BootRestore.restore(context)
            }
        }
    }
}
