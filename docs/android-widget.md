# Android home-screen widget ("Lyra live lyrics")

Long-press the home screen, Widgets, Lyra, "Lyra live lyrics". Resize it freely:

* **small** (about 2 x 1): cover, title, artist, play / pause
* **medium** (about 4 x 2): cover, title, the current lyric line, previous / play / next, progress
* **large** (4 x 3 and up): big current line, the next line, progress, big controls

On Android 12 and newer the launcher picks the layout by size (`RemoteViews` with a size map); older versions show the medium layout.

How it works: `LyraWidget.kt`. The widget is redrawn by `LyraWidgetUpdater`, which follows the media session (`MediaMonitor`) and wakes itself at the moment the next lyric line starts (never faster than every 0.4 s, otherwise every 4 s for the progress bar). The timed lines come from `LyricsNotifier` (the same ones the lyrics notification uses); the app sends them once per song, so open Lyra once for a new song and the widget follows. The background is a gradient built from the cover's most vivid colour, rebuilt per song and cached.

Status: compiled and packaged by CI; **not yet tested on a real launcher**. Things worth checking on a device: resize behaviour on your launcher, the update rate on Samsung One UI (battery optimisation can pause updates), and the "Open Lyra to load the lyrics" state after a reboot.
