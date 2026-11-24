# Reliability and diagnostics audit (roadmap item 18)

Rule for everything below: nothing is ever sent anywhere automatically. Diagnostics are produced on demand, on the
user's PC, and only leave it if the user pastes them into an issue.

## 1. Findings (before this work)

| Area | State | Gap |
| --- | --- | --- |
| Logging | `logger.ts`: one file `userData/logs/lyra.log`, rotated to a single `lyra.old.log` only at the first write after start, redacts Bearer/access/refresh tokens and `code=` params. | Size is checked once per run (a long session can grow unbounded); only 1 old file; no scrubbing of the Windows user name in paths, e-mails, API keys, LAN IPs, Connect tokens; no recent-error ring; renderer `console.warn/error` never reach the log; no way to open the folder. |
| Crash handling (main) | None. No `uncaughtException`/`unhandledRejection` handler (Electron shows its own modal for the former). | Add handlers that log and keep running. |
| Crash handling (renderer) | No `render-process-gone`, `unresponsive`, `did-fail-load`, `child-process-gone` handling. A dead renderer leaves a blank widget in the tray. | Auto-reload with a loop limit and a friendly in-app message. |
| React error boundaries | None. One throwing component blanks the whole app. | Boundaries around the main view and the side panel. |
| GPU crash | Nothing. A bad driver means a crash loop. | On GPU process crash remember "software rendering" and apply it at the next start. |
| Startup resilience | `JsonStore.load` falls back to defaults on a parse error but the corrupt file is then overwritten by the next write (data lost, nothing to recover). Write is atomic (tmp + rename) but no backup. No schema versions. No safe mode. | Keep a `.bak` of the last good file, restore from it, keep the corrupt file as `.corrupt`, optional versioned migrations, safe mode after two unfinished starts. |
| Single instance | `requestSingleInstanceLock` + `second-instance` -> `windows.show()`. | Fine. Report only: it does not restore from minimised/tray-hidden into a specific mode (window-mode agent owns this). |
| Network resilience | `core/resilience.ts` has `retry`, `backoffDelay`, `CircuitBreaker`. Every fetch has a timeout (AbortSignal.timeout 10-30 s) except the streamed background media proxy (range requests, intentional). Retry is used by iTunes and YouTube lookups; the breaker only by the lyrics service. Spotify has its own backoff in `source.ts`. | Artwork, MusicBrainz and the Spotify token refresh use a single attempt without retry: acceptable (cosmetic data, polled again). No change. |
| Error strings | About 90 user-facing strings. Most say what happened and what to do. | Vague ones listed in section 3. |
| Diagnostics | `Copy diagnostics` exists (versions, settings JSON, 80 log lines). | Not scrubbed beyond token patterns, no GPU info, no cache sizes, no recent errors, no safe-mode/crash info, no log folder action. |
| Issue templates | None. | Add bug / lyrics-problem / feature templates asking for the report. |
| Docs | No troubleshooting guide. | Add `docs/troubleshooting.md`. |

## 2. What this change does

- `src/core/reliability.ts` (pure, tested): `scrubText`, `rotationMoves`, `chooseStoreSource`, `migrate`,
  `decideSafeMode`, `nextCrashState`, `canAutoReload`.
- `logger.ts`: scrubbing through `scrubText`, size cap checked while running, 3 rotated files (`lyra.1.log` ..
  `lyra.3.log`), `logDirectory()`, recent warn/error ring.
- `jsonStore.ts`: `.bak` on every write, restore order primary -> backup -> defaults, corrupt file kept as
  `<name>.corrupt`, optional `{ version, migrations }`.
- `crashGuard.ts`: process-level handlers, window handlers (render-process-gone, unresponsive, did-fail-load,
  renderer console warn/error forwarded to the log), GPU fallback flag, safe-mode marker.
- `diagnostics.ts`: the scrubbed report (version, OS, GPU, settings summary, cache sizes, recent errors, last 120
  log lines, crash/safe-mode state) and "Open log folder".
- `ErrorBoundary` in the renderer; notice toast after an automatic reload.
- Settings -> About: one extra pill, "Open log folder", next to the existing "Copy diagnostics".

## 3. Error strings that were vague (and the fix)

| String | Fix |
| --- | --- |
| Couldn't read that file. | now says to check it is a plain text .lrc/.srt/.txt and not open elsewhere |
| Couldn't clear the cache / reset settings / copy diagnostics | now says what to try |
| Couldn't read that audio file | names the supported formats |
| Couldn't load other videos. | says to try again or pick a file |
| Can't reach Spotify. (play controls) | says to check the connection, Lyra retries |

## 4. Safe mode semantics

A marker file `userData/startup.json` records `{ crashes, ok }`. It is written `ok:false` at launch and set
`ok:true` after the window has been loaded and stayed up for 20 s. Two unfinished starts in a row mean the next
start is in safe mode: software rendering, Connect/auto-updates/global shortcuts are not started, the user is told in
a toast, and the next healthy start leaves safe mode on its own. Caches and settings files are never deleted by
safe mode (they are only restored from `.bak` when unreadable).

## 5. Not covered / follow-ups

- No real Electron crash could be provoked here; see the manual test list in the PR description.
- Android WebView shell: only the shared renderer parts (boundary, scrubbing helpers) apply; native crash handling
  is outside this change.
- `lyrics` cache entries (`core/lyrics/service.ts`) parse with try/catch per entry already.
