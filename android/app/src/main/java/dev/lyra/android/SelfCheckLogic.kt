package dev.lyra.android

/**
 * The rules behind "Why isn't it working?": what to look at, in which order, and what to tell the user. Pure (no Android
 * types) so it is unit tested; [SelfCheck] fills [Inputs] from the system and hands the result to the web UI.
 */
object SelfCheckLogic {
    data class Inputs(
        val sdk: Int,
        val manufacturer: String,
        val notificationAccess: Boolean,
        val listenerConnected: Boolean,
        val activeSessions: Int,
        val positionReported: Boolean?, // null = no player to look at
        val notificationsAllowed: Boolean,
        val batteryUnrestricted: Boolean,
        val backgroundRestricted: Boolean,
        val lyricsNotificationOn: Boolean,
        val overlayOn: Boolean,
        val overlayGranted: Boolean,
        val keepRunningOn: Boolean
    )

    enum class Level { OK, WARN, BAD, INFO }

    /** [fix] is one of the ids [SelfCheck.fix] understands, or null. */
    data class Check(val id: String, val level: Level, val title: String, val detail: String, val fix: String? = null, val fixLabel: String? = null)

    fun evaluate(i: Inputs): List<Check> {
        val out = ArrayList<Check>()

        // 1 the permission everything else depends on
        if (i.notificationAccess) {
            out += Check("access", Level.OK, "Notification access is on", "Lyra can see which song is playing. It does not read your notifications.")
        } else {
            val restricted = if (i.sdk >= 33) " If the switch is greyed out, open App info, tap the menu (three dots) and choose “Allow restricted settings”, then try again." else ""
            out += Check("access", Level.BAD, "Notification access is off", "Without it Android does not tell Lyra what is playing.$restricted", "openAccessSettings", "Open notification access")
            if (i.sdk >= 33) out += Check("restricted", Level.INFO, "Switch greyed out?", "Apps installed from a file (not from a store) are blocked from this switch until you allow it in App info.", "openAppInfo", "Open App info")
        }

        // 2 is the system actually delivering sessions to us
        if (i.notificationAccess) {
            if (!i.listenerConnected) {
                out += Check("listener", Level.WARN, "Lyra is not connected to Android yet", "Android has not attached Lyra to media sessions. Switching notification access off and on again usually fixes it.", "openAccessSettings", "Open notification access")
            } else if (i.activeSessions == 0) {
                out += Check("session", Level.INFO, "No music app is playing", "Start a song in Spotify, YouTube Music or another player. Lyra shows lyrics for what it finds there.")
            } else if (i.positionReported == false) {
                out += Check("position", Level.WARN, "This player does not report the song position", "Lyra estimates where you are from when the song started. Lyrics may drift after you seek.")
            } else {
                out += Check("session", Level.OK, "Lyra can see your player", "A music app is publishing what is playing.")
            }
        }

        // 3 notifications (needed for the lyrics card and the keep-running notice)
        if (i.lyricsNotificationOn || i.keepRunningOn || i.overlayOn) {
            if (!i.notificationsAllowed) {
                out += Check("notifications", Level.BAD, "Notifications are blocked for Lyra", "The lyrics notification, the keep-running notice and the floating widget need to show one quiet notification.", "openNotificationSettings", "Open notification settings")
            } else {
                out += Check("notifications", Level.OK, "Notifications are allowed", "Lyra's lyrics card can appear in the shade and on the lock screen.")
            }
        }

        // 4 floating widget
        if (i.overlayOn && !i.overlayGranted) {
            out += Check("overlay", Level.BAD, "“Display over other apps” is off", "The floating lyrics need it. Turn it on, then come back.", "openOverlaySettings", "Open the setting")
        }

        // 5 battery
        if (i.backgroundRestricted) {
            out += Check("restricted-bg", Level.BAD, "Background use is restricted", "Android stops Lyra whenever the screen is off. Choose “Unrestricted” (or “Don’t optimise”) for Lyra.", "openBatterySettings", "Open battery settings")
        } else if (!i.batteryUnrestricted) {
            out += Check("battery", if (OemGuide.isAggressive(i.manufacturer)) Level.WARN else Level.INFO, "Battery saver may close Lyra",
                "Only matters if the lyrics notification or the widget stop while the screen is off. Allow background use to keep them going.", "openBatterySettings", "Open battery settings")
        } else {
            out += Check("battery", Level.OK, "Lyra may run in the background", "Battery optimisation is off for Lyra.")
        }
        return out
    }

    /** Worst level wins; INFO does not count as a problem. */
    fun problems(checks: List<Check>): Int = checks.count { it.level == Level.BAD || it.level == Level.WARN }
}

/** Plain steps for the phone makers that close apps the hardest (see dontkillmyapp.com). Menu names move between versions: say so. */
object OemGuide {
    data class Guide(val name: String, val steps: List<String>)

    private val aggressive = listOf("xiaomi", "redmi", "poco", "huawei", "honor", "oppo", "realme", "oneplus", "vivo", "iqoo", "samsung", "meizu", "asus", "nothing", "tecno", "infinix", "itel")

    fun isAggressive(manufacturer: String): Boolean = aggressive.any { manufacturer.lowercase().contains(it) }

    fun forManufacturer(manufacturer: String): Guide? {
        val m = manufacturer.lowercase()
        return when {
            m.contains("samsung") -> Guide("Samsung", listOf(
                "Settings → Apps → Lyra → Battery → choose “Unrestricted”.",
                "Settings → Battery → Background usage limits: remove Lyra from “Sleeping apps” and “Deep sleeping apps”.",
                "Recent apps: tap the Lyra icon → “Keep open” (lock)."))
            m.contains("xiaomi") || m.contains("redmi") || m.contains("poco") -> Guide("Xiaomi / Redmi / POCO (MIUI, HyperOS)", listOf(
                "Settings → Apps → Manage apps → Lyra → Battery saver → “No restrictions”.",
                "Same screen → turn on “Autostart”.",
                "Recent apps: long-press the Lyra card → lock icon."))
            m.contains("huawei") || m.contains("honor") -> Guide("Huawei / Honor", listOf(
                "Settings → Battery → App launch → Lyra → switch to “Manage manually” and allow Auto-launch, Secondary launch and Run in background.",
                "Recent apps: pull the Lyra card down to lock it."))
            m.contains("oppo") || m.contains("realme") || m.contains("oneplus") -> Guide("OPPO / realme / OnePlus", listOf(
                "Settings → Battery → turn off “Optimise battery use” for Lyra (App battery management → Lyra → Allow background activity).",
                "Settings → Apps → Lyra → Auto launch → on.",
                "Recent apps: long-press the Lyra card → Lock."))
            m.contains("vivo") || m.contains("iqoo") -> Guide("vivo / iQOO", listOf(
                "Settings → Battery → Background power consumption → Lyra → “Allow”.",
                "Settings → Apps → Autostart → allow Lyra."))
            m.contains("google") -> Guide("Pixel", listOf("Settings → Apps → Lyra → App battery usage → “Unrestricted”."))
            else -> if (isAggressive(m)) Guide(manufacturer.replaceFirstChar { it.uppercase() }, listOf(
                "Settings → Apps → Lyra → Battery → “Unrestricted” (or “Don’t optimise”).",
                "Look for “Autostart” or “Background activity” for Lyra and allow it.")) else null
        }
    }
}
