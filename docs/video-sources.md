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
