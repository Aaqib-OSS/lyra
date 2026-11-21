# UI tests

Everything runs in a real Chromium through the browser harness (`scripts/harness`): the real stylesheets and components with demo data and a mocked `window.lyra`. No Electron or device is needed.

| Command | What it checks |
|---|---|
| `npm run test:ui` | every vibe on 13 sizes (phone, small phone, landscape phone, tablet, foldable, Windows minimal / compact / expanded, fullscreen 1080p / 768p / small / portrait): 195 screens |
| `npm run test:ui:quick` | a 75-screen subset (used in CI) |
| `npm run test:ui:layouts` | fullscreen Cinema / Split / Poster / Focus over a video with Latin, Devanagari and Gurmukhi lyrics (Roman line on) at 1366x768, 1920x1080, 2560x1440, 3440x1440 |
| `npm run test:settings` | clicks every setting and checks that it changes the app |

A screen fails when: text is clipped or leaves the window, controls are outside the window, the page scrolls sideways, lyric lines collide, lyrics overlap the card, the lyric you are hearing has less than 3:1 contrast (measured on the real pixels), a touch target is under 36 px, text is under 10 px, or the page throws.

Failing screenshots land in `ui-test-out/shots/` (git-ignored). Options: `--vibe=neon,dream`, `--device=phone,win-full`, `--video`, `--shots` (keep every screenshot), `--workers=4`.

The harness has switches for edge cases: `?vs=` (video: searching, nokey, none, error, live, preview), `?ly=` (lyrics: offline, resting, error, none, stale), `?lang=hi|pa`, `?android=1`, `?paused=1&t=<ms>` (freeze at a position).


## Lyrics-state matrix
`npm run test:ui:states` renders every vibe on phone, tablet landscape, Windows 1366x768 and the mini player with `?ly=plain`, `?ly=none` and `?ly=offline`; it fails on clipping, contrast, an empty screen, or plain lyrics not shown (`.plain__stanza`).
