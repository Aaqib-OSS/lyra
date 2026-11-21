package dev.lyra.android.update

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import dev.lyra.android.MainActivity
import dev.lyra.android.R

/** The one quiet notification the updater uses ("update available", "ready to install", "could not update"). */
object UpdateNotifier {
    private const val CHANNEL = "lyra_update"
    private const val ID = 0x4c75

    fun show(ctx: Context, title: String, text: String, action: PendingIntent? = null) {
        try {
            val nm = ctx.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "App updates", NotificationManager.IMPORTANCE_LOW))
            val open = PendingIntent.getActivity(
                ctx, 0, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            nm.notify(
                ID,
                Notification.Builder(ctx, CHANNEL)
                    .setSmallIcon(R.drawable.ic_stat_lyra)
                    .setContentTitle(title)
                    .setContentText(text)
                    .setStyle(Notification.BigTextStyle().bigText(text))
                    .setContentIntent(action ?: open)
                    .setAutoCancel(true)
                    .build()
            )
        } catch (_: SecurityException) {
            // notifications switched off: the Settings page still shows the update
        }
    }

    fun cancel(ctx: Context) = ctx.getSystemService(NotificationManager::class.java).cancel(ID)
}
