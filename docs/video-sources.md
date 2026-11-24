# Video sources: what each can and cannot do

One song clock (`src/core/clock.ts`, read through `getPosition()`) says where the song is. Lyrics, progress bar and
video all ask it; none keeps its own time. Late-loaded media simply joins at the clock's current position.

| Source | Seek | Speed nudge | Reports its time | Captions / annotations | Synced to song? |
| --- | --- | --- | --- | --- | --- |
| YouTube embed (`youtube-nocookie`, IFrame postMessage API) | `seekTo` (keyframe-accurate, ~0.2-1 s) | `setPlaybackRate`, 0.25 steps only (0.75 / 1.25); verified from `infoDelivery.playbackRate`, falls back to seeking if ignored | `infoDelivery.currentTime` about 2x/s, only while a `listening` handshake is active | `cc_load_policy=0`, `iv_load_policy=3`, `unloadModule captions` on ready. Cannot be styled: the iframe is cross-origin, so CSS cannot reach it | Only if its length is within 10 s of the song (the embed reports its duration); otherwise it loops freely |
| Local / URL video file (`<video>`, kind `media`) | exact (`currentTime`) | any rate (we use +-0.05) | `currentTime` | none | Same 10 s length rule; then no loop crossfade, locked to the clock |
| Apple preview clip (`kind: preview`) | exact | any | yes | none | Never: it is a ~30 s excerpt, it loops |
| Image / GIF / still | n/a | n/a | n/a | n/a | n/a |
| Studio export stage (hidden `BrowserWindow`, `studio.ts`) | uses `start=` only | no | page JS | same params, plus injected CSS (same top-level page, so CSS works there) | Start position only |
| Karaoke player (`lib/karaoke/player.ts`) | `seekTo` | no | `infoDelivery` | `cc_load_policy=0`, captions module unloaded | Karaoke owns its own clock |

Drift rules (`DriftController`): dead zone 0.3 s (YouTube) / 0.15 s (file); first sample after join/resume seeks if off by
more than 0.5 s; small drift is fixed by a speed nudge; seek only above 2 s (1 s if rate is ignored), then a 3 s cooldown;
nothing is done while buffering or paused. Ad breaks pause the video (`isAdOrUnknown`) and the clock freezes.

Known limits: a music video with a long intro has a constant offset from the audio (no per-video offset yet); YouTube
may still honour a user's account-level "always show captions" in a few cases despite the parameters.

## How the Apple preview clip reaches the player (Windows)

Apple's clips are HD (1920 px wide, about 20 MB for 30 s), MP4 with the index at the front ("fast start"), and the CDN
answers HTTP Range requests (measured: first bytes after about 0.4 s, the whole file in 16 to 26 s on a 10 Mbit/s line;
other renditions are not available, and splitting the download over several connections did not help).

Until this change the clip was saved completely and only then handed to the player, so on a normal connection nothing played for
the first 18 to 26 seconds, a dropped connection lost everything, and a request that waited longer than 25 s fell back to a
second, parallel stream. `src/main/background/clipStore.ts` replaces that:

- ONE download per clip into a growing `.part` file. The `lyra-media://preview/...` handler answers the player's Range
  requests from that file while it is still growing (bytes that are there now are sent now, the rest as they arrive), so
  playback starts after the first few hundred KB. The loop crossfade's two video elements share the same download.
- A dropped or stalled connection (no bytes for 12 s) resumes with `Range: bytes=<received>-` up to 4 times with backoff;
  a server that ignores Range makes it start over; 429/503 honour `Retry-After`; 404/403/too big are not retried.
- When complete the file is renamed into place and later plays and loops come straight from disk. The clip folder is
  capped (80 files, 500 MB) and unfinished `.part` files of an earlier run are removed at start.
- If saving is refused the handler still streams straight from Apple, and if that fails it answers 502.
- The renderer (`Backdrop.tsx`, `LoopVideo`) asks for a clip again (3 times, growing wait, `?r=n` on the URL) when the video
  errors, and also when no frame has appeared after 30 s, before it gives up on the picture for that song.

Tests: `clipStore.test.ts` runs the store against a local fake CDN (slow trickle, dropped connections, 429, ignored Range,
404, size limit, concurrent players). Not covered by tests: the Electron protocol handler itself and Android.

Android: `ClipCache.kt` does the same job for the `/preview/` proxy in `WebSetup.kt` (growing `.part` file served while it
downloads, resume with Range, Retry-After, 64 MB per clip, 60 files / 300 MB in `cacheDir`, redirects off, Apple hosts only).
`clipUrl` in `android-web/api.ts` starts saving a clip as soon as it is chosen; warming is skipped under Data Saver on a
metered network. It compiles (`gradlew :app:compileDebugKotlin --offline`) but has not run on a device. Settings has a
"Saved video clips" row (size, Clear) on both platforms (`clipCacheInfo` / `clipCacheClear`).
