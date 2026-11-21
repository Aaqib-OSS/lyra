# Lyra on Android TV

Lyra is built to run on Android TV, Google TV and Fire TV from the same APK as the phone app (minSdk stays 26). The TV shows the full-screen scene experience (the same looks as the desktop full-screen player), laid out for a sofa and operated with the remote only.

Status: built, unit-tested and visually checked in the browser harness. **Not yet run on a TV or a TV emulator** (see "What is verified" at the end).

## 1. Platform requirements and how Lyra meets them

Based on the Android TV app quality guidelines (TV-1 launcher / navigation / layout / media) and the Android TV hardware features docs.

| Requirement | What Lyra does |
| --- | --- |
| Appear in the TV launcher: an activity with `android.intent.category.LEANBACK_LAUNCHER` | `.tv.TvActivity` carries it. `aapt2 dump badging` on the debug APK reports `leanback-launchable-activity: dev.lyra.android.tv.TvActivity`. |
| Banner, 320 x 180 px, contains the app name | `res/drawable-xhdpi/tv_banner.png` (320 x 180, xhdpi), set on `<application>` and on the activity. |
| Do not require hardware a TV lacks: `touchscreen`, `microphone`, `camera`, `telephony`, portrait | `uses-feature required="false"` for `touchscreen`, `microphone` (the recorder's `RECORD_AUDIO` would otherwise imply it) and `screen.portrait` (the recorder's portrait activity would otherwise imply it). `android.software.leanback` is also `required="false"` so phones keep installing. Verified in the built APK: all four show as `uses-feature-not-required`, no implied features remain. |
| D-pad navigation, every control reachable, visible focus | See section 3. Arrow keys move focus by screen geometry, OK presses, a double ring (dark, white, purple glow) shows focus on light and dark looks. Checked by `scripts/harness/tv-keys.mjs`. |
| 10-foot UI: big type, little text, no tiny controls | `styles/tv.css`: lyrics 65 px+ (the scene looks size them from the screen height, the classic list at 6 % of the height), player card zoomed 1.5x with text of at least 28 px, header tools / volume / sync nudge removed. |
| Overscan-safe margins (5 %) | UI that belongs to Lyra (hints, toasts, setup screens, messages) stays inside 5 % (`--tv-safe-x/y`). The looks' own artwork bleeds to the edge on purpose; scenes position their lyrics and card with their own margins (checked per look, see the gaps list). |
| Landscape, full screen, back goes to the launcher | Immersive window, black theme. Back closes the setup screen or a panel first, otherwise `finish()`. |
| Media keys | Play/Pause, Play, Pause, Stop, Next, Previous, Fast-forward, Rewind work with the controls hidden or shown (`TvKeys`, forwarded by the root view before the WebView sees them). |
| Google TV "play next" / watch-next channels | Not implemented, on purpose: they are for video content the user can resume, Lyra plays nothing. Revisit only if Lyra ever gets its own playback. |
| Voice (Assistant) | Not implemented. |

## 2. One APK, not a "tv" flavor

The TV is a second launcher activity in the existing `dev.lyra.android` app:

* Phones and tablets keep `MainActivity` (`LAUNCHER`); TV launchers only list activities with `LEANBACK_LAUNCHER`, so each device shows exactly one icon.
* A product flavor would change the Gradle task names (`assembleDebug` becomes per flavor), double the release workflow's artifacts, need its own `applicationId` or a second Play listing, and split update streams (the in-app updater, F-Droid recipe and the `version.properties` check all assume one APK). The TV code is a few small classes and one banner image, so a flavor buys nothing.
* Everything TV specific is in new files: package `dev.lyra.android.tv`, `src/android-web/tv*.ts`, `styles/tv.css`, and `res/*/*_tv.*`. Edits to shared files are small and listed in section 8.

## 3. The TV page and the remote

`TvActivity` loads the shared page with `?tv=1`. `src/android-web/entry.ts` then sets `data-platform="tv"`, the page boots the **desktop full-screen mode** (so every scene look works unchanged, the phone layout is not used) and `src/android-web/tv.ts` adds the remote layer. The page is laid out 1920 CSS px wide whatever the TV's density (`<meta viewport width=1920>` plus `useWideViewPort` in the activity), so CSS sizes mean the same on 720p, 1080p and 4K.

The screen has two states because a remote has no pointer:

