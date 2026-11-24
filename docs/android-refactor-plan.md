# Android refactor plan

Goal: the best-looking, smoothest Android experience Lyra can have: phone and tablet UI, a calm Settings page, many dynamic home-screen widgets, and a great notification. This document records the audit (what exists today), the architecture decision (what stays shared web UI, what goes native), and a phased task list. Phase 1 is built and described at the end.

## 1. Audit: how Android works today

### It is a native shell around a WebView, not Capacitor

* `android/` is a plain Gradle project (Kotlin, `minSdk 26`, `targetSdk/compileSdk 36`, AGP 8.13.2, Gradle 8.14.6, JDK 17). Dependencies are only `androidx.core`, `androidx.webkit` and `androidx.activity`. No Compose, no AppCompat, no Capacitor.
* The UI is the same React app as the desktop one (`src/renderer`), built by `npm run build:android-ui` (`vite.android.config.ts`, entry `src/renderer/android.html`) into android/app/src/main/assets/ui/ (generated, not committed), and loaded by `WebSetup.load` from `https://appassets.androidplatform.net/assets/ui/android.html` through `WebViewAssetLoader`. Only that origin may load as a page (`Rpc.isLyraPage`).
* `src/android-web/` is the web side of the bridge: `entry.ts` (sets `data-platform="android"` on `<html>`), `platform.ts`/`api.ts` (implements the same `window.api` surface the Electron preload gives the renderer), `rpc.ts` (the call channel), `lyricNotifier.ts` (pushes synced lines to native), `ambient.tsx`, `record.tsx`.
* `Rpc.kt` is the native side: one `when (method)` table (about 40 methods: `snapshot`, `status`, `queue`, `command`, `setLyrics`, `widgetVibe`, `lyricsNotification`, `overlaySet`, `toggleAmbient`, `keepRunning`, `secretLoad/Save`, `pickMedia`, `recordVideo`, ...). It serves both the app screen and the floating overlay, which is why it works without an Activity.

### Lyra is a companion, not a player

Lyra does not play music. `MediaMonitor` reads whatever the user is playing (Spotify, YouTube Music, local players) through `MediaSessionManager` with the notification-access permission held by `MediaListenerService` (it never reads notification text). `MediaMonitor.now()` returns title, artist, position (extrapolated from the session clock), playing flag, cover bitmap, duration, and an ad flag; `MediaMonitor.command(...)` sends transport commands back to that player. Everything native (notification, widgets, overlay, ambient) is therefore a *mirror* of another app's session plus Lyra's synced lyric lines. This is the key constraint of the whole plan: nothing here may assume Lyra owns playback.

### Native features that already exist

| Area | Code | State |
| --- | --- | --- |
| Lyrics notification | `LyricsNotifier.kt` (object + `LyricsNotificationService` + `LyricsActionReceiver`) | Foreground service (`specialUse`), own `MediaSession` mirroring the player (so Android draws the media card, also on the lock screen), `MediaStyle`, colourised from the cover, current lyric line as the text, prev / play / next actions, public / private lock-screen switch. Lyric lines arrive once per song (`setLyrics` RPC) and native keeps time itself, so it survives the app screen closing. |
| Home widget | `LyraWidget.kt`, `res/layout/lyra_widget_{compact,medium,large}.xml` | One resizable widget, three layouts picked by size on Android 12+ (`RemoteViews(Map<SizeF,...>)`), gradient built from the cover, 17 vibe palettes (`WidgetPalettes`) driven by the `widgetVibe` RPC, controls, progress. Redraws at the next lyric line. |
| Ambient mode | `AmbientActivity`, `AmbientController`, `LyraDream`, Quick Settings tile, `AmbientWidget`, app shortcut | Always-on-display style lyrics screen, screen saver, tile. |
| Overlay | `OverlayService` | Floating lyrics over other apps. |
| Keep alive | `KeepAliveService` | Optional foreground service. |
| Video export | `RecordActivity/Service`, `ScreenRecorder`, `PcmProcessor` | MediaProjection lyric-video recorder. |
| Secrets | `SecretStore` | Keystore-backed storage for the user's own keys. |

### Renderer: how `data-platform="android"` is used

The shared renderer branches on `document.documentElement.dataset.platform === 'android'` in `App.tsx`, `Backdrop.tsx`, `LyricsView.tsx`, `MiniPlayer.tsx`, `SettingsPanel.tsx`, `ShareCard.tsx`, `SidePanel.tsx`, `StateScreens.tsx`, `useStartGate.ts`, `main.tsx`. Phone layout is the default under that flag; tablet / unfolded foldable is a two-pane layout (cover, title, controls | big lyrics; see `docs/ui-layout-plan.md`). The vibe/scene CSS (`scene.css` and per-look CSS, including the `data-platform='android'` rules) is owned separately and is out of scope for this plan.

