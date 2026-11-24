# Looks architecture

How the 34 looks (vibes) are put together, how to change one without breaking another, and the performance budget.
The catalogue is `src/shared/vibes.ts`; the state is on `<html>` (`data-vibe`, `data-mode`, `data-platform`, `data-rim`, `data-motion`,
`data-perf`, `data-calm`), set together in `applyLook()` in `src/renderer/src/main.tsx`.

## Layers, in cascade order

The import order in `main.tsx` IS the cascade (later wins at equal specificity). Keep it.

1. Shared UI: `tokens, base, widget, player, lyrics, panels, android, polish, redesign, stage, vibes, layouts, skins, posters, states, cards`.
   `polish.css` ends with the global switches (calm, Reduce motion, Light) that sit under every look.
2. `scene.css`: the mechanics of the fullscreen "scene" (every look is `layout: 'scene'`): video window, card and lyric region are placed from
   the look's `--sc-*` variables.
3. One file per look (its scene, card, lyric styling, a second pass in the same file below the first), each directly followed by its
   `edge-<look>.css` (the animated frame `EdgeFx` draws). Row looks share `looks2.css` plus their own file.
4. Platform screens: `videofit, android-scenes, car, tv`.
5. Last word: `android-looks, mini-looks, minsizes` (text floors, `!important`).

Where does my change go? Into the look's own file (and its edge file). Not into a new layer, not into 1 or 5 unless it is shared.
Before touching a look: `grep -rn "data-vibe='<id>'" src/renderer/src/styles` to see every file that styles it.

## The pieces

- `VibeFx.tsx` (+ `components/fx/*`): the look's decorative layer, mounted once per look under `.vibefx`. Pure DOM + CSS animation.
- `EdgeFx.tsx`: the animated frame. Writes `--lp --li --lt --lv --ts` on `<html>` from the shared ~12 Hz lyric ticker, only when someone reads
  them (`lib/edgeVars.ts`: rim on and not TV, or a look in `FX_VIBES`). If you make a look's fx read a new variable, add the look there.
- `LyricsStage.tsx`: the lyric staging; `style` is fixed per look (`vibeInfo(vibe).style`).
- `hooks/useVibe.ts`: `effectiveVibe`, the conductor (cycle / smart pick per song), `cycleVibe` (the V key; remembers the pick per song in
  `settings.songVibes` outside Fixed mode).

## Changing a look safely

1. Take a baseline: `npx vite build -c scripts/harness/vite.config.ts --outDir ../../ui-test-out/dist-base --emptyOutDir`, then
   `node scripts/ui-test/shot-all.mjs --dist=ui-test-out/dist-base --out=ui-test-out/base --vibe=<id>`.
2. Make the change, rebuild into `dist-cur`, shoot into `ui-test-out/after`, `node scripts/ui-test/diff-shots.mjs ui-test-out/base ui-test-out/after`.
3. `node scripts/ui-test/looks-check.mjs --vibe=<id>` (switches: calm, Reduce motion, Light, rim off, forced colors) and
   `node scripts/ui-test/run.mjs --vibe=<id> --quick` (clipping, lyric contrast 3:1, touch targets).
4. Never run the whole 34-look matrix per look. Once at the end.

Rules of thumb:
- An endless animation needs an off switch. Calm and Light are covered for fx layers, their pseudo-elements, the card, the cover and the
  status bars by `polish.css`; a NEW kind of element that animates forever must be added there (looks-check will tell you).
  Reduce motion: `animation: none` must still leave a correct still picture (the base style is the rest state, not frame 0 of a reveal).
- Do not use `backdrop-filter` on the playing screen of a look; Light mode strips it everywhere, so the look must stay readable without it.
- Text over a photo or video needs a scrim: lyric contrast is judged at 3:1 on the sung line, at every window size, by `run.mjs`.
- Sizes in `vh`/`vw` and the `--sc-*` variables; text floors come from `minsizes.css`.

## Performance budget (per look, playing, 1080p, high performance)

- No JS per frame: the only recurring JS is the shared lyric ticker (about 12 Hz, writes CSS variables, skipped while hidden) and the few
  fx clocks (Arcade 1 s, FilmStrip 400 ms, Lens 500 ms, Lock 15 s), all skipped while hidden.
- Animate `transform` and `opacity` only; no animated `filter`/`box-shadow` blur on large areas; at most a handful of layers promoted
  (`will-change` is used 8 times in the whole app, keep it that way).
- Paused (calm), hidden, Reduce motion and Light: zero running endless animations (checked by `looks-check.mjs`), no `backdrop-filter`.

## Accessibility

- Reduce motion (Settings or the OS) sets `data-motion='off'`; every look must be still.
- Forced colors: the app does not restyle for Windows High Contrast. `looks-check.mjs` only asserts that the lyric line still renders.
