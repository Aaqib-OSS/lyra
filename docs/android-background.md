# Android: staying alive in the background

How Lyra keeps working with the screen off, after a reboot and after an update, what it asks for, and how to check a
phone. See `docs/android-audit.md` for the review behind it.

## What keeps Lyra informed

| Piece | What it needs | Notes |
|-------|---------------|-------|
| What is playing | Notification access (a notification listener that never reads notifications) | `MediaListenerService`. When Android drops it, `onListenerDisconnected` calls `requestRebind`. |
| Lyrics notification | `POST_NOTIFICATIONS` (Android 13+), foreground service `specialUse` | Ticks twice a second while a song plays, every 2 s while paused, once per line with the screen off. |
| Floating lyrics | "Display over other apps", foreground service `specialUse` | Its WebView is paused while Lyra's own screen is on top. |
| Keep Lyra running | foreground service `specialUse` | Optional. |
| Ambient | none | The light sensor is only on while the screen shows ambient mode. |

## After a reboot or an update

`BootReceiver` (`BOOT_COMPLETED`, `MY_PACKAGE_REPLACED`, not exported) and `MediaListenerService.onListenerConnected` both
call `BootRestore.restore`. It starts only what the user switched on: the lyrics notification, the floating widget (if the
overlay permission is still granted) and "Keep Lyra running". The permission added for this is `RECEIVE_BOOT_COMPLETED`.
Android 12+ can refuse to start a foreground service from the background; that is caught, and `MainActivity` restores the
same things the next time Lyra opens.

## Position accuracy

`PlaybackMath.estimate` is the one place the position is worked out:

- only PLAYING, FAST_FORWARDING and REWINDING advance the clock; BUFFERING and PAUSED hold;
- a player that publishes speed 0 while PLAYING is treated as normal speed;
- a missing or future update time never moves the position backwards, and extrapolation stops after 6 hours;
- `PLAYBACK_POSITION_UNKNOWN` (-1) is not a time: `PositionFallback` then counts play time since the song changed and the
  snapshot carries `positionEstimated: true` (it cannot know about seeks).

## "Why isn't it working?"

Settings, Phone tab, "Why isn't it working?", and the "It won't let me switch it on" button on the permission screen.
`SelfCheck` collects the inputs, `SelfCheckLogic` (pure, unit tested) turns them into checks, the web component
`AndroidCheck` shows them with one-tap fixes (`selfCheckFix` opens the matching Android screen), a per-maker battery guide
(`OemGuide`: Samsung, Xiaomi, Huawei, OPPO / realme / OnePlus, vivo, Pixel and a generic one) and a Copy report button.
The report holds the app version, the device model, the Android version and the check titles. It holds no song, account,
app-list or identifier data.

Android 13+ greys out "Notification access" for an APK installed from a file. The check says so and opens App info,
where the menu (three dots) has "Allow restricted settings".

## Real-device test list

1. Fresh install of the GitHub APK on Android 13+: open notification access, see it greyed out, follow the on-screen help
   (App info, Allow restricted settings), switch it on, come back: Lyra shows the song.
2. Deny notifications, turn on the lyrics notification: the self-check marks "Notifications are blocked" and the button
   opens the right page.
3. Turn on the lyrics notification, the floating widget and Keep Lyra running; reboot without opening Lyra. After unlock
   the notification and the widget come back (note which phone, a failure is expected on some).
4. Install a newer build over the old one: same result.
5. Force-stop Lyra, play a song: confirm the listener rebinds (the check shows "connected").
6. A player that publishes no position (some radio / web players): lyrics follow roughly; the check shows the warning.
7. Samsung / Xiaomi / OnePlus / Huawei phone: leave music playing 30 minutes with the screen off, notification still updating.
8. Ambient mode in a dark room: the light sensor stops when the screen turns off (check Developer options, sensors).
9. Floating widget: the close button is easy to hit with TalkBack; dragging still works; rotate the phone.
10. Kill the WebView process (`adb shell am kill` of the WebView sandbox, or low memory): the screen reloads, no crash.
11. TalkBack and font scale 200% on the widget look picker and the self-check screen.
