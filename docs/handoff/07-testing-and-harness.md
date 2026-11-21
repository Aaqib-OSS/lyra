# 7. Testing and the browser harness

## Unit tests
`npx vitest run` (128 tests): lyrics service/match/providers, LRC, word timing, resilience, vibes, shortcuts, startGate, fullLayout. Use fake providers + fake clocks for engine tests. `npm run typecheck` (node + web tsconfig) must always pass.

## Browser harness (`scripts/harness/`)
A Vite page (`index.html`, `entry.ts`, `vite.config.ts`) that mounts the real renderer (or Android UI) with a **mocked `window.lyra`** and demo data, plus ffmpeg-generated test videos in `scripts/harness/public/` (`make-video.sh`; mp4s are git-ignored). URL switches:
`?mode=mini|full|compact|minimal`, `?android=1`, `?paused=1&t=<ms>` (freezes the position; without it tests drift into instrumental gaps), `?video=night|day|site` (a video behind), `?ly=plain|none|offline|resting|error|stale` (lyrics outcome), `?vs=` (video states), `?lang=hi|pa`, `?s=<json settings>` (e.g. `{"vibe":"neon","performance":"smooth"}`), `?panel=settings|queue|...`, `window.__next()`, `window.__setPlaying()`.

## UI tests (Playwright, `scripts/ui-test/`, doc `docs/ui-testing.md`)
* `run.mjs` renders vibes x devices and measures on real pixels: text clipped by its box, overflow, overlap, contrast (ink vs the ground inside the box), touch targets, tiny text (<10 px), horizontal scroll, "no lyric text" (selector lists `stageSel`/`nowSel` must know every stage). Modes: default (all vibes x 13 devices), `--quick` (5 devices), `--states` (plain/none/offline lyric states on 4 devices), `--layouts` (legacy fullscreen layouts x languages x sizes), `--vibe=a,b`, `--device=`, `--shots`. Env `UI_PORT` (or `LYRA_UI_PORT`) changes the server port so several runs can coexist.
* `settings.mjs`: every Settings control flips and is saved; the removed controls must be gone (27 checks).
* `video-sync.mjs` (`npm run test:video`): pause/resume latency of the HTML video (needs ffmpeg).
* `vibe-sheet.mjs --vibe=<id> --out=<dir>`: contact sheets per device for **design review** (video/no video x synced/plain/none). Use it one vibe at a time: look, fix, re-look.
* CI job `ui` runs quick + settings + states + video (about 6 minutes).
* `scripts/make-site-shots.mjs`: generates the website screenshots.

## Pitfalls that cost hours
* **Stale dev servers** serve old CSS: always `pkill -f 'port 519'` (or your port) before design reviews; the test scripts now start servers in their own process group and kill them.
* Image viewer caching: write review sheets to a fresh path each time.
* In a git worktree with a symlinked `node_modules`, Vite refuses to serve fonts from the real path (fake failures such as controls "outside the window", wrong contrast). Copy `node_modules` or allow the path.
* The first screen of a cold CI run is slow: tests wait for `document.fonts.ready` and ~2.8 s before measuring.
* Harness videos are garish fractals; the website screenshots use a calm `site.mp4`.
* Real hardware is never available in the cloud session: say so in reports.

## Review routine for a look
1. `pkill -f 'port 519'`. 2. `node scripts/ui-test/vibe-sheet.mjs --vibe=<id> --out=/tmp/x`. 3. Open the sheets (win-full, phone, win-mini, tablet). 4. Fix CSS. 5. Repeat. 6. `node scripts/ui-test/run.mjs --states --vibe=<id>` and `--vibe=<id>`. 7. Commit that vibe, then the next.
