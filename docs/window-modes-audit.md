# Window modes audit (roadmap item 10)

Scope: minimal, compact, mini (the tall "expanded" player) and fullscreen on Windows (Electron), plus the tray, global shortcuts, startup and the hidden-in-tray unload. Car mode is an Android-only screen (`CarMode.tsx`, `store/car.ts`); it is not a desktop window mode and nothing here changes it.

Verified by reading the code and by the browser harness (`?mode=...`). Not verified on real Windows, real multi-monitor or real DPI changes (no Electron here).

## Findings

Severity: P1 = real bug or data-loss feel, P2 = rough edge, P3 = polish.

### Backend (`src/main/window.ts`, `tray.ts`, `shortcuts.ts`, `index.ts`)

| # | Sev | Finding | Status |
|---|-----|---------|--------|
| 1 | P1 | Nothing reacts to `display-removed`, `display-metrics-changed`, resolution/DPI/taskbar changes or resume from sleep. A widget left on an unplugged monitor, or fullscreen at the old size, stays that way until the user hits Reset. Position is only clamped at launch and at a mode change. | fixed: `recoverPlacement()` on display events and resume |
| 2 | P1 | `tray -> Fullscreen lyrics` calls `show()` (which waits for an unloaded page) and `setMode('full')` at once. The mode event and shell animation go to a blank page, the window is grown to the union rectangle and only the 800 ms fallback shrinks it: a visible flash. Same for global shortcuts that expand. | fixed: a mode change on an unloaded page applies its final bounds directly |
| 3 | P2 | `wake()` waits a fixed 450 ms after load. On a slow disk that is too short (commands lost), on a fast one too long. | fixed: waits until the app root exists (polled), with a cap |
| 4 | P2 | `reassertTop` re-applies `setAlwaysOnTop` + `moveTop` every 2.5 s, even when the window is already topmost, and not after unlock/resume/display change (where Windows really drops it). | fixed: checks `isAlwaysOnTop()` first, plus events |
| 5 | P2 | No "start minimized": launch at login shows the window at once. | fixed: `--hidden` argument on the login item, setting `startInTray` |
| 6 | P2 | Second launch only calls `show()`. A second launch with arguments (jump list) has no meaning. | fixed: jump list tasks come in through the same single-instance event |
| 7 | P2 | Tray: no mode switch, no now-playing item, static tooltip, no "bring back" action for an off-screen window. | fixed |
| 8 | P2 | Global-shortcut failures are only visible in Settings. At startup the user presses the key and nothing happens. | fixed: a toast on the first failure after start or rebinding |
| 9 | P2 | `settings.position` only checked for finite numbers: `1e12` survives. `miniSize` / `compactWidth` were already clamped. | fixed (`sanitizePoint`) |
| 10 | P3 | `sizeFor('mini')` and `resetPlacement` use the *primary* display, even when the window lives on another. | fixed: display the window is on |
| 11 | P3 | Snap-to-edge and resize clamps lived inline in `window.ts`, untested. | moved to `shared/windowGeometry.ts` with tests |
| 12 | P3 | Security: `will-navigate` and `setWindowOpenHandler` are locked; `will-redirect` and `<webview>` were not. IPC guard (`isAppContents`, captures set) is correct and untouched. | `will-redirect` and `will-attach-webview` blocked |
| 13 | info | Minimized window: Spotify polling slows (`setBackground`), the song clock is extrapolated from `sampledAt` so it keeps time; lyrics re-sync on `visibilitychange`. Throttling for a covered window was changed by another agent: not touched. | reviewed |
| 14 | info | `armUnload` restores song (player snapshot via `init`), lyrics (cache), video (background store re-creates), mode (`getMode`). Not restored: open panel, distraction-free, per-song vibe pick. Acceptable; documented. | reviewed |

### Renderer

