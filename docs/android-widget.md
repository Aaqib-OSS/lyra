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
