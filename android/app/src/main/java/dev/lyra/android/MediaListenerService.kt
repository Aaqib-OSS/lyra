package dev.lyra.android

import android.content.ComponentName
import android.service.notification.NotificationListenerService

/**
 * Lyra never reads notifications. Android only lets an app list other apps' media sessions (what is playing)
 * if it is an enabled "notification listener", so this service exists purely to hold that permission.
 *
 * It also keeps that link alive: Android can drop a listener (low memory, the app being updated, an OEM task killer)
 * and only rebinds it by itself some of the time, so we ask for it, and bring back what the user switched on.
 */
class MediaListenerService : NotificationListenerService() {
    override fun onListenerConnected() {
        connected = true
        MediaMonitor.refresh(applicationContext)
        BootRestore.restore(applicationContext) // after a reboot or an update the system binds us before any screen opens
    }

    override fun onListenerDisconnected() {
        connected = false
        MediaMonitor.refresh(applicationContext)
        // only while the user still allows it; requestRebind is a no-op otherwise
        runCatching { requestRebind(ComponentName(this, MediaListenerService::class.java)) }
    }

    companion object {
        /** True between onListenerConnected and onListenerDisconnected; shown by the "Why isn't it working?" check. */
        @Volatile var connected = false
            private set
    }
}
