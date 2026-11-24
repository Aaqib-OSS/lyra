# Testing

**CI is the gate.** Locally run the subset that covers what you touched (one look, one size, one test file); the whole suite runs on every pull request in `.github/workflows/ci.yml`. Do not run the full UI matrix repeatedly on a development machine.

## Every command and when to use it

| Command | What it does | When |
|---|---|---|
| `npm run check` | typecheck + unit tests + docs check + site check | before you open a pull request (about a minute) |
| `npm run typecheck` | `tsc` for the main and the web project | after every TypeScript change |
| `npm test` | Vitest unit tests (`src/**/*.test.ts`) | after logic changes; `npx vitest run src/main/settings.test.ts` for one file |
| `npm run test:coverage` | the same tests with a coverage report in `coverage/` (HTML) and totals in the terminal | to see what is untested; informational, no threshold. Needs `npm i --no-save @vitest/coverage-v8@<the vitest version>` once (CI does this itself) |
| `npm run check:docs` | dead links and missing paths in the Markdown docs (`scripts/check-docs.mjs`) | after editing or moving any doc or file a doc names |
| `npm run check:site` | the website's files, assets and numbers (`scripts/check-site.mjs`) | after editing `website/` or the look data |
| `npm run build` | production build of the Electron app (`out/`) | before the Electron smoke test; CI builds it too |
| `npm run test:electron` | **real Electron end-to-end smoke test** (see below) | after changes to the main process, preload, window handling, IPC |
| `npm run test:ui:quick` | 5 sizes x every look in a real browser (about 170 screens) | after changing a look or layout (use `--vibe=` / `--device=` to narrow it) |
| `npm run test:ui:states` | lyric outcomes (plain, none, offline) on 4 sizes x every look | after changing lyric states or empty screens |
| `npm run test:ui` | the full matrix: 13 sizes x every look | rarely; CI does the quick matrix, run this before a release if you changed shared CSS |
| `npm run test:settings` | clicks every setting and checks it changes the app | after changing Settings |
| `npm run test:video` | pause / resume latency of the HTML video (needs ffmpeg) | after changing video playback |
| `npm run build:harness` | builds the browser harness (`scripts/harness/dist`) once | CI does it so shards share one build; locally use it with `UI_HARNESS_DIST=1` |
| `node scripts/ui-test/scene-check.mjs --vibe=<id>` | layout only, one look on every state and size | while building a look |
| `node scripts/ui-test/vibe-sheet.mjs --vibe=<id> --out=<dir>` | contact sheets per device | design review of one look |
| `node scripts/ui-test/edge-check.mjs`, `overlay-check.mjs` | edge cases of the harness; the OBS overlay against the real hub | when touching those areas (not in CI) |
| `cd android && ./gradlew testDebugUnitTest lintDebug` | Kotlin unit tests and Android lint (`android/app/src/test`) | after changing Android code; CI runs it as the `android-unit` job |

Details of the browser checks (what fails a screen, options, ports, harness switches) are in `docs/ui-testing.md`.

## The browser UI tests

`scripts/ui-test/run.mjs` renders every look at every size in headless Chromium through the harness (`scripts/harness`) and measures clipped text, off-screen controls, colliding lyrics, contrast on the real pixels, touch targets and page errors.

Options: `--quick`, `--states`, `--vibe=a,b`, `--device=phone,win-mini`, `--shots` (keep every screenshot), `--out=<dir>`, `--workers=N` (default one per CPU, 2 to 6), `--shard=2/4` (run every 4th screen starting at the second), `--retries=N` (default 1 on CI, 0 locally).

All scripts share `scripts/ui-test/lib.mjs`: the harness server (dev server, or `vite preview` of a prebuilt harness with `UI_HARNESS_DIST=1`), the pinned browser settings and the shard helper. `UI_PORT` picks the port (defaults: run 5199, settings 5199, video 5198); two runs on one port kill each other.

### Why Windows and Linux used to disagree, and what is pinned

The UI tests passed on Windows and failed on the Linux runner more than once. The causes found in the code:

1. **System fonts.** The web fonts (Inter, Nunito, Fraunces, Caveat, Unbounded, VT323, Press Start) are bundled with the app and identical everywhere. The fallbacks are not: the terminal and code looks name `Cascadia Code, Consolas, Courier New`, other looks end in `Segoe UI`, `Georgia` or `system-ui`, and Devanagari / Gurmukhi lyrics (`?lang=hi|pa`) and emoji use whatever the OS has. Linux has none of the Windows families and used to fall back to DejaVu, which is about 3 percent wider than Cascadia and 9 percent wider than Consolas, so a line that fits on Windows clipped on Linux. The CI jobs now install `fonts-liberation` (metric twin of Courier New and Arial), `fonts-dejavu-core`, `fonts-noto-core` and `fonts-noto-color-emoji`, so the fallback is defined instead of whatever the runner image has.
2. **Glyph rendering.** Linux hints glyphs and uses sub-pixel colour fringes, Windows does not. The contrast measure reads real pixels, so fringes and hinting moved it. Chromium now runs with `--font-render-hinting=none --disable-lcd-text --force-color-profile=srgb` on every platform, with one scale factor, `en-US`, UTC, the light colour scheme and normal motion in every context (`BROWSER_ARGS` and `CONTEXT_OPTIONS` in `lib.mjs`).
3. **Timing.** A software-rendered runner is several times slower, and a page measured mid-transition fails. `run.mjs` waits for web fonts (twice: once after load, once after the settle loop, because a late lyric style can request a face of its own), for one-shot animations and for the lyric scroll to stop. Looping decoration is ignored on purpose. Framer-motion springs are not visible to `document.getAnimations()`, which is why a 2.8 s floor remains.
4. **Selectors.** The lyric text is found through two selector lists in `run.mjs`; a look missing from them fails with "no lyric text" on every platform, not only on Linux.

