package dev.lyra.android.update

/** Pure decisions of the updater (no Android types) so they can be unit tested. */
object UpdatePolicy {
    /** Background checks never run more often than this; a manual "Check now" only waits [MANUAL_MIN_GAP_MS]. */
    const val MIN_CHECK_INTERVAL_MS = 12 * 3_600_000L
    const val MANUAL_MIN_GAP_MS = 20_000L

    fun checkDue(now: Long, lastCheck: Long, manual: Boolean): Boolean {
        if (lastCheck <= 0 || lastCheck > now) return true // never checked, or the clock moved back
        return now - lastCheck >= if (manual) MANUAL_MIN_GAP_MS else MIN_CHECK_INTERVAL_MS
    }

    /**
     * Installing restarts Lyra, so it never happens while music is playing or a video is being recorded.
     * A user's own tap may override playback (they decided), but never an active recording.
     */
    fun mayInstallNow(playing: Boolean, recording: Boolean, userInitiated: Boolean): Boolean =
        !recording && (userInitiated || !playing)

    /** Installers that manage updates themselves: the in-app updater stays off under them (store policy). */
    private val STORE_INSTALLERS = setOf(
        "org.fdroid.fdroid", "org.fdroid.basic", "org.fdroid.fdroid.privileged", // F-Droid (IzzyOnDroid is served through it)
        "com.looker.droidify", "com.machiav3lli.fdroid", "nya.kitsunyan.foxydroid", "in.sunilpaulmathew.izzyondroid", // other F-Droid clients, IzzyOnDroid app
        "com.android.vending" // Google Play
    )

    fun isStoreManaged(installer: String?): Boolean = installer != null && installer in STORE_INSTALLERS

    /** The signing certificates of the downloaded APK must be exactly those of the installed app. */
    fun sameSigners(installed: Set<String>, candidate: Set<String>): Boolean = installed.isNotEmpty() && installed == candidate
}