### Gaps found (what the owner's goal needs that is missing)

1. Only **one** widget kind. No 1x1, 2x1, 2x2, 4x1 shapes; no per-widget look; no Material You option; no configuration screen.
2. The widget redraws even when the screen is off while a song plays, and redraws identical content.
3. Widget play / pause button was drawn with the *text colour* as icon tint on a *white* disc, so on dark vibes (white text) the icon was white on white. Fixed in phase 1.
4. Notification uses framework placeholder icons (`android.R.drawable.ic_media_*`); status-bar icon is the generic play triangle. Improved in phase 1.
5. No tablet-specific native work: no fold-posture awareness, no widget sizes for tablets, `MainActivity` handles config changes itself but nothing reacts to window size classes natively.
6. No haptics layer, no predictive-back handling, no edge-to-edge insets plumbing into the WebView (the page decides alone).
7. Nothing measures startup, jank or battery; no baseline profile.
8. Kotlin/Gradle could not be built in earlier sessions on the dev machine (`docs/android-widget.md`: "written without an Android SDK"). The SDK is present on this machine, so the build is now verifiable (see section 7).
9. `lintDebug` is red on the existing code: 16 `NewApi` errors that predate this plan (`setShowWhenLocked`/`setTurnScreenOn` need API 27 in `MainActivity`/`AmbientActivity`; the recorder pieces in `Rpc.kt`, `RecordActivity`, `RecordService` need API 29, while `minSdk` is 26). None are in the files touched by phase 1. Fix: `@RequiresApi`/version guards, or raise `minSdk` to 29 (about 97 % of devices), then make lint part of CI.

## 2. Architecture decision: shared web UI vs native

Rule of thumb: **the app screen stays the shared web UI; everything the user sees *outside* the app screen is native.** Reasons: the vibes, lyrics stage, settings and share cards are the product and are written once for desktop and phone; the system surfaces (notification, widgets, lock screen, QS tile, shortcuts) cannot be web at all, and they need to work when the WebView process is not alive.

| Surface | Owner | Why |
| --- | --- | --- |
| Lyrics stage, vibes, player card, lyric motion, share cards, state screens | **Web** (shared) | One implementation, 17+ vibes. Owned by the vibe redesign. |
| Settings page | **Web** (shared `SettingsPanel`), with an Android section that calls native RPCs | Same skin per vibe as desktop. New native toggles are added as RPCs (`widgetsState`, `haptics`, ...), not as a second native settings screen. |
| Notification, lock-screen card | **Native** (`LyricsNotificationService`) | Must run with the app closed. |
| Home-screen widgets (5 kinds) | **Native** (`AppWidgetProvider` + `RemoteViews`) | Launcher-hosted. |
| Widget look picker | **Native** (`WidgetConfigActivity`) | Launcher launches it with only the widget id, before any web page exists. Tiny, built in code. |
| Quick Settings tile, shortcuts, dream, ambient | **Native** (existing) | System-hosted. |
| Haptics | **Native** behind one RPC; the web layer *decides when* | The WebView `navigator.vibrate` is limited; `VibrationEffect` / `HapticFeedbackConstants` give crisp ticks. |
| Window insets, back gesture, fold posture, window size class | **Native** reports, **web** lays out | Native pushes `--inset-*`, `--fold-*` and a `data-size-class` through one `layout` RPC; web CSS reads variables. Keeps layout logic in one place (CSS) and lets the tablet/foldable layout react to hinge position. |

Not planned: rewriting the app screen in Compose, adopting Capacitor, or Glance. Reasons: Compose would fork every vibe; Capacitor adds a plugin runtime to a shell that already has a tiny audited RPC table; Glance adds a Compose dependency to widgets that `RemoteViews` already does well (and `RemoteViews` has the lowest runtime cost). Revisit Glance only if widget interactivity (toggles, lists) outgrows `RemoteViews`.

### Data flow (single source of truth)

```
 other player's MediaSession ──► MediaMonitor (Now: title/artist/pos/cover/playing)
                                      │                       ▲ command(play|pause|next|prev|seek)
 web UI: lyrics for the song ──setLyrics──► LyricsNotifier (timed lines, offset, status)
 web UI: vibe in effect     ──widgetVibe──► LyraWidgetUpdater.vibe
                                      │
        ┌─────────────────────────────┼───────────────────────────┐
        ▼                             ▼                           ▼
 LyricsNotificationService     LyraWidgetUpdater           OverlayService / Ambient
 (MediaSession + MediaStyle)   (5 widget kinds, per-widget  (existing)
                                look, one tick timer)
```

