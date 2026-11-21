package dev.lyra.android.car

import android.content.res.Configuration

/**
 * The car rules in one pure, unit-tested place. Lyra is a lyrics companion, not a media app that plays audio, so it is
 * not declared to Android Auto / Automotive OS (see docs/android-car.md); these rules only cover the phone itself.
 */
object CarLogic {
    /** The phone is in a car dock (UiModeManager car mode). Says nothing about whether the car is moving. */
    fun isCarDock(uiModeType: Int): Boolean = uiModeType == Configuration.UI_MODE_TYPE_CAR

    /** true = night, false = day, null = the system has not said. */
    fun nightOrNull(uiMode: Int): Boolean? = when (uiMode and Configuration.UI_MODE_NIGHT_MASK) {
        Configuration.UI_MODE_NIGHT_YES -> true
        Configuration.UI_MODE_NIGHT_NO -> false
        else -> null
    }

    /**
     * Should the media session (the one a car stereo can read over Bluetooth) carry the lyric line? While the phone is in
     * a car dock the default is no: only song and artist, never running text on a car display. The user can opt in.
     */
    fun lyricsOnSession(carDock: Boolean, optedIn: Boolean): Boolean = !carDock || optedIn
}
