# Video and background service: audit (2026-11-24)

Scope: Apple preview clip, YouTube background, user files, `src/core/background/*`, `src/main/background/*`, the Android
`/preview/` proxy, VideoPicker / VideoStatus / Settings background section.

## Already good (kept as is)
- Resolver order is clear and tested; pinned choice and failed-video memory (7 days) are honoured; alternates are offered.
- iTunes lookups are cached by song key on disk (hit 30 d, miss 7 d, stale reused when offline), so repeat plays are instant.
- Windows `ClipStore`: one progressive download, resume, Retry-After, size cap, tidy. Next-song prefetch (`usePrefetchNext`)
  resolves the next queue item, which saves its clip.
- Host allow-list (`HOST_RE`, anchored, https, `*.itunes.apple.com`) on both the Electron handler and the Android proxy;
  user files are copied under hashed names and only those names are served.

## Gaps found
| Area | Finding | Action |
| --- | --- | --- |
| Android storage | `/preview/` streamed straight from Apple: no cache, no resume, no limits; replays and loop re-downloaded 20 MB each time | DONE: `ClipCache.kt` (cacheDir, progressive serve, 4 resumes, Retry-After, 64 MB/clip, 60 files / 300 MB) |
| Android prefetch | the clip was never warmed (Windows warms in `resolve`, Android resolves in JS) | DONE: `clipUrl` asks the phone to start saving (`clipWarm`), so the next song's clip is ready |
| Android data | no respect for Data Saver | DONE: warming is skipped on a metered network with Data Saver on (playback itself still works) |
| Security | Android proxy followed redirects possibly off Apple's hosts (fallback path) | DONE in `ClipCache` (redirects off); the direct fallback stream is unchanged |
| Settings | no way to see or clear saved clips | DONE: "Saved video clips" row (count, MB, Clear), Windows and Android |
| UI | VideoPicker: no retry on error, Escape did not close, a slow search could fill the list of the NEXT song | DONE |
| Tests | no test for cache info/clear | DONE (`clipStore.test.ts`) |

## Not done (ideas, with reasons)
- Per-video offset memory: needs a field in `SongChoice` and drift UI; belongs with the lyrics/sync owner.
- Redirect hardening of the Electron `net.fetch` path: Apple's CDN may legitimately redirect, not verified, left alone.
- Android `ClipCache` is compiled (Gradle `compileDebugKotlin --offline`) but not run on a device.
