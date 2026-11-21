# 5. Lyrics and video engine

Detailed plan: `docs/engine-plan.md`. Code: `src/core/lyrics/*`, `src/core/background/*`, `src/main/background/service.ts`, `src/renderer/src/store/lyrics.ts`, `hooks/useBackground.ts`, `hooks/usePrefetchNext.ts`, `hooks/useStartGate.ts`, `src/core/startGate.ts`.

## Lyrics
* **LyricsService** (`core/lyrics/service.ts`): asks providers in order (LRCLIB first, others), with per-provider **retry with backoff**, a **circuit breaker** (`core/resilience.ts`: `backoffDelay`, `retry`, `CircuitBreaker`, `isTemporary`), **stale-if-error** (shows older cached lyrics while services are down), a **health** report (Settings > Lyrics shows each service). Results are cached; TTLs: found 30 days, none 12 h, **plain 24 h** (a synced version is looked for again).
* **Synced always wins**: a plain result from one service is kept only as a fallback while the next services are asked; LRCLIB search ranks synced first. Tests in `service.test.ts` use fake providers and a fake clock.
* **Matching** (`core/lyrics/match.ts`, `lrclib.ts`): title cleaning, artist variants, duration tolerance, `isAcceptable`/`scoreCandidate`. `core/songKey.ts` gives a **song identity** (`artist|title` normalised) so choices survive a different player/re-release; `core/trackIndex.ts` maps player ids to identities.
* **User choices**: pick another match (`candidates/choose`), import text or `.lrc` (`importText/importFile`), pins by song identity, per-line save of "moments".
* **Word timing** (`shared/wordTiming.ts`): free sources give one time per line; word timing is estimated from syllables and pauses; real word timing (enhanced LRC) is used when present. The "Highlight each word" setting really strips word timing when off.
* **Romanisation** (`core/lyrics/romanize.ts`) for Hindi/Punjabi under the line.
* **Renderer** (`store/lyrics.ts`): backoff retry with a visible countdown ("Trying again in 6 s"), `LyricsFallback` screens: offline / resting (rate limit) / error / none.

## Background video (resolver `core/background/resolver.ts`)
Order in Auto: user's file for this song -> user's global file -> free **Apple 30 s preview clip** (iTunes search, `core/background/itunes.ts`) -> **YouTube** (needs an API key, `youtube.ts`, ranking in `rank.ts` rejects lyric videos, covers, reactions...) -> animated cover art ("living"). With a key and a 640p Apple clip, 1080p YouTube is preferred. Setting `backgroundStyle`: auto / living / custom / youtube / still. Alternates (next 2 best videos of the right length) are tried when the first is blocked from embedding.
* **Failure memory** (`lib/failMemory.ts`): per song identity, 14 days, in localStorage; failed videos are tried last. Pinned (user) videos are never given up on.
* **YouTube quirks**: embedding blocked (errors 101/150/152/153), start timeout 25 s -> fall back to the Apple clip; the iframe flashes its own controls so it is masked for the first seconds and after resume; pausing: Windows pauses/plays through the postMessage API; phone hides the picture while paused and for 2.6 s after resuming.
* **Apple clip cache** (`main/background/service.ts`): when a song is resolved the clip is downloaded to `userData/clipcache` (hash named, <=8 MB each, ~60 kept, LRU); the `lyra-media://preview/<base64url>` protocol serves from disk (range requests), waiting up to 4 s for an in-flight download, else streams. Windows only (Android's clip proxy has no cache).
* Video fades in only when frames play (`onPlaying`/`onLoadedData`), never a black box.

## Pause/resume
`run = visible && playing && !exporting` in `Backdrop.tsx` drives every media layer. `npm run test:video` measures the HTML video in the harness (~40 ms to freeze/move, limit 300 ms). YouTube iframe latency is unmeasured.

## Smooth start
* **Prefetch** (`usePrefetchNext`): 6 s into a song, once per song while playing, not on save-data connections: `lyrics.get(next)` and `background.resolve(next)` for the first queued item (Spotify queue; Android only where the player publishes a queue via `MediaController.getQueue`).
* **Start gate** (`core/startGate.ts` pure decision with 12 unit tests; `useStartGate.ts` acts): OFF by default, Settings > Video > More ("Wait a moment for lyrics"). Holds playback at most 1.5 s, only when the song just started, lyrics and video are both still loading, the first lyric line is known to be >5 s in (remembered from a previous play, so never the first time), the user has not paused/seeked; ends early when lyrics arrive; desktop only.

## Things to remember
* Never block the music for network. The default is: music keeps playing, the look shows its waiting screen.
* Everything the service learns is keyed by song identity, not by player track id.
* New provider = implement `LyricsProvider`, register in the service, add fake-provider tests.
