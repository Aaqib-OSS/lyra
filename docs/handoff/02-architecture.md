# 2. Architecture

## Repo map
```
src/
  shared/        types, vibes catalogue, LRC parsing, word timing, ipc channel names (used by every side)
  core/          pure logic with unit tests: lyrics service + providers, background resolver (video), resilience, songKey, startGate
  main/          Electron main process: window, tray, shortcuts, Spotify/SMTC source, lyrics + background services, settings, updater, LAN room, studio export
  preload/       contextBridge API (window.lyra) -> ipc
  renderer/src/  React UI (components/, hooks/, store/, styles/, lib/)
  android-web/   Android entry: same React UI + a JS implementation of window.lyra backed by the Kotlin bridge (api.ts, rpc.ts)
android/         Kotlin app: MediaMonitor, LyricsNotifier, LyraWidget, RecordService, AmbientActivity, WebView host
native/          Windows helper (lyra-media.exe, SMTC/volume)
website/         marketing site (static HTML/CSS/JS)
scripts/         harness/ (browser mock app), ui-test/ (Playwright tests), make-site-shots.mjs, gen-cards.py, icon tools
docs/            plans, specs, images; docs/handoff/ is this pack
build/ packaging/ fastlane/ fdroid/ resources/   packaging and store assets
```

## Processes (Windows)
Electron: **main** (Node) <-> **preload** (contextBridge `window.lyra`) <-> **renderer** (React). IPC channel names live in `src/shared/ipc.ts`; types in `src/shared/types.ts`. The renderer never touches Node; it calls `window.lyra.*` (spotify, player, lyrics, background, settings, art, moments, app, studio...).

## Platforms share the UI
The same renderer code runs on Android. `src/android-web/api.ts` implements the same `window.lyra` interface with `fetch` for lyrics services and an RPC bridge (`rpc.ts`) to Kotlin for media session, settings, notification, widget, recording. `document.documentElement.dataset.platform` is `'android'` there; CSS and code branch on it. Android build: `npm run build:android-ui` (vite, `vite.android.config.ts`) writes into `android/app/src/main/assets/`.

## Windows modes
`data-mode` on `<html>`: `minimal` (296x64 pill), `compact` (380x140), `mini` (~420x700 player with lyrics), `full` (fullscreen). Components: `CompactWidget.tsx`, `MiniPlayer.tsx`, `FullscreenPlayer.tsx`. Android has `MiniPlayer` (phone strip + dock, tablet two-pane via `useWideScreen`), ambient screen (`ambient.tsx`), record screen.

## Data flow for one song
1. Player source emits a `PlaybackSnapshot` (track, position, isPlaying) -> `store/player.ts` (zustand). `getPosition()` interpolates between snapshots.
2. `store/lyrics.ts` asks `window.lyra.lyrics.get(track)`; main's `LyricsService` (core) tries providers with retry/circuit breaker/cache; result `LyricsResult` status `synced|plain|none|error`.
3. `useLyricsSync` finds the active line; `LyricsView` renders classic list or a staged style (`LyricsStage`) depending on the vibe's `style`.
4. `Backdrop.tsx` asks `useBackground` -> `window.lyra.background.resolve(track)` -> resolver picks user file / Apple clip / YouTube / living art; renders `<video>` or YouTube iframe behind everything.
5. `useEffectiveVibe` decides which vibe is on; `main.tsx` mirrors it to `<html data-vibe>`; CSS does the rest.
6. `usePrefetchNext` warms the next queued song; `useStartGate` (off by default) may hold playback <=1.5 s.

## State stores (zustand)
`store/settings.ts` (settings + `lockLook`), `store/player.ts`, `store/lyrics.ts`, `store/ui.ts` (mode, panel, toasts, `vibeNow`), plus a small `useBgState` inside `Backdrop.tsx` (video status).

## Persistence
Main: `JsonStore` files in userData (`settings.json`, `backgrounds.json`, lyrics cache, favourites, moments, youtube/itunes caches). Renderer: only tiny conveniences in `localStorage` (e.g. `lib/failMemory.ts`). Android: SharedPreferences for the widget vibe and settings via the bridge.

## Key invariants
* Settings are sanitised in `src/main/settings.ts` (`sanitize`) so corrupt files never break the UI.
* The renderer must work in the browser harness with a mocked `window.lyra` (`scripts/harness/entry.ts`).
* `src/shared` and `src/core` must stay free of Electron/DOM imports.