| # | Sev | Finding | Status |
|---|-----|---------|--------|
| 15 | P1 | Esc with the More menu open closes the menu **and** collapses mini / exits fullscreen (both listen on `window`). | fixed |
| 16 | P2 | `OverflowMenu`: no arrow-key navigation, no `aria-haspopup` / `aria-expanded`, focus is not returned to the button, first item is not focused. | fixed |
| 17 | P2 | Compact and minimal have no menu: Settings, Fullscreen, Next vibe are only reachable by expanding first. Fullscreen and mini menus differ (mini has Queue, fullscreen has it as an icon). | fixed: compact/minimal "More" menu, same wording as the other modes |
| 18 | P2 | `LOCAL_SHORTCUTS` (the "All keys inside Lyra" list) is out of date: no `M`, no `Esc` detail, no `?`. | fixed, plus the cheat sheet opens with `?` |
| 19 | P2 | `ResizeGrip` is a `role="separator"` with a mouse-only handler. | fixed: focusable, arrow keys resize |
| 20 | P3 | Esc ladder is only implicit: menu, then panel, then fullscreen -> mini -> resting size. Now documented in the UI list. | documented |

## Ideas added

- **Peek** (global shortcut): shows the widget for 5 s without stealing focus, then hides it again.
- **Click-through lock** for the widgets: mouse passes through the window; way out is the tray ("Unlock widget"), the global shortcut, or Show/hide. Never persisted, so a restart always unlocks.
- **Tray tooltip** shows the current lyric line (or "Title - Artist") while the widget is hidden.
- **Jump list / taskbar tasks**: Play / pause, Next, Fullscreen lyrics.
- **Bring back to screen** in the tray.
- **Cycle window mode** (`M` in the app).

## Not done (owner decisions)

- Per-mode and per-monitor position memory. The widget has one anchor on purpose (collapse from mini keeps the bottom edge). Per-monitor memory is easy to add on top of `windowGeometry`, but changes where the widget reappears; ask first.
- A desktop car mode. The Android one is a different product (big buttons for a phone in a dock).
- Taskbar thumbnail buttons (need icon assets).

## How it works now (short)

- `src/shared/windowGeometry.ts`: pure clamp / pick-display / snap / resize-limit functions (tested). `window.ts` only feeds it the displays.
- Display change, resume and unlock: `scheduleRecover()` (500 ms debounce) runs `recoverPlacement()` and re-asserts topmost. Fullscreen re-fits its display; a windowed mode is moved only when less than 60 percent of it is visible. Tray "Bring back to screen" forces it.
- Hidden in the tray: after 60 s the page unloads. `wake()` now waits for the app root (`uiReady`), and a mode change on an unloaded page sets the final bounds at once (no union rectangle, no animation to nobody).
- `--hidden` is on the login item; with Settings, Startup, "Start in the tray" it keeps the login launch hidden.
- Jump list (installed builds): `--cmd=toggle-play|next|fullscreen`; a second launch hands its arguments to the running app (`taskbar.ts`, `shared/launchArgs.ts`, whitelist only).
- Keys: `M` next window size, `?` keys sheet, Esc ladder (menu / sheet, then panel, then fullscreen to expanded, then expanded to widget). Global additions: Ctrl+Alt+K peek, Ctrl+Alt+U click-through lock (rebindable like the others).

## Manual test list (needs real Windows)

1. Two monitors: put the widget on monitor 2, unplug it: the widget appears on monitor 1 within a second. Plug back: it stays.
2. Fullscreen, change resolution or taskbar position: the window re-fits.
3. Sleep and wake, lock and unlock: the widget is still on top of a maximized app.
4. Tray, Window size, Fullscreen while the widget has been hidden for over a minute: no flash, song and lyrics are there.
5. Hide the widget and play a song: the tray tooltip shows the song (and the current line, if the page timers run while hidden: unverified).
6. Ctrl+Alt+K while hidden: the widget appears for 5 s without taking focus, then hides.
7. Widget, More, Click-through lock: clicks pass through; tray "Click-through lock" (or Ctrl+Alt+U) undoes it. Restart: unlocked.
8. Launch at startup plus Start in the tray, reboot: no window, tray icon present. Right-click the taskbar icon: Play / pause, Next track, Fullscreen lyrics work.
9. Rebind a global key to one another app owns: a red toast names it.
10. Expanded player: open More, press Esc: only the menu closes. Tab to the resize grip, arrow keys resize.