New native surfaces must read from `MediaMonitor` and `LyricsNotifier` only; they must not open their own sessions or timers.

## 3. Native surfaces

### 3.1 Notification

Already good: `MediaStyle` with a live `MediaSession` (so the lock screen and Android 13+ media output switcher work), colourised, lyric line as the text, three actions.

Target:
* Own status-bar icon (done in phase 1) and own action icons (done in phase 1).
* Big cover: `setLargeIcon` already; on Android 13+ the system draws the `MediaStyle` card from the session metadata, which already carries the cover.
* Current lyric line prominent: the session's *artist* field carries the live line (this is what Android draws second); title carries the line when there is one. Keep this contract; document it so nobody "fixes" it.
* Lock screen: public / private switch exists; add a "show lyrics only when unlocked" privacy mode (the private version shows only title and artist).
* Later: optional 4th action "Lyrics" (opens the lyrics stage), a sleep-timer chip, and per-vibe accent via `setColor` when the vibe is dark (the cover tint stays the default).
* Battery: the service ticks every 500 ms but only touches the system when the signature changes (already true). Add: stop the tick while paused and the screen is off, resume on the session callback.

### 3.2 Widgets

Five widgets share one engine (`LyraWidgetUpdater`). Sizes use the launcher's cell grid (`targetCellWidth/Height`, Android 12+) with `minWidth/minHeight` fallbacks.

| Widget | Size | Content | Class / layout |
| --- | --- | --- | --- |
| Mini player | 2x1 | cover, current line (2 lines), play / pause | `LyraMiniWidget`, `lyra_widget_mini` |
| Now playing (existing) | 4x2, resizable 2x1 to 4x3+ | cover, title, artist, current line, prev / play / next, progress; big layout adds the next line | `LyraWidget`, `lyra_widget_{compact,medium,large}` |
| Lyrics ticker | 4x1 | cover, `title - artist`, one big live line, progress | `LyraTickerWidget`, `lyra_widget_ticker` |
| Play button | 1x1 | dimmed cover with one large play / pause disc | `LyraPlayWidget`, `lyra_widget_play` |
| Cover art | 2x2 | cover fills the card, scrim, title and current line on it, play disc | `LyraCoverWidget`, `lyra_widget_cover` |

Themes (per widget, chosen in `WidgetConfigActivity`, stored per widget id, reconfigurable from the launcher on Android 12+):
* **Follow the app** (default): wears the vibe in effect (the existing `widgetVibe` flow).
* **Artwork**: gradient from the cover's most vivid colour.
* **Material You**: system accent / neutral tones from the wallpaper (Android 12+, via `android.R.color.system_*`; hidden on older versions).
* **Any one of 17 vibes**: fixed palette (`WidgetPalettes`), including light vibes with dark ink (sticker, paper, cassette, sketch, comic).

Update strategy (cost model: a widget update is an IPC to the launcher; the expensive part is bitmaps):
1. `updatePeriodMillis = 0`. No periodic wake-ups at all; updates are event-driven.
2. One main-thread timer, armed only while a song is playing, waking at the moment the *next lyric line starts* (clamped 0.4 s to 4 s; 4 s when there are no lines, for the progress bar only).
3. Nothing is drawn while the screen is off (`PowerManager.isInteractive`); `SCREEN_OFF` cancels the timer, `SCREEN_ON` forces one redraw. This is the single biggest battery saving.
4. Per widget id, a signature of what is visible (song, line, next line, play state, progress in 1.2 % steps, look, vibe); identical redraws are skipped.
5. Bitmaps (card background, rounded cover, accent colour) are built once per (song, look, layout) and cached; the cache is dropped when the song changes. Sizes are capped (<= 900x500 px) to stay far below the `RemoteViews` bitmap budget.
6. No widget redraw while no Lyra widget is placed (`detach`).
7. Not done yet: `Palette`-quality colour extraction off the main thread, and a `WorkManager` safety net after reboot (today the first redraw after boot happens at the first `APPWIDGET_UPDATE` or the first player event).

Honest limits: widgets cannot animate smoothly (a lyric line change is a cut, not a cross-fade; `RemoteViews` supports `ViewFlipper`/`setViewVisibility` only), cannot use custom fonts, and cannot blur. Vibe-accurate typography on a widget is approximated with colours and the system font.

