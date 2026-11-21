# Lyra: context for the next session

Read this first. It says what Lyra is, how the repo works, how to test and release, what has been done, what the owner (Dhruv) asked for next, and the rules we work by. Everything here is current as of **2026-11-21** (Windows 0.19.0, Android 0.5.0).

## 1. What Lyra is
A free, open-source, account-free lyrics companion. It shows word-by-word synced lyrics over the music video of what you play, on **Windows** (Electron) and **Android** (a Kotlin shell around the same React UI in a WebView). Sources of what is playing: Windows media controls (Spotify desktop app), the Spotify Web API, the Android media session, or a built-in demo.

## 2. Repository map
| Path | What |
|---|---|
| `src/renderer/src` | The React UI, shared by Windows and Android (components, hooks, stores, `styles/*.css`) |
| `src/main`, `src/preload` | Electron main process, IPC, settings, windows, Spotify/SMTC sources |
| `src/core` | Platform-agnostic engine: lyrics (`lyrics/`), backgrounds/video (`background/`), `resilience.ts`, `songKey.ts`, `platform.ts` interface |
| `src/shared` | Types, IPC names, shortcuts, `vibes.ts` (vibe catalogue + layout archetypes + smart picker), `lrc.ts` |
| `src/android-web` | The Android side of `window.lyra` (same core, run inside the WebView) |
| `android/` | Kotlin: `MediaMonitor`, `LyricsNotifier`, `LyraWidget`, recorder, overlay, ambient |
| `scripts/harness` | A browser harness: the real UI with demo data and a mocked `window.lyra` (see section 5) |
| `scripts/ui-test` | `run.mjs` (UI matrix) and `settings.mjs` (click every setting) |
| `docs/` | Design notes. **Start with** `docs/ui-state-matrix.md`, `docs/engine-plan.md`, `docs/roadmap.md` |

## 3. Key concepts
* **Vibe** (`src/shared/vibes.ts`): a complete look (colours, type, background FX in `VibeFx.tsx`, a lyric *stage* in `LyricsStage.tsx`, and a *layout archetype*: side / dock / orb / bar / chat / term). 15 vibes. Modes: Fixed, Every song (cycle a chosen pool), Smart (`pickVibe` scores words, pace, year, cover colours). `V` / `Shift+V` cycles.
* **Layout archetype**: where the card, lyrics and controls go in fullscreen (`styles/layouts.css`, `data-arch` on `.full`).
* **Song identity** (`core/songKey.ts`): `artist|title` normalised. Lyric picks, video picks, imported lyrics and vibe picks are stored under it so they survive switching player.
* **Resilience** (`core/resilience.ts`): backoff + jitter, retry, circuit breaker. Used by the lyrics service and the video lookups. Lyrics: stale-if-error, no false "no lyrics", imports (`.lrc/.srt/.txt`), per-service health in Settings.
* **VideoStatus** (`components/VideoStatus.tsx`, `store/bgState.ts`): one place that says what the video behind the lyrics is doing.
* **Performance**: `data-perf` (Auto/Smooth/Light), `data-calm` pauses endless animations when paused/hidden; the backdrop picture is pre-blurred (`useTinyArt`).

## 4. How to run things
```
npm ci
npm run typecheck && npm test                 # 112 unit tests
npm run dev                                    # Electron (Windows)
npx vite -c scripts/harness/vite.config.ts --port 5199   # the browser harness
npm run test:ui                                # 195 screens (every vibe x 13 sizes)
npm run test:ui:quick | test:ui:layouts | test:settings
npm run build && npm run build:android-ui
```
Harness URL switches: `?mode=mini|compact|minimal|full`, `?android=1`, `?paused=1&t=<ms>`, `?video=night|day`, `?vs=searching|nokey|none|error|live|preview`, `?ly=offline|resting|error|none|stale`, `?lang=hi|pa`, `?s=<json settings>`, `?panel=settings|queue|lyrics`. `window.__next()` plays the next demo song. Playwright + Chromium work in the cloud container; `ffmpeg` generates the test clips (`scripts/harness/make-video.sh`).

