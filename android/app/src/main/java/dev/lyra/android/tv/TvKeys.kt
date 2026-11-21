package dev.lyra.android.tv

import android.view.KeyEvent

/**
 * Remote keys the page never sees as ordinary DOM keys (Android handles media keys before the WebView does). The
 * activity forwards these to `window.__lyraTv.key(name)`; D-pad, OK and Back are not here: arrows and OK reach the page
 * as ArrowUp / ... / Enter by themselves, Back goes through the activity's back callback.
 */
object TvKeys {
    fun nameFor(keyCode: Int): String? = when (keyCode) {
        KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_HEADSETHOOK -> "playpause"
        KeyEvent.KEYCODE_MEDIA_PLAY -> "play"
        KeyEvent.KEYCODE_MEDIA_PAUSE, KeyEvent.KEYCODE_MEDIA_STOP -> "pause"
        KeyEvent.KEYCODE_MEDIA_NEXT -> "next"
        KeyEvent.KEYCODE_MEDIA_PREVIOUS -> "prev"
        KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> "ffwd"
        KeyEvent.KEYCODE_MEDIA_REWIND -> "rew"
        // Menu (the three-line key), Info and the guide key open the setup screen
        KeyEvent.KEYCODE_MENU, KeyEvent.KEYCODE_INFO, KeyEvent.KEYCODE_GUIDE -> "menu"
        else -> null
    }
}