Tolerance rules, so nobody tunes a threshold to one machine: contrast needs 3:1 (do not lower it; fix the look); clipping allows 3 px of cut (sub-pixel noise); overlap needs more than 4 px both ways; touch targets 36 px; text 10 px. Monospace looks are the least pinned (no bundled monospace web font exists), so a failure only on the terminal or code looks should first be reproduced with the same fonts installed before it is "fixed" in CSS.

### Flaky-test policy

* A failing screen is re-run once in a fresh page (`--retries=1`, the CI default). Failing twice fails the job. Passing the second time is reported as `~ FLAKY` in the log and the job summary, keeps its screenshot as `FLAKY_<look>__<size>.png`, and does not fail the job. A flaky screen is a bug to look at (usually a missing wait), not noise to ignore: open the screenshot from the `ui-test-flaky-*` artifact.
* Failing screenshots are uploaded as the `ui-test-failures-<shard>` artifact (7 days).
* Do not add `retries` anywhere else, and do not raise it above 1.

## CI layout (`.github/workflows/ci.yml`)

| Job | Runner | Required | Content |
|---|---|---|---|
| `check` | Windows | yes | typecheck, unit tests, docs check, site check, production build |
| `coverage` | Linux | no | Vitest coverage, totals in the job summary, `coverage` artifact |
| `harness` | Linux | yes | builds the browser harness once, uploads it |
| `ui` (matrix) | Linux | yes | `quick-1of2`, `quick-2of2`, `states-1of4` .. `states-4of4`, `settings`, `video`; each shard downloads the harness build, restores the Playwright browser cache, and runs in parallel |
| `electron` | Linux + Xvfb | not yet | the Electron smoke test |
| `android-unit` | Linux | yes | Kotlin unit tests and lint |
| `pr-template` | Linux | yes (pull requests) | the pull request description keeps the template sections and says something (`scripts/check-pr.mjs`) |

Also: concurrency cancels a superseded run on the same pull request (never on `main`, because the release gate in `android.yml` reads the CI run of the exact commit); every workflow has `permissions: contents: read` at the top (CodeQL adds `security-events: write` on its one job); actions are pinned by major tag; npm and Playwright browsers are cached; Dependabot (`.github/dependabot.yml`) watches npm, Gradle and the actions.

Speed (estimates, not measured on CI): before, one Linux job ran quick (170 screens), states (408), settings and video one after another with 4 workers, roughly 12 to 15 minutes after setup. Now the largest shard is about 100 screens, so the UI part ends in about 4 to 6 minutes including setup, and the other jobs run beside it.

## Electron smoke test

`npm run build` then `npm run test:electron` (`scripts/ui-test/electron-smoke.mjs`) launches `out/main/index.js` with Playwright's Electron support, with a throw-away `--user-data-dir` (it never touches your settings or an installed Lyra), and checks: the app boots and a window appears; the first-run welcome card shows and closes; demo mode starts and the demo track is on screen; compact, mini, fullscreen and back switch (also the real "Expand player" click); Settings opens and closes; the Studio (export lyric video) dialog opens and closes; no uncaught page errors; `app.quit()` exits with code 0.

Without the electron binary or without `out/` it prints SKIP and exits 0, unless `ELECTRON_SMOKE_REQUIRED=1` (CI sets it). On Linux run it under `xvfb-run -a` with `ELECTRON_NO_SANDBOX=1`. Screenshots and `report.json` land in `ui-test-out/electron`. It has been run on Windows; the Linux job has not run on CI yet, which is why the job is not required.

## Unit tests

42 Vitest files under `src/` (main process, shared logic, core lyrics and timing, Connect hub). Seven Kotlin test classes under `android/app/src/test` (updater, TV / Connect client, Car, AOD, audio).

**Coverage numbers:** not measured in this change (the provider package is not in `package.json`, and installing it needs the network). The `coverage` CI job prints lines, statements, functions and branches for `src/` (React components excluded: they are covered by the browser tests, not by Vitest) in its summary; copy the first green numbers here: _pending first CI run_. No threshold fails a build yet; decide one after the first numbers are in.