## 5. Release procedure (important: tags cannot be pushed from the cloud session)
1. Work on the dev branch, open a PR, wait for CI (`check`, `ui`, CodeQL), squash-merge.
2. Bump `package.json` (+ lock) and `android/app/version.properties` (versionCode must rise).
3. Dispatch the workflows **on main with `publish=true`**: `release.yml` (Windows installer, `latest.yml`, becomes "latest", the updater serves it) and `android.yml` (APK, `--latest=false`). GitHub creates the tag and release itself. Pre-release is decided from the **version** (a dash means pre-release), not the tag name.
4. Verify both releases exist with their files.
Tag pushes and `git push --force` are blocked in the cloud environment; use the workflow route.

## 6. Rules of engagement (from the owner)
* Do the work, verify it, ship it; do not wait to be asked. Share screenshots and honest reports. Be explicit about what is **not** tested (no Windows machine, no Android device in the cloud).
* The owner tests the releases on a real PC and Android phone and sends bugs.
* Original designs only (no trademarked logos or art); pop-culture vibes are *inspired by*, never copies.
* Keep Settings simple and human; remove what is not needed.
* PRs follow `.github/pull_request_template.md`; commits end with the Co-Authored-By trailer given by the session.

## 7. State of the world (2026-11-21, Windows 0.20.0 / Android 0.6.0)
Done: 15 vibes with archetype layouts, cycle/smart, resilient lyrics/video backend, lyrics import, VideoStatus, performance mode, simplified settings (6 tabs) with **no layout/style controls** (`lockLook` in `store/settings.ts` ignores the old values), synced-first lyrics engine (plain kept as fallback, re-checked after 24 h), Apple clips cached on disk (`main/background/service.ts`), failed videos remembered per song (`lib/failMemory.ts`), video fades in only once playing, per-vibe **share cards** (`lib/shareCard.ts` `cardTheme`), per-vibe **Settings skins** (`styles/skins.css`), per-vibe animated **poster frames** for the cover (`styles/posters.css`, deco layers in `Artwork.tsx`), Android phone layout + tablet/foldable two-pane, UI tests in CI (`test:ui:quick`, `test:ui:states`, `test:ui:layouts`, settings), Android widget (**compiled, not run on a device**). Screenshots: `docs/img/`.
Known gaps: widget untested on a launcher; the player card (title/controls block) is still the standard card in most vibes; phone YouTube video does not pause with the music; no smooth-start preload/gate; Android clip proxy has no cache; dead `fullLayout` code paths remain (no effect); nothing was exercised on real Windows/Android hardware by this agent; Electron 45 Dependabot bump unreviewed; installer not code-signed (#53).

## 8. What the owner asked for NEXT (verbatim intent, organised)
See `docs/roadmap.md` for the plan and the GitHub issues labelled `roadmap`.
1. **(partly done: state tests exist, designed screens per cell remain)** **Fixed UI per vibe for every state.** No user control of layout. For each vibe, one fixed design for every combination: *video playing / no video* x *lyrics synced / plain (unsynced) / none / loading / error* x *every device and size* (Windows compact/minimal/expanded/fullscreen, small windows, Android phone portrait & landscape, Android tablet/foldable). Spec: `docs/ui-state-matrix.md`.
2. **(done)** **Remove UI-manipulation settings** (fullscreen layout Cinema/Split/Poster/Focus/Auto, lyric style, typeface, size, line spacing, animation ...). The owner will improve the fixed UIs from feedback.
3. **Everything per vibe**: the player card, the share card, the lyric style, how the video is shown, the whole layout, and even the Settings page skin. Cards should be **personalised, doodle-style where it fits** (the share-card doodle was the reference), not the default glass card. "Think of what styles suit each vibe."
4. **(done)** **Lyrics engine:** always prefer **synced** lyrics, reject unsynced when a synced one exists (see `docs/engine-plan.md`).
5. **Video:** pause/resume exactly with the music; the 30 s Apple preview lags a lot (fix); other videos lag too; cache so a video that failed once does not fail again for the same song.
6. **Smooth start:** if lyrics/video are not ready, avoid a long wait; idea: preload for the next song, merge smoothly from start to end, a short gate at most (never "pause 10 s for every song").
7. Keep adding vibes later (the owner wants more, including sports/games/music/movie themes).

## 9. Pitfalls we hit
* `paused=1` in the harness must freeze the position (it now does) or tests drift into instrumental gaps.
* A generic rule forces the active lyric word white in non-light themes (`lyrics.css`); light vibes must override it (Diary does).
* Android `RemoteViews` supports only a few view types; the widget compiles in CI but is untested on devices.
* 3D transforms on lyric lines made neighbours collide; depth is now size + opacity only.