| | Controls hidden (just lyrics) | Controls shown (after any other key; they fade after 3.5 s) |
| --- | --- | --- |
| OK | pause / resume, controls appear | presses the focused control |
| Left / Right | seek -10 s / +10 s | move focus |
| Up / Down | previous / next look (the app's own toast names it) | move focus |
| Menu / Info / Guide | open setup | open setup |
| Back | leave the app | leave the app (setup / panels close first) |
| Media keys | always: play/pause, next, previous, seek 10 s | same |

The first D-pad press with the controls up lands on play/pause rather than somewhere surprising. Key hints show for the first 10 s after launch. The rules are pure functions in `tvNav.ts` (`decide`, `pickNext`, `remoteKey`), covered by `tvNav.test.ts`.

First launch on a TV sets, once, a sofa-friendly default: a new look for every song (`vibeMode: cycle`) starting with Neon, screen kept on while playing.

## 4. Where the music comes from (be honest about it)

A TV has no phone media session to mirror and Lyra does not play music. There are exactly two realistic sources; the user picks one on the setup screen (`TvPrefs.mode`) and the page cannot tell the difference (`PlaybackSource`, injected into `Rpc`).

### 4.1 Standalone: mirror a media session on the TV (`LocalSource`)

Works like the phone: `MediaMonitor` reads the active `MediaSession` (Spotify's TV app does publish one) through the notification-listener permission. Limits:

* The user must grant **notification access** to Lyra. Many Android TV builds, and most Google TV builds, **do not ship the Settings screen** for it. The setup screen checks `ACTION_NOTIFICATION_LISTENER_SETTINGS` resolves; if not it shows the one-time adb command instead: `adb shell cmd notification allow_listener <package>/dev.lyra.android.MediaListenerService` (the exact string is built from the installed package, so the debug build gets `.debug`). Needs a computer on the same network with adb enabled on the TV. This is the honest cost of this mode.
* It only sees apps that publish a session. Netflix-style apps that block it, and apps that publish no metadata, show nothing.
* Lyrics are matched by title and artist from the session, like on the phone. Seeking and play/pause go back through the session's transport controls; an app may refuse them.

### 4.2 Paired with Lyra on a phone or computer (`PairedSource` + `ConnectTransport`)

The other device already knows what is playing (Spotify Web API on the desktop, the media session on a phone). The TV follows it:

* `docs/connect-protocol.md` did not exist in this branch when this was written, so the **transport is a stub**: `StubConnectTransport` never connects. Everything above it is real: the pairing screen (QR code + short code `K7M-2QX`, 6 chars from an alphabet without look-alikes, QR link `lyra://pair?c=<code>&n=<TV name>`, a placeholder scheme), the persisted code (`TvPrefs.code`, "New code" button), `PairedSource` (keeps the latest snapshot, answers `snapshot` / `status` / `command`, extrapolates position for the screen saver), and the page flow.
* To finish it, implement `ConnectTransport` (three methods: `connect(code, name, listener)`, `stop()`, `send(commandJson)`) against the protocol document and return it from `TvTransports.create()`. Snapshots are the existing `PlaybackSnapshot` JSON; commands are the existing `{"type":"toggle|play|pause|next|previous|seek"}` JSON, so no page change is needed.
* The pairing code only starts a handshake; it must not be the only thing protecting a connection. The real protocol has to authenticate the two ends (for example a key exchange over the LAN or relay) and show the user what was paired.
* Until then paired mode shows "Waiting for your device..." forever. Nothing is faked.

## 5. Screen saver (`TvDream`)

A `DreamService` for the TV: pure black, the current lyric line large and dim, two lines of context, title and artist, tinted by the cover, slow pixel shift against burn-in, **one redraw per lyric line, no WebView, no animation**. It is the phone's "Minimal" ambient view (`AodLyricsView` + `AodDriver`) with `textScale` set from the screen height (current line about 6 % of the height) and the `PlaybackSource` injected, so it also follows a paired device.

Honest limits:

* Black saves power on **OLED** TVs (black pixels are off). On LCD TVs the backlight stays on whatever is drawn; the saving there is only that nothing animates and no WebView runs.
* A screen saver cannot dim the TV. `screenBrightness` has no effect on TVs, so unlike the phone it does not set one.
* The lyric lines come from the last song the Lyra TV screen loaded (the page hands them to `LyricsNotifier`, as on the phone). With no lines loaded it shows title and artist.
* Choosing it: Android TV lists it under Settings > Device Preferences > Screen saver ("Lyra lyrics"). Google TV / Chromecast with Google TV hide third-party savers; the usual workaround is `adb shell settings put secure screensaver_components dev.lyra.android/dev.lyra.android.tv.TvDream` (and `screensaver_enabled 1`). This is the commonly documented workaround, not something this branch tested.

## 6. CSS (`src/renderer/src/styles/tv.css`)

Everything is scoped by `:root[data-platform='tv']`; the file is imported in `main.tsx` after `android-scenes.css`, so it wins ties with the looks. No other platform changes. It: sets `font-size: 28px`, hides the cursor and hover-only tools, zooms the scene card by `--tv-zoom` (1.5) and writes card text as `size on screen / zoom`, fades the card with the controls (overriding `scene.css`, which keeps it up on the desktop), sizes the classic lyric list, draws the focus ring, and styles the HUD and the setup screens. Setup screens size everything with `--u` (1 design pixel of a 1080p screen = `100vh / 1080`) so they scale with the screen height. It never recolours a look.

## 7. Verify it yourself

```
npx vite -c scripts/harness/vite.config.ts --port 5611          # the browser harness
node scripts/harness/tv-shots.mjs --port=5611 --vibes=neon,sunset,none --sizes=hd,tv720 --out=tmp/tv [--ui=1] [--setup=pair|access|nolist]
node scripts/harness/tv-keys.mjs --port=5611                     # remote behaviour, 14 checks
npx vitest run src/android-web                                   # key rules + D-pad focus (10 tests)
cd android && ./gradlew assembleDebug testDebugUnitTest lintDebug   # needs ANDROID_HOME; the web UI first: npm run build:android-ui
```

The harness switch is `?tv=1` (`scripts/harness/entry.ts`), with `?tvs=pair|access|nolist` to choose the setup screen. `tv-shots.mjs` also reports text under 24 px on screen (CSS zoom included) and text outside the 5 % margins.

## 8. Edits to shared files

* `AndroidManifest.xml`: four `uses-feature`, `android:banner`, the `TvActivity` and `TvDream` entries.
* `Rpc.kt`: optional `source: PlaybackSource` constructor parameter (default `LocalSource`, so phones are unchanged), the calls that used `MediaMonitor` now go through it, one `when` branch for `TvRpc.METHODS`.
* `AodLyricsView.kt`: `textScale` property; `AodDriver` takes an optional `source` (default `LocalSource`).
* `src/android-web/entry.ts`: `tv` flag (platform `tv`, viewport meta, start `tv.ts`). `api.ts`: the TV's mode is `full`. `main.tsx`: imports `tv.css`. `scripts/harness/entry.ts`: `?tv=1`.

## 9. What is verified, and what is not

Verified (this machine, Windows, Android SDK 36 toolchain):

* `assembleDebug`, `testDebugUnitTest` (8 new tests: pairing code, QR link, key mapping, stub transport) and `lintDebug` pass; the other lint errors that existed before are gone on this branch and none are in the TV code.
* The built APK declares the leanback launcher activity, the banner, and no required touchscreen / microphone / portrait / leanback features.
* `npx vitest run src/android-web` (10 tests) and `tsc --noEmit -p tsconfig.web.json` pass; `npm run build:android-ui` builds (QR code library is loaded only on the pairing screen).
* In the browser harness at 1920x1080 and 1280x720: the looks Neon, Chrome, Sunset, Cinema, Stadium and Artwork render with the controls shown and hidden, the card fades, the three setup screens render (QR, code, adb text), and `tv-keys.mjs` passes 14 checks: seek, look change, pause, focus movement with a visible ring, Menu / Back, no cursor. `tv-shots.mjs` reports every look's card text at or above 24 px on screen except the gaps below.

NOT verified (needs a TV, a TV emulator or a Fire TV; there was none, and the SDK here only has a phone image):

* That the app appears in a real launcher with the banner, and the D-pad / OK / media-key / Back flow inside the real `WebView` (the harness uses a keyboard; real TV remotes send DPAD_CENTER, which Chromium delivers as Enter, as assumed here).
* That `useWideViewPort` plus `width=1920` gives a 1920 px layout on every TV density (the design depends on it; if a TV ignores it, the 1280x720 harness runs show the CSS still holds up).
* Performance of the WebView scene looks on weak TV hardware (the renderer drops to its light mode below 4 cores / 4 GB, as everywhere).
* Notification access on real TVs, the adb command text, Spotify TV app's session, the screen saver selection and OLED behaviour.
* Fire TV specifics (it ignores some `settings` commands and has its own screen saver rules).
* Pairing: only the TV half exists, against a stub.

Known gaps in the looks (cosmetic, all found by `tv-shots.mjs`): some looks keep decorative small print under 28 px on a 1080p screen: Cinema and Stadium artist lines (about 19 to 21 px, their own rules override the TV size), Arcade HUD, Film Reel / Film Strip edge text, Lock Screen and Route clocks, Editor tab names, Chat header meta. The lyrics themselves are always large (60 to 90 px in the scene looks). The remaining looks (about half of the 30) were measured by the script but not looked at one by one.
