# Lyrics view and fallback screens: audit (roadmap item 11)

Scope: `LyricsView`, `LyricsStage`, `LyricsFallback`, `LyricsMatchPanel`, `store/lyrics.ts`, `store/offsets.ts`,
`hooks/useLyricsSync.ts`, the `[` `]` hotkeys, and how lyrics look in the looks. The lyrics engine (`src/core/lyrics`,
`lib/lyricsSource.ts`) is out of scope and was not touched.

## What already works (checked in code)

- One shared clock: `getPosition()` feeds both the active-line tick (80 ms, one shared timer, idle while the window is
  hidden, snaps on `visibilitychange`) and the per-frame word fill (`useFrame`, a CSS variable per word, no React render).
- Late lyrics, pause, seek and track change all land on the right line because the index is recomputed from the clock,
  never counted up.
- Click a line to seek (`seek(line.timeMs - offset)`), locked while the controls are locked. Save line and share card exist.
- Per-song offsets: localStorage map capped at 500, mirrored into the user-choices store, restored when a song starts.
- Fallback screens exist for offline, resting, error, none; instrumental and plain-text have their own copy.
- Reduced motion: global `[data-reduced]` rule in `base.css` plus `useReducedMotion` for the scroll behaviour.
- `LyricsStage` is `aria-live="off"`.

## Findings

| # | Area | Finding | Action |
|---|------|---------|--------|
| 1 | Render cost | Every `LyricRow` re-rendered on each line change (the `dist` prop changes for all rows), so `memo` did nothing; `romanize()` ran twice per row per render. | Clamp `dist` to +-7 (rows far away keep identical props and skip), romanise once per row. |
| 2 | Render cost | The word-fill loop wrote `--p` for every word on every frame, even for sung and future words and while paused. | Only write a word when its value changed. |
| 3 | Scrolling | A seek across a long song asked the browser for one long smooth scroll (sluggish, looks like a stutter). | Pure `scrollMode()`: jump when the target is more than ~2 screens away, glide otherwise. |
| 4 | RTL | Lines were forced left-aligned, the fill gradient always ran left to right. Arabic / Hebrew read backwards. | `dir` per line (first strong letter), start alignment, fill direction variable, mirrored scale origin. |
| 5 | Accessibility | Staged looks (fullscreen) expose no readable lyrics at all; `aria-live` is correctly off. | Visually-hidden "Lyrics (text)" region with the whole song as text (not live). Decision: no `aria-live` on lines (a sung line every 3 s would drown a screen reader); only the nudge toast and the fallback `role=status` announce. |
| 6 | Accessibility | Forced-colors (Windows high contrast): the fill uses `background-clip:text` + transparent colour. | `@media (forced-colors: active)` fallback to plain `CanvasText` with a clear current line. |
| 7 | Offset | `[` `]` changed the offset silently; no clamp feedback, no reset. | Toast "Lyrics 0.25 s earlier (+0.50 s)" and a click on the readout resets to 0. `clampOffset` extracted and tested. |
| 8 | Fallback | "Paste lyrics" only opened the panel; the user had to find the textarea. "Plain text only" had no way to look again for synced lyrics. | Paste focuses the textarea; plain footer gets "Look for synced". |
| 9 | Copy | No way to copy lyrics. | Footer "Copy" copies the whole lyric as text (timestamps stripped). |
| 10 | Tests | No tests for the pure logic. | `lib/lyricsView.test.ts`: active-line lookup edges, scroll target, scroll mode, offset clamp/describe, direction, text export. |

## Looked at and left alone (see report)

- **Lyric size / spacing setting.** `store/settings.ts` `lockLook` deliberately ignores `lyricFontSize` and `lineSpacing`
  (and main resets them): size is designed per look. A user control would reverse that product decision, so none was added.
- **Translation line.** No free offline translator ships with the app and none can be added without a model download or a
  network call. Feasibility: not possible within the rules. Romanisation (already offline) stays the only second line.
- **"Report wrong lyrics".** Would need a network call or an issue link; "Wrong lyrics?" (pick another match, paste your own)
  is the in-app fix. Left to the owner.
- **Looks.** No look CSS was redesigned; only `lyrics.css` (the classic list) got the RTL / forced-colors rules.
