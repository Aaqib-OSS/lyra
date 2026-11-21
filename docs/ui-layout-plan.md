# UI layout plan: where everything goes

Written 2026-11-21 after auditing every mode (screenshots in `docs/screenshots/layout-*`). Status of each item is at the end.

## Principles
1. **Lyrics are the hero.** In every mode they get the most room and the best contrast. Controls support them.
2. **Three tiers of controls.** *Primary* (play, previous, next, progress, like) is always visible and big. *Secondary* (queue, moments, karaoke, export, vibe) is one tap away, grouped, never a row of nine tiny icons. *Window chrome* (minimise, collapse, close) is visually separate and quiet.
3. **Reach.** On a phone the controls live in the lower third (thumb zone); the top holds only what you read.
4. **One hierarchy for the song card:** cover, title (largest), artist, then small facts (album/year, source). Nothing the user cannot act on (e.g. a volume slider on a phone, "Studio PC" when it is this phone).
5. **Readable by default:** past/next lines never fall below 40 % opacity; the active line is at least 1.5x the others; lines never overlap; text scales with the screen (bigger on 1080p/1440p/TV, never smaller than the user's setting).
6. **Every size works:** nothing is clipped at 1024x600, nothing is tiny at 2560x1440, phones work in portrait and landscape and with the keyboard/gesture bar.
7. **Touch targets** are at least 44 px on touch devices and 30 px with a mouse.

## Per surface

### Android phone, portrait (the biggest change)
```
 ┌──────────────────────────┐
 │ [cover] Title        ♡ ⚙ │  now-playing strip (tap = show big cover)
 │         Artist · device  │
 │                          │
 │      L Y R I C S         │  hero: ~65% of the screen
 │      (stage / vibe)      │
 │                          │
 │ 0:43 ━━━━●━━━━━━  3:12   │  dock (thumb zone)
 │ 🔀   ⏮   ▶(68)   ⏭   🔁 │
 │ queue  saved  record  ☾  │
 └──────────────────────────┘
```
* No volume row (hardware keys), no device label for this phone, no tiny 16 px icon row.
* Big cover is one tap away (strip), not permanently eating 30 % of the screen.
* Dock hides with the lyrics growing when a video plays and returns on touch (existing behaviour kept).
* Landscape: two panes, strip + dock on the left, lyrics on the right.
* Settings: a full-height sheet, tabs in one scrolling row, 56 px rows, hints instead of tiny (i) icons.

### Windows expanded player (420 x 700 and resizable)
* Header: device name left; right: **Settings, Fullscreen, More (⋯)**; window controls (minimise, collapse, close) after a divider.
* **More** holds Queue, Saved moments, Karaoke, Export lyric video (labelled, so no guessing icons).
* Lyrics area gets at least half the height; cover shrinks before lyrics do.

### Windows compact / minimal
* Unchanged structure (cover, title, one live lyric line, transport); lyric line stays one line; the sync dot never overlaps text.

### Fullscreen
* Card and lyrics side by side; card width limited by height so nothing clips at 1024x600; lyric size scales with screen height (clamped).
* With a video: card docks bottom-left and shrinks, lyrics centre over a soft scrim, status pill top-centre, controls fade when idle.
* Narrow / portrait windows use the Poster layout (existing Auto logic).

### Settings (all platforms)
* Tabs: one row that scrolls sideways (no 4+3 wrapping); active tab stays in view.
* Grouped cards, label + hint left, control right; hints replace (i) pop-overs on touch.

## Status
- [x] Phone: lyrics-first layout, strip + dock, big-cover toggle, no volume row, 44 px targets, landscape two-pane, Vibe button
- [x] Phone settings: bottom sheet, 58 px rows, near-opaque in Light mode, no (i) pop-overs
- [x] Windows expanded player: Settings + Fullscreen + More menu + separated window controls
- [x] Settings tabs: one sideways-scrolling row that keeps the chosen tab in view
- [x] Readability: lyric lines no longer collide (3D depth removed), inactive lines >= 42 % opacity, lyric size scales with screen height
- [x] Fullscreen: card limited by height, nothing clipped at 1024x600
- [ ] Compact / minimal widget: unchanged on purpose (audit found no layout problem)
- [ ] Fullscreen with video: audited, no change needed this round
- [ ] Android tablet / foldable two-pane layout (next)
