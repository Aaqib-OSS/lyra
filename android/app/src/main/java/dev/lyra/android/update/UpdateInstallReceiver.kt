package dev.lyra.android.update

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build

/** Receives the PackageInstaller session result: asks for confirmation when Android wants it, records failures. */
class UpdateInstallReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val prefs = UpdatePrefs(ctx)
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = (if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java) else intent.getParcelableExtra(Intent.EXTRA_INTENT)) ?: return
                if (intent.getBooleanExtra(EXTRA_USER, false)) {
                    // the user just tapped Install: show Android's confirmation straight away
                    try {
                        ctx.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    } catch (_: Exception) {
                        notifyConfirm(ctx, confirm)
                    }
                } else {
                    notifyConfirm(ctx, confirm) // background start: a notification is the only reliable way to ask
                }
            }
            PackageInstaller.STATUS_SUCCESS -> {
                // usually the process is replaced before this runs; UpdateManager.reconcile() cleans up on the next start
                UpdateNotifier.cancel(ctx)
                prefs.phase = Phase.IDLE
                prefs.release = null
                UpdateManager.cleanup(ctx)
            }
            PackageInstaller.STATUS_FAILURE_ABORTED -> {
                // the user declined: the verified file is still there, they can try again
                UpdateNotifier.cancel(ctx)
                prefs.phase = Phase.READY
            }
            else -> {
                val msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE).orEmpty()
                prefs.phase = Phase.ERROR
                prefs.error = "Android could not install the update" + if (msg.isNotBlank()) " ($msg)." else "."
                UpdateNotifier.show(ctx, "Lyra update failed", prefs.error!!)
            }
        }
    }

    private fun notifyConfirm(ctx: Context, confirm: Intent) {
        val pi = PendingIntent.getActivity(ctx, 1, confirm, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        UpdateNotifier.show(ctx, "Lyra update ready", "Tap to finish installing the new version.", pi)
    }

    companion object {
        const val EXTRA_USER = "dev.lyra.android.update.USER"
    }
}