### 3.3 Other surfaces (later phases)

* Lock-screen controls on non-media apps are Android's own; nothing to build beyond 3.1.
* Quick Settings tile for the lyrics notification (on / off), next to the ambient tile.
* Android 16 live-updates style (`Notification.ProgressStyle`) for the export progress; check API level at runtime.

## 4. Layouts: phone, tablet, foldable

Layout stays in the web UI (CSS), native only reports facts.

* **Window size classes** (`compact < 600dp`, `medium 600-840dp`, `expanded > 840dp`, per the Material guidance) are computed natively from the *window* (not the screen: split-screen and freeform windows matter) and pushed as `data-size-class` plus `--win-w/--win-h` on `<html>`. The renderer should switch layouts on these, not on `userAgent` or orientation.
* **Phone (compact)**: single column, lyrics stage first, player card as a bottom sheet, Settings as full screen. Already built.
* **Tablet / unfolded foldable (medium, expanded)**: two panes (cover, title, controls | big lyrics). Already built; add a three-pane variant at `expanded` landscape (queue / lyrics / cover) and a larger widget set (4x2 and up).
* **Foldables**: `WindowInfoTracker` (Jetpack WindowManager) reports `FoldingFeature` (hinge bounds, `HALF_OPENED`, `TABLETOP` / `BOOK` posture). Push `--fold-x/--fold-w` and `data-posture`; web CSS places the lyrics on the top half and the controls on the bottom half in tabletop posture, and splits panes on the hinge in book posture. Needs `androidx.window:window`, a small dependency (about 1 MB, no runtime services).
* **Multi-window / freeform / desktop mode (ChromeOS, Samsung DeX)**: already `resizeableActivity` by default; verify the activity's `configChanges` list (it handles `smallestScreenSize|screenLayout`, good) and keyboard shortcuts (Space = play/pause, arrows = next/prev) via the `command` RPC.
* **Insets / edge to edge** (mandatory at `targetSdk 36`): push `--inset-top/-bottom/-left/-right` from `WindowInsets` (system bars and display cutout, plus IME) so the web layout never guesses `env(safe-area-inset-*)` support of the installed WebView.

## 5. Gestures, haptics, motion

* **Predictive back**: `android:enableOnBackInvokedCallback="true"` and route back to the web UI first (close sheet, close Settings, leave lyrics full screen) before `finish()`. Today `MainActivity` decides in `onBackPressed`; move to `OnBackInvokedCallback` and expose the in-progress gesture progress to the page for a matching sheet-dismiss animation.
* **Gestures** (web, Pointer Events): swipe down on the lyrics stage minimises to the player card, horizontal swipe on the cover = previous / next, long-press on a lyric line = share that line, double-tap = play / pause. Edge swipes belong to the system (gesture navigation); keep a 24 dp dead zone on both edges.
* **Haptics** (one RPC `haptic(kind)`, kinds `tick | confirm | reject | heavy`): `VibrationEffect.createPredefined(EFFECT_TICK/CLICK/HEAVY_CLICK)` on API 29+, `HapticFeedbackConstants.CONFIRM/REJECT` on API 30+, otherwise a 10 ms one-shot. Use on: track change, play / pause, switching vibe, pull-to-refresh threshold, slider detents (lyric offset). A Settings switch "Haptics" (default on) respects the system "touch feedback" setting.
* **Motion**: respect `prefers-reduced-motion` mapped from the system "Remove animations" setting; the vibe motion owner decides the visuals, this plan only guarantees the flag reaches the page.

## 6. Performance targets

| Metric | Target | How measured |
| --- | --- | --- |
| Cold start to first lyric line on screen | <= 1.2 s on a mid-range device (Snapdragon 6-series, 6 GB) | `adb shell am start -W`, plus a `performance.mark` logged by `entry.ts` |
| Warm start | <= 400 ms | same |
| Lyric stage frame rate | 60 fps sustained, janky frames <= 2 % (90 / 120 Hz displays: no regression) | `dumpsys gfxinfo`, Macrobenchmark `FrameTimingMetric` |
| WebView memory | <= 250 MB resident while the lyrics stage runs | `dumpsys meminfo` |
| Widgets, screen on, song playing | <= 1 widget update per lyric line, no update while the screen is off | counted in debug log |
| Battery, notification + 1 widget, 1 h of music, screen off | <= 1 % attributable to Lyra | `batterystats` / Android Studio Energy profiler |
| APK size | <= 12 MB (today dominated by the web UI assets) | CI size check |

