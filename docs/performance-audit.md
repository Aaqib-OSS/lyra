# Performance and memory audit (roadmap item 14)

Method: measure first (`scripts/perf/*`), change the biggest real problems, measure again. All numbers come from headless
Chromium on a busy dev PC (software rendering, no GPU, other processes running), so use them to compare before and after on the
same machine, not as absolute figures for a real PC or phone. Real Electron, a GPU and a low-end Android phone were not available.

## Tools

| script | what it answers |
|---|---|
| `node scripts/perf/measure.mjs [--vibe=a,b] [--secs=6] [--name=x]` | per scenario (paused, mini, fullscreen per look, Light mode): main-thread busy ms/s, script / layout / style ms/s, long tasks, frame cadence, heap, DOM nodes, running animations, `setProperty` / rAF / timer rates. Writes `perf-out/<name>.json`. Needs the harness on port 5217. |
| `node scripts/perf/who.mjs "<query>" [secs]` | which source line writes CSS variables, asks for frames or starts timers |
| `node scripts/perf/probe.mjs "<query>"` | every running animation (name, properties, element) |
| `node scripts/perf/soak.mjs "<query>" [secs]` | heap (after GC), DOM nodes and listeners over time: flat means no leak |
| `node scripts/perf/bundle.mjs` | production build with source maps; per chunk, bytes by package |
| `node scripts/perf/startup.mjs <out/renderer> [runs]` | load of a built renderer folder (stub `window.lyra`) |
| `node scripts/perf/lazy-check.mjs` | opens Studio, Karaoke and Settings in the harness: proves the lazy chunks load |

## Findings and results

### 1. Renderer shipped unminified (largest, certain win)
electron-vite defaults `build.minify` to `false` for the renderer. The shipped startup script was 2,014 kB.
Now: JS minified (`minify: 'oxc'` in `electron.vite.config.ts`). CSS is deliberately NOT minified (`cssMinify: false`) because the
looks are hand-tuned and a CSS minifier may rewrite values; the owner can opt in (973 kB -> about 695 kB, see decisions).

### 2. Everything in one chunk
Studio (recorder, mp4-muxer), Karaoke, Settings (with peerjs, webrtc-adapter, qrcode) and the share-card dialog were all in the
startup script although each opens only on a click. They load on first open through `components/lazy.tsx` (Suspense fallback is
nothing, the chunk is a local file; Studio, Karaoke and Settings were checked open in the harness).

| | before | after |
|---|---|---|
| startup JS (largest file) | 2,014.5 kB | 600.5 kB |
| lazy chunks (not loaded at start) | 0 | Settings 162 kB (peerjs 28, webrtc-adapter 36, qrcode 21), Studio 91 kB (mp4-muxer 30), Karaoke 24 kB, share 3 kB, record 3 kB |
| startup CSS | 984 kB | 973 kB (Karaoke css 11 kB split out) |

Startup time: `startup.mjs` with a stub API gave script time 117 -> 86 ms and 129 -> 125 ms in two runs (noise is larger than the
effect on this machine), so a startup-time gain is **not proven**; the byte reduction is. Real Electron startup was not measured.
Fonts: @fontsource faces are unicode-range sliced and downloaded only when a look uses the family, so they were left alone.

### 3. Paused lyrics kept a 60 Hz loop running
`useFrame` (used by the word-synced line highlight, the terminal typewriter and the reveal counters) asked for an animation frame
every vsync and, in the word line, wrote a CSS variable per word per frame even when the song clock was frozen.
Now it skips the callback and naps in 120 ms steps while `getPosition()` does not change.

| scenario (paused, fullscreen) | before | after |
|---|---|---|
| `setProperty` calls per second | 226 | 0 |
| rAF calls per second | 57 | 7 |
| main-thread busy ms/s | 35 | 34 |

(busy time was already low because the paint was skipped; the gain is in wakeups, which is what costs battery on a laptop.)
Playing behaviour is unchanged: the position moves every frame, so the callback runs every frame as before.

### 4. Checked, no change needed
- Memory growth: 60 s soak of a playing fullscreen page: heap 12.0 MB flat (+0.13 MB), listeners +0, DOM nodes +11.
- Caches: artwork (30), tiny art (20), palette (40), main artwork memory (24) + disk (150 files, 6 MB cap), track index (400) are all capped.
- EdgeFx writes only changed values, only when something reads them; the shared lyric ticker is one 80 ms timer and skips hidden windows.
- Idle with nothing playing: the `data-calm` switch pauses endless CSS animations (paused page: 9 animations, busy about 35 ms/s).
- Main process timers: Spotify poll backs off (3 s playing, 6 s paused, 5-15 s in background), the always-on-top re-assert (2.5 s) and fade (250 ms) timers return immediately when not needed, the hidden window unloads its page after a delay.
- All look animations probed (dusk) animate only opacity / transform (compositor friendly).

### Baseline table (6 s windows, harness dev server; software rendering)

| scenario | busy ms/s | style ms/s | animations | DOM | heap MB |
|---|---|---|---|---|---|
| paused fullscreen | 35 | 1 | 9 | 382 | 30.9 |
| mini | 221 | 162 | 7 | 379 | 27.9 |
| fullscreen dusk | 400 | 262 | 114 | 349 | 27.2 |
| fullscreen neon | 320 | 215 | 99 | 324 | 28.7 |
| fullscreen cassette | 287 | 158 | 14 | 251 | 28.0 |
| fullscreen arcade | 218 | 135 | 18 | 249 | 27.5 |
| fullscreen journal | 309 | 157 | 9 | 266 | 28.3 |
| fullscreen terminal | 242 | 168 | 7 | 365 | 27.9 |
| dusk + Light mode | 241 | 109 | 5 | 349 | 28.7 |

Reading: the style-recalc share dominates every playing scenario (many CSS animations plus about 1 MB of CSS), and Light mode cuts
animations from 114 to 5. The after-run of the playing scenarios was within noise of the baseline (the changes above do not
touch them), which is expected.

## Not done / open

- CSS minification and splitting per look (984 kB CSS parsed at start): needs a visual diff of every look, out of scope here.
- Hidden export window (`?capture=1`), video decode cost, Android WebView on a low-end phone: not measured (no device); the
  capture window and the covered-window video rule were not touched.
- `Backdrop.tsx` has four interval timers (650, 140, two drift checks) for the video; left alone because the throttling rules
  there were just changed by another change.
