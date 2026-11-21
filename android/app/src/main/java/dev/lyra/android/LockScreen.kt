package dev.lyra.android

import android.app.Activity
import android.os.Build
import android.view.WindowManager

/** Show the activity above the lock screen and turn the screen on: the API 27 calls, or the equivalent window flags on API 26. */
@Suppress("DEPRECATION")
fun Activity.showOverLockScreen(on: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
        setShowWhenLocked(on)
        setTurnScreenOn(on)
    } else {
        val f = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        if (on) window.addFlags(f) else window.clearFlags(f)
    }
}
