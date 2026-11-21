package dev.lyra.android

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings

/**
 * "Ambient on charge": when the phone is plugged in while music plays and the screen is on, open the ambient screen.
 * Android only lets a background app open an activity with the "display over other apps" permission, so without it
 * this does nothing; the Screen saver (Lyra as a dream) is the system's own, permission-free way to do the same.
 * Registered at run time (plug-in broadcasts do not reach manifest receivers), so it lives while Lyra's process lives.
 */
object AmbientAutoStart {
    private val main = Handler(Looper.getMainLooper())
    private var app: Context? = null
    @Volatile private var suppressed = false

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            suppressed = false
            if (intent.action == Intent.ACTION_POWER_CONNECTED) main.postDelayed({ check() }, 3000) // settle: re-check below
        }
    }

    @Synchronized
    fun ensure(ctx: Context) {
        if (app != null) return
        val a = ctx.applicationContext
        app = a
        val f = IntentFilter().apply { addAction(Intent.ACTION_POWER_CONNECTED); addAction(Intent.ACTION_POWER_DISCONNECTED) }
        if (Build.VERSION.SDK_INT >= 33) a.registerReceiver(receiver, f, Context.RECEIVER_NOT_EXPORTED) else a.registerReceiver(receiver, f)
    }

    /** The user closed the ambient screen: do not reopen it until the charger is unplugged and plugged in again. */
    fun userClosed() {
        suppressed = true
    }

    private fun check() {
        val a = app ?: return
        val bm = a.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val pm = a.getSystemService(Context.POWER_SERVICE) as PowerManager
        if (!AodLogic.shouldAutoStart(
                AmbientConfig.trigger(a), bm.isCharging, pm.isInteractive, MediaMonitor.now()?.playing == true,
                suppressed, Settings.canDrawOverlays(a), AmbientController.isOn()
            )
        ) return
        runCatching { a.startActivity(Intent(a, AmbientActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra("auto", true)) }
    }
}
