# Android ambient mode and always-on display

## What Android does not allow (honest limits)

**A third-party app cannot draw on the system always-on display (AOD).** Pixel and Samsung AODs are rendered by the
system (SystemUI's doze UI on AOSP/Pixel, One UI on Samsung) on the low-power display path, with the app processor
asleep. The public SDK has no API, no permission and no manifest hook for an app to put its own content there.
Only the OEM or a privileged/system app can. Verification: Android's documented background-start rules and public
SDK surface contain no such hook, and a web search found only workarounds, all of which are not the real AOD: the
"AOD" apps on the Play Store draw an ordinary overlay (often through an Accessibility Service) that keeps the CPU awake
and costs battery like having the screen on. Lyra will not ship an accessibility-service hack. This is checked against
documentation and secondary sources only; AOSP source was not read here, and OEM behaviour was not tested on devices.

What IS possible, and what Lyra does:

| Goal | Option | Needs |
|---|---|---|
| Lyric text near the system AOD / lock screen | MediaSession metadata + MediaStyle notification (the OEM draws it, if it chooses to) | nothing extra |
| A real "always-on" lyrics screen | Lyra's own ambient screen, kept on while music plays | screen stays on (not Doze-friendly, battery cost) |
| Lyrics while charging or docked | Screen saver (DreamService) | pick Lyra in Settings, Display, Screen saver |
| Same, started by plugging in | "Open ambient on charge" | "Display over other apps" permission |

## 1. System AOD / lock-screen integration (`LyricsNotifier.kt`)

* One `MediaSession` plus a `Notification.MediaStyle` on a low-importance, silent channel (no sound, vibration, lights, badge).
* The current line is written to `TITLE`, `DISPLAY_TITLE`, the next line to `ARTIST`, `DISPLAY_SUBTITLE`, and song info to
  `ALBUM`, `DISPLAY_DESCRIPTION`; `ALBUM_ARTIST` carries the real artist. Android does not document which field a
  vendor AOD or lock-screen card draws (the SDK only describes the display-* fields as "for UI"). So every title-like
  field carries the line. NOT verified on a device which OEM uses which field.
* **Privacy**: when "Show lyrics on lock screen" is off, the session carries only song, artist and cover. No lyric is
  put in the metadata (before, the media card could leak it), and the notification's public version says only the song.
* **Update rate**: the metadata and notification are touched only when the text changes (once per lyric line). With
  the screen on a 500 ms check runs (cheap, no change means no redraw). With the screen off and music playing, one
  timer fires at each next line (min 1 s, max 10 s; the CPU is awake for playback anyway). Paused or no synced
  lyrics: no timer at all. The switch "Lyric on lock-screen card with screen off" (default on) controls this.

## 2. Always-on lyrics screen (`AmbientActivity`, `AodLyricsView`, `AodDriver`)

The Minimal ambient style is a native, hand-drawn view (no WebView, no JS): true black, large dim lines (previous,
current, next two), optional clock, the cover colour as a very dim tint. Glow and Video styles keep using the web page.

* Brightness: slider and optional light-sensor scaling via window attributes (`screenBrightness`); after
  10 minutes with no music activity it drops to half (`AodLogic.dimFactor`).
* Anti burn-in: pixel shift over 9 positions, once a minute (switchable). No animation.
* Update rate: one redraw per lyric line, one per minute for the clock/shift, none while paused except the minute tick.
* `FLAG_KEEP_SCREEN_ON` is held only while music plays; 3 minutes after pause it is released and the phone may sleep.
  The screen being on means no Doze while it is shown; that is the unavoidable cost of drawing it ourselves.
* Over the lock screen through `showOverLockScreen` (`LockScreen.kt`). If a lock screen is up and lock-screen lyrics
  are off, the lines are replaced by the song title (privacy).
* Exit: tap, Back, tile, widget, or the proximity sensor reporting near (pocket) after 2.5 s.
* Lyrics come from the main Lyra page, which pushes the synced lines to native. If Lyra's process was killed, the
  screen shows the song name only until Lyra runs again.
* Start: Quick Settings tile, widget, app shortcut, Settings button, or automatically on charge.

## 3. Screen saver (`LyraDream`)

Same native view with the Minimal style: black, dim cover-tinted lyrics, pixel shift, `isScreenBright = false` plus the
configured window brightness. The system starts and stops it by itself (charging/dock), so no permission is needed.
The tint is the cover's colour; the per-vibe visuals of the main app are not available to the native view.

## 4. Settings (Android section, `SettingsPanel.tsx` and `ambientConfig.ts`)

Open ambient on charge (On demand / On charge), brightness (existing), auto brightness (existing), clock, pixel
shift, lock-screen card while off. The page mirrors them to native through the `ambientConfig` RPC
(`AmbientConfig.kt`), because auto-start and the screen saver run without a web page.

"On charge" opens the screen when the charger connects while the screen is on, music plays and the user has not just
closed it (until the charger is unplugged). Android blocks background activity starts except with "Display over other
apps" (documented exemption, `SYSTEM_ALERT_WINDOW`). Without it, nothing happens; use the screen saver instead. The plug-in
broadcast is registered at run time, so this works while Lyra's process lives (it is kept alive by the lyrics
notification or "Keep running"). It never wakes a dark screen.

## Battery notes

* Native view: no WebView, so no renderer process, no JS timers; wake-ups are per lyric line.
* The only real cost is the screen being on. Keep brightness low; on OLED, black pixels draw no power.
* Screen off: nothing of ours keeps the CPU awake beyond what playback does.
* Glow and Video styles use a WebView and animation; they cost clearly more.

## Verified and not verified

Built and unit tested (`AodLogicTest`, 7 tests), debug build and lint (0 errors) pass, web typecheck passes.
Not verified (no device): what each OEM AOD/lock screen draws from the metadata fields, the real proximity and
light-sensor behaviour, charge auto-start with the overlay permission, dream appearance, and measured battery draw.
