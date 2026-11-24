# Android app audit (roadmap item 13)

Scope: widget, lyrics notification, lock screen, ambient / AOD, overlay, tile and shortcut, permissions and onboarding,
battery behaviour, background limits, MediaMonitor accuracy, manifest, WebView hardening, F-Droid. Not covered here
(owned by other work): clip cache, recorder, TV pairing, the updater. Android Auto (`car/*`) was reviewed only.

No device or emulator was available. Everything below is compile-checked and unit-tested (pure Kotlin) but not run on a
phone. Status column: **fixed** = changed in this pass, **open** = left for the owner.

## Findings

| # | Area | Finding | Status |
|---|------|---------|--------|
| 1 | Reliability | `Rpc.handle` let any `JSONException` (a missing or mistyped argument from the page) escape the WebView message callback and crash the app. | fixed: every method runs inside one guard that answers with an error |
| 2 | Reliability | No `onListenerDisconnected`: after the system or the process drops the notification listener, Lyra never asked to be rebound, so "what is playing" silently stopped until the app was opened. | fixed: `requestRebind`, connection state kept for the self-check |
| 3 | Reliability | Nothing restored the lyrics notification, the floating widget or "Keep Lyra running" after a reboot or an app update; they only came back when the user opened Lyra. | fixed: opt-in-only `BootReceiver` (`BOOT_COMPLETED`, `MY_PACKAGE_REPLACED`) plus a restore on listener connect; "Keep Lyra running" now has a native pref |
| 4 | Accuracy | Position maths was copied in `now()` and `snapshotJson()`. It treated `PLAYBACK_POSITION_UNKNOWN` (-1) as a real time, extrapolated while BUFFERING, and trusted `playbackSpeed = 0` from players that report 0 while playing, so lyrics froze or ran from a negative time. | fixed: `PlaybackMath` (one implementation, unit tested) |
| 5 | Accuracy | Players that report no position at all (some radio / podcast / web players) showed lyrics stuck at 0:00. | fixed: `PositionFallback` estimates from play time since the song changed and the JSON says `positionEstimated: true` |
| 6 | Reliability | `LyricsNotificationService.refresh()` posted to the main thread and could run after `onDestroy`, recreating (and leaking) the media session it had just released. | fixed |
| 7 | Battery | Lyrics notification ticked every 500 ms while the screen was on, even when nothing was playing. | fixed: 2 s when paused |
| 8 | Battery | `AmbientActivity` kept the ambient-light sensor registered while paused (screen off, another app on top) until `onDestroy`. | fixed: unregistered in `onPause`, re-registered in `onResume` |
| 9 | Battery | The floating widget's WebView kept running while hidden behind Lyra's own screen. | fixed: paused while hidden |
| 10 | Reliability | A WebView render-process crash (low memory, WebView update) killed the whole app because `onRenderProcessGone` was not handled. | fixed: the screen is recreated, the floating widget rebuilt |
| 11 | Security | `AmbientToggleActivity` was exported, so any app could switch ambient mode on and off. App shortcuts and the widget do not need it. | fixed: not exported |
| 12 | Security | `fetch` RPC allowed https URLs to any host, including loopback and private ranges. Only Lyra's own page can call it, but a compromised page should not be able to probe the LAN. | fixed: private, loopback and link-local hosts refused (unit tested) |
| 13 | Security | Cleartext traffic relied on the targetSdk default. | fixed: explicit `usesCleartextTraffic="false"` |
| 14 | Security | WebView: file and content access already off, mixed content blocked, RPC bound to one origin and the main frame only. Missing: pop-ups and multiple windows. | fixed: `setSupportMultipleWindows(false)`, no JS-opened windows |
| 15 | Onboarding | The permission screen did not say what Lyra reads and what it does not, and had no answer for Android 13+ greying out "Notification access" for APKs installed outside a store ("Restricted setting"). | fixed: explains why, and gets the user to Allow restricted settings |
| 16 | Diagnostics | No way to see why lyrics are not following the music (access off, listener not connected, battery restriction, notifications blocked, OEM killer). | fixed: "Why isn't it working?" self-check with one-tap fixes, per-phone-maker steps and a no-personal-data report to copy |
| 17 | Accessibility | Floating widget close button: no label, 40x26 dp target. Widget look picker: selected state only drawn as a tick. | fixed |
| 18 | Accessibility | Notification contrast: the colourised card darkened the cover colour by a fixed 55 %, so a pale cover gave grey with white text below 4.5:1. | fixed: `NotificationTint` guarantees 4.5:1 (unit tested) |
| 19 | Battery | `KeepAliveService` / `OverlayService` notifications used a stock system icon. | fixed: Lyra status icon |
| 20 | Storage | Prefs: `lyrics-notification`, `overlay`, `lyra_widget` (per-widget look and last vibe), ambient config. Backups are off (`allowBackup=false`), so nothing leaves the phone. No change needed. | ok |
| 21 | Foreground services | All three FGS use `specialUse` with the `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` text and the matching permission. `specialUse` has no Android 14/15 timeout and is not blocked from `BOOT_COMPLETED`. Starting one from the background is wrapped so Android 12+ refusals do not crash. | ok / fixed |
| 22 | Widget | Eight providers, all `updatePeriodMillis=0`, redrawn by `LyraWidgetUpdater` only while the screen is on and music plays, sized with target cells and minimum resize sizes. Lyrics shown depend on the app process having received them from the page (stated in the widget text when it has not). | ok; limitation noted |
| 23 | Android Auto | `car/*` reviewed: lyrics are kept off the session unless the user opts in. No change. | ok |
| 24 | F-Droid | `fdroid/dev.lyra.android.yml` builds with `lyraNoUpdater`, but the merged manifest still declares `REQUEST_INSTALL_PACKAGES` and `UPDATE_PACKAGES_WITHOUT_USER_ACTION`, which F-Droid reviewers normally flag. Fixing it means a build-type manifest overlay, which touches the updater. | open (owner decision) |
| 25 | Shortcut | `shortcuts.xml` hard-codes `targetPackage="dev.lyra.android"`, so the debug build (`.debug` suffix) has a broken shortcut. Release is fine. | open (debug only) |

## New permission

`RECEIVE_BOOT_COMPLETED` (normal permission, no prompt). Used only to bring back what the user already switched on:
the lyrics notification, the floating widget, "Keep Lyra running". Nothing starts for a user who never enabled them.

## Real-device test list

See the final section of `docs/android-background.md`.
