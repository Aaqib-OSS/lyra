package dev.lyra.android

import android.app.Activity
import android.os.Build
import android.view.WindowManager

/** Show the activity above the lock screen and turn the screen on: the API 27 calls, or the equivalent window flags on API 26. */
@Suppress("DEPRECATION")
fun Activity.showOverLockScreen(on: Boolean, turnScreenOn: Boolean = on) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
        setShowWhenLocked(on)
        setTurnScreenOn(turnScreenOn)
    } else {
        val f = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or (if (turnScreenOn) WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON else 0)
        if (on) window.addFlags(f) else window.clearFlags(f)
    }
}
