# Android home-screen widget ("Lyra live lyrics")

Long-press the home screen, Widgets, Lyra, "Lyra live lyrics". Resize it freely:

* **small** (about 2 x 1): cover, title, artist, play / pause
* **medium** (about 4 x 2): cover, title, the current lyric line, previous / play / next, progress
* **large** (4 x 3 and up): big current line, the next line, progress, big controls

On Android 12 and newer the launcher picks the layout by size (`RemoteViews` with a size map); older versions show the medium layout.

How it works: `LyraWidget.kt`. The widget is redrawn by `LyraWidgetUpdater`, which follows the media session (`MediaMonitor`) and wakes itself at the moment the next lyric line starts (never faster than every 0.4 s, otherwise every 4 s for the progress bar). The timed lines come from `LyricsNotifier` (the same ones the lyrics notification uses); the app sends them once per song, so open Lyra once for a new song and the widget follows. The background is a gradient built from the cover's most vivid colour, rebuilt per song and cached.

## Vibes (0.8.0)
The widget wears the vibe in effect. The page (`src/android-web/api.ts`) watches `data-vibe` on `<html>` and tells Kotlin through the `widgetVibe` RPC; `LyraWidgetUpdater.setVibe` stores it (SharedPreferences `lyra_widget`, so it survives a reboot) and redraws. `WidgetPalettes.of(vibe)` in `LyraWidget.kt` has one palette per vibe (gradient top/bottom, text, accent, light or dark) matching the vibe's player card / share card / Settings skin: neon, chrome, dream, crt, sticker, chat, paper, arcade, noir, sunset, blocks, stadium, cassette, trailer, sketch, glitch, comic. Light vibes (sticker, paper, cassette, sketch, comic) get dark ink and tinted controls. For the default "Artwork" vibe (and any unknown id) the cover-colour gradient and white text are used as before. Adding a vibe = add one line to `WidgetPalettes.of`.

## Queue for prefetch (0.8.0)
`MediaMonitor.queueJson()` reads `MediaController.getQueue()` and `PlaybackState.activeQueueItemId` and returns the next (up to 3) songs; `player.queue()` in `api.ts` exposes it so `hooks/usePrefetchNext.ts` can warm the next song's lyrics and video. Many players publish **no** queue to other apps (Spotify does not), then it returns null and nothing is prefetched; players that do (some YouTube Music / local players) benefit. Queue items carry no cover (`artworkUrl` null) and an id made from package + media id + title + artist, which is only used to avoid prefetching the current song.

Status: compiled and packaged by CI; **not yet tested on a real launcher**; the 0.8.0 vibe palettes and queue were written without an Android SDK available (TypeScript side type-checked and built, Kotlin only code-reviewed; CI compiles it). Things worth checking on a device: resize behaviour on your launcher, the update rate on Samsung One UI (battery optimisation can pause updates), and the "Open Lyra to load the lyrics" state after a reboot.

## More widgets and per-widget looks (refactor phase 1)
Five widgets now share one engine (`LyraWidgetUpdater` in `LyraWidget.kt`): **Lyra live lyrics** (the resizable one above), **Lyra mini player** (2 x 1), **Lyra lyrics ticker** (4 x 1), **Lyra play button** (1 x 1) and **Lyra cover art** (2 x 2). Each widget has its own look, chosen when you add it and changeable later (long-press, Reconfigure, Android 12+): *Follow the app* (default, the vibe in effect), *Artwork*, *Material You* (wallpaper colours, Android 12+) or one fixed vibe. The look screen is `WidgetConfigActivity`; the choice is stored per widget id by `WidgetThemes`.
Battery: nothing is drawn while the screen is off (a `SCREEN_ON` receiver forces one redraw), identical redraws are skipped, and backgrounds are cached per song, look and layout. The play / pause disc now always contrasts (white disc with dark icon, or ink disc with white icon on light vibes); before, dark vibes got a white icon on a white disc.
See `docs/android-refactor-plan.md` for the whole plan.

## Phase 2: three more widgets, notification, polish
* **Eight widgets** now (same engine and per-widget look picker). New: **Lyra now playing card** (4 x 2: 96 dp cover, title, artist, current and next line, progress, prev / play / next; `LyraCardWidget`), **Lyra big lyric** (2 x 2: the line in 20 sp type inside a `ViewFlipper`; a new line is written to the hidden child and `showNext()` plays `res/anim/lw_in` / `lw_out`, a rise-and-fade cross-fade; `LyraBigWidget`) and **Lyra cover** (1 x 1: cover only, small play chip; `LyraArtWidget`).
* The flipper keeps `flipCur` / `flipLine` per widget id and always sets the displayed child before `showNext()`, so a launcher that re-inflates the layout still animates from the right line. Whether a given launcher plays the animation on a partial redraw can only be checked on a device.
* **Corners**: backgrounds use the system widget radius (`android.R.dimen.system_app_widget_background_radius`, Android 12+), 22 dp below. The baked bitmaps are stretched with `fitXY`, so the corner can be slightly off in unusual sizes.
* **Picker previews** (Android 12+): every provider has `android:previewLayout` (`preview_text`, `preview_small`: static sample song, system corner radius via `drawable-v31`). Older launchers ignore it.
* **Sizes**: cell targets 4x2, 2x2, 1x1, resize minimum one cell; the 1x1 widgets do not resize. `updatePeriodMillis=0` everywhere.
* **Notification**: the lyric line is the title, the next line the text, `title - artist - n/total` the sub text (the lyrics' own progress next to the system seek bar); big cover as large icon, colourised from the cover; compact view = prev / play / next. Channel is `IMPORTANCE_LOW` with no sound, vibration or lights (an already-created channel keeps its old settings until reinstall or the user changes them); foreground-service behaviour `IMMEDIATE` on Android 12+. Lock-screen privacy: when "public" is off, the lock screen shows title, artist and cover only, never a lyric line. The 500 ms tick stops while the screen is off and resumes on `SCREEN_ON`.
* Not verified on a device or emulator: widget rendering, the flip animation, the picker previews, and the notification's look on the lock screen.
