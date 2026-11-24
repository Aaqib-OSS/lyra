# Looks audit (roadmap item 9)

Audit of the look system (the 34 looks) taken on branch `worktree-agent-a24d61096b2234d58`, 2026-11-24, against Lyra 0.27.0.
No look's art direction was touched. Method: read the code, `scripts/ui-test/looks-check.mjs` (new; measures running animations in a real
browser with `document.getAnimations()`, which also sees `::before`/`::after`), shot-all before/after diffs for the looks touched.

## Known open problems from the 0.24 review: verified in code

| Problem (memory note) | State now | Evidence |
|---|---|---|
| Wallet vs Drift Wall class clash `wlfx` | Already fixed. Only `components/fx/Looks25.tsx` and `styles/wallet.css` use `wlfx`; `wall.css` no longer defines it. | grep |
| EdgeFx writes root vars every 60 ms even with rim off / TV / calm / perf low | Already fixed. It now rides the shared ~12 Hz ticker, writes only changed values, does nothing unless `edgeNeeded()` (rim on and not TV, or a look with an fx layer that reads the vars), stride 6 in calm / motion off, x2 in Light. | `EdgeFx.tsx`, `lib/edgeVars.ts` |
| Stale variables after rim is switched off | **Real, fixed**: the vars stayed on `<html>` forever once nobody needed them. Now removed. | `EdgeFx.tsx` tick |
| Calm / motion-off rules miss `::before`/`::after` and `.edge` | `.edge` is covered (`edge.css`). Pseudo-elements of fx layers were **not**. **Real, fixed** (see below). | looks-check baseline |
| CI quick suite failed on Artwork (`none`) contrast | Not re-run here (one quick run at the end only). `run.mjs` already measures contrast per look. | n/a |

## What looks-check found before the fix (34 looks, calm / Reduce motion / Light)

Endless animations still running although the user asked for stillness:

- Calm (music paused): the status-bar equalizer `.vstat__bars i` in 11 looks; the card's own sway/float (`.full__side`: neon, chrome, dream moon);
  pseudo-element animations (neon `::before` buzz + backdrop grid drift, chrome beams, dream fog, cassette reels, arcade blink, blocks torch,
  glitch REC, paper lamp); the cover scan line `artwork::after` (editor, crt, glitch); glitch cover jitter.
- Reduce motion on: the three "rest" dots (`.stage__rest i`, `.lyric__dots i`, `breathe`) in every look; filmstrip holes; the Artwork
  look's backdrop drift (`none`: `art-drift`, `drift-a/b`); neon/chrome/dream/paper pseudo-elements; editor scan line.
- Light mode (perf low): the same set, plus the cover doodle (`ad-bob`) and the poster decorations (`artwork__deco`) in every look,
  the editor caret blink.

## CSS architecture (as found)

- 101 stylesheets, 13.6k lines, one import list in `main.tsx` that documents the cascade (kept; documented further in
  `docs/looks-architecture.md`). Order is semantic: shared UI, `scene.css`, one file per look followed by its `edge-<look>.css`, platform
  screens, then `android-looks`, `mini-looks`, `minsizes` last.
- `!important`: about 1030 across the sheets. Concentrations: `cards.css` 279 (share-card plates that must beat inline styles), `android-looks`
  66, `mini-looks` 62, `scene.css` 34. Most of these are deliberate "last word" rules (size floors, forced placement). Consolidating them
  would change specificity ordering; not provably safe without the full visual matrix, so left alone.
- `backdrop-filter`: 181 occurrences, 104 of them in `cards.css`/`skins.css` (share cards and Settings skins, not on the playing screen).
  `redesign.css` 17, `player.css` 9. Light mode turns all of it off (`polish.css`), verified by looks-check per look.
- `will-change`: 8 uses (base.css 3, vibes.css 4, karaoke2.css 1). Small. No change.
- Endless animations: 192 `infinite` declarations. Idle cost is zero when calm because of the pause rules.
- Dead rules: 62 rules and 9 selector lists referenced classes no TSX or Android code produces (the old fixed-layout fx pieces `vibefx__*`
  in `vibes.css`, `layouts.css`, `states.css`; `diaryfx__pin`, `duskfx__hills/glass`, `mini__now/dock/bgnote`, `settings__about`, and a few
  more). They were removed with a brace-aware script that also looks inside `:is()` lists (live members kept), about 12 KB of CSS. No class
  can be produced dynamically (no template-built `vibefx__${x}` names exist). `tv.css` `tvhud`/`tvsetup` are for the Android TV shell and stay.

## Performance

- Timers in fx components: Arcade 1 s (`setT`), FilmStrip 400 ms, Lens 500 ms, Lock clock 15 s. They ran while the window was hidden. Now
  skipped when `document.hidden` (the export capture window is an offscreen window that reports visible, same assumption the shared lyric ticker
  already makes).
- EdgeFx: no work when the look/rim does not need the variables; none while hidden.
- Quickly switching looks: `EdgeFx` and `VibeFx` unmount their fx per look; `--film-k` and the EdgeFx vars are removed on unmount. No leaks found.

## Accessibility

- Reduced motion: the in-app setting sets `data-motion='off'`; every look now stops its endless animations (verified per look).
- Contrast: `scripts/ui-test/run.mjs` measures the sung line at 3:1 on every look and device. Not re-run in full here.
- Forced colors: the app has no `forced-colors` rules. Chromium's automatic forced-colors mode (emulated) leaves Neon and Paper fully
  readable (black text on white, controls outlined), so no CSS was added; looks-check's `forced` step guards that a lyric line still renders.
  Decorative layers are not hidden in forced colors, an owner call (see the final report).

## UI (Settings > Look)

- Picker already has per-look swatch thumbnails, names and tags, and a pool mode for Every song / Smart.
- Changed: "Smart" is now explained in the panel (what it reads, that the same song gets the same pick, that V remembers a pick per song),
  Every-song mode has its own sentence, and the pool has a one-click "Use every vibe".
- A favourites / quick-switch list was not added: pool selection already is the favourites list for cycling, and `V` steps through the pool.

## Storage / reliability

- Per-song look choice exists (`settings.songVibes`, keyed by `trackKey`, trimmed to 300). The V key remembers it in Every song / Smart mode;
  in Fixed mode the choice is global by design.
- Switching a look mid-song: attributes are set together in `applyLook` (`main.tsx`); `EdgeFx` resets to neutral on a look or song change.
  No leftover state found in code review. Not exercised with a long soak test.

## Result after the fixes

`node scripts/ui-test/looks-check.mjs` (also `npm run test:looks`, optional `--vibe=a,b`): all 34 looks pass calm, Reduce motion, Light (no
endless animation, no backdrop-filter), rim off (no stale EdgeFx variables) and forced colors (lyrics render). Before: 100+ findings across
the three runs (every look failed Reduce motion or Light because of the rest dots and the cover doodle). Screenshot diffs (normal state,
full and mini) on 13 looks: no change above 0.2 % except a clock-dependent status pill that differs between any two runs.

Not done / left for the owner: consolidating the ~1030 `!important` (needs the full visual matrix), a favourites list in the picker, a
second `@keyframes art-drift` in `base.css` (the later one wins; the earlier one is dead but removing it was not verified visually).