Work items behind the targets: a Baseline Profile (startup + the lyrics scroll path), `WebView` pre-warm in `Application.onCreate` behind a short delay, R8 shrink for release (`isMinifyEnabled` is false today; verify the RPC reflection-free paths first), and an on-device Macrobenchmark module (needs a device or emulator; not set up).

## 7. Verification on this machine

The Android SDK exists at `C:\Users\TEST\AppData\Local\Android\Sdk` (platforms `android-36`, `android-36.1`; build-tools 35 to 37; system images and emulator installed). android/local.properties (not committed) is git-ignored and is not present in a fresh worktree: set `ANDROID_HOME` when building, e.g. `ANDROID_HOME=C:/Users/TEST/AppData/Local/Android/Sdk ./gradlew.bat assembleDebug lintDebug testDebugUnitTest` from `android/`. `assembleDebug` and `testDebugUnitTest` pass; `lintDebug` fails only on the 16 pre-existing errors listed in gap 9 (a full lint run takes about 5 minutes). Nothing was run on a device or emulator. The first build needs network (Gradle plugins and the Android Gradle Plugin are not cached for `--offline`).

## 8. Phased task list (prioritised)

Priority = user-visible value divided by risk. `[x]` done in this change, `[ ]` open.

### Phase 1: widgets and notification polish (native only, no web changes) 

- [x] Widget engine generalised to several providers with one timer, one media listener.
- [x] New widgets: 2x1 mini player, 4x1 lyrics ticker, 1x1 play button, 2x2 cover art.
- [x] Per-widget look + `WidgetConfigActivity` (Follow the app, Artwork, Material You, 17 vibes); reconfigurable on Android 12+.
- [x] Battery: no drawing while the screen is off; skip identical redraws; per-(song, look, layout) bitmap cache.
- [x] Fix: play / pause icon invisible on dark vibes (white icon on a white disc).
- [x] Notification: own status-bar icon and action icons.
- [ ] On-device check on 2 launchers (Pixel Launcher, One UI): resize behaviour, reconfigure, reboot state.

### Phase 2: native/web layout bridge

- [ ] `layout` RPC: window size class, insets, display cutout, IME, fold posture (`androidx.window`) pushed to `<html>`.
- [ ] Predictive back (`OnBackInvokedCallback`) with the web UI handling back first.
- [ ] `haptic(kind)` RPC and a Settings switch.
- [ ] Reduced-motion flag from the system setting.

### Phase 3: Settings page for Android

- [ ] Android section in `SettingsPanel`: notification (on, lock-screen privacy), widgets (how to add, look defaults, link to the system widget picker), ambient, overlay, keep-running with the battery-optimisation shortcut, haptics, permissions health (notification access, post-notifications, overlay) with one-tap fix.
- [ ] A `widgetsState` RPC (placed count per kind) so Settings can say "2 widgets on your home screen".
- [ ] Settings keeps the vibe skin (shared component, no second UI).

### Phase 4: tablet and foldable

- [ ] Three-pane expanded layout; tabletop / book postures; tablet-sized widget variants (3x2 now playing with queue peek).
- [ ] Keyboard shortcuts and hover states for ChromeOS / DeX.

### Phase 5: richer notification and surfaces

- [x] Privacy mode for the lock screen (title, artist and cover only while locked); notification tick stops with the screen off; lyric position n/total in the sub text.
- [ ] Lyrics on/off Quick Settings tile; sleep timer chip.
- [x] Widgets added: 4x2 now playing card, 2x2 big lyric with a `ViewFlipper` cross-fade, 1x1 cover; `previewLayout`, system corner radius (see `android-widget.md`). Unverified on a device.
- [ ] Widget: cross-fade for the ticker too; "lyric offset +/-" buttons on the large widget.

### Phase 6: performance and release hardening

- [ ] Baseline Profile and Macrobenchmark module; WebView pre-warm; R8 for release.
- [x] Fix the 16 pre-existing lint errors (see gap 9): `showOverLockScreen()` helper with an API 26 window-flag fallback, `tools:targetApi="29"` on the recorder activity and service, version guards around the `RecordActivity` / `RecordService` use in `Rpc.kt`, suppression of the `startActivityAndCollapse(Intent)` branch that only runs below API 34. `minSdk` stays 26. `lintDebug` is green.
- [ ] CI: `assembleDebug`, `lintDebug`, `testDebugUnitTest`, APK size budget.
- [ ] Instrumented UI smoke test on an emulator image (system images are installed here).
