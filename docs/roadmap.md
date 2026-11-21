# Roadmap

Owner's goals in order. Each phase lists what "done" means. Issues are labelled `roadmap` on GitHub.

## Phase 0: ship and learn (now)
Released 0.19.0 / 0.5.0 and 0.20.0 / 0.6.0. The owner tests on a real PC and Android phone and reports bugs. Fix them first.

## Phase 1: engine truth (no visual change)
**Status:** synced-first DONE; video: clip cache + failure memory DONE (Windows), pause/resume on Windows DONE, phone pause and measured latency OPEN; smooth start OPEN.
1. **Synced first** (docs/engine-plan.md section 1): rank all candidates, prefer synced; upgrade plain to synced later. Done when: a unit test proves synced beats plain across providers and that a plain result is replaced when a synced one appears; the UI shows "Synced" / "Not synced" honestly.
2. **Video playback quality** (section 2): sync with the music, smooth Apple clip, remember failures, prefetch. Done when: pause/resume lag < 300 ms in a measured test, the Apple clip plays without stutter on a mid-range PC, a song that failed once never retries the same failing source for 7 days.
3. **Smooth start** (section 3): preload the next track; a short start gate only when needed. Done when: on a normal connection the next song's lyrics + video are ready before it starts in 95 % of cases, and no track is ever delayed more than 1.5 s.

## Phase 2: one fixed UI per vibe and state (the big design phase)
**Status:** per-vibe state screens DONE for all 16 vibes (0.21.0); settings controls removed DONE; lyrics-state test matrix (`test:ui:states`) DONE; designed screens per matrix cell OPEN.
Spec: docs/ui-state-matrix.md. Done when: every cell of the matrix has a designed, tested screen for every device class; the UI tests render the whole matrix; Settings has no layout or style controls.

## Phase 3: personalised cards and themed everything
**Status:** share cards, Settings skins and poster frames DONE for all 15 vibes; the player card block (title/controls) per vibe and widget colours OPEN.
Per-vibe player card, share card, settings skin, video treatment. Done when each vibe has its own card design (doodle language where it fits) in the player and in the share dialog, and screenshots for all of them are in `docs/screenshots/`.

## Phase 4: platform polish
Widget on real launchers, Android karaoke (#48), code signing (#53), Apple Music / other Windows players (#6), Vega source (#54), more vibes (sports, games, music, movie), translations (#3).

## Always
Keep `npm run test:ui` green; keep Settings short; keep releases flowing through the workflow route in CONTEXT.md.

## Ideas queue (owner likes motion-graphics lyric videos)
More `zoom`-stage vibes (comic-book pop, film-strip, spray stencil), 3D camera fly-through of words, beat-reactive scale. Reference video: owner's Instagram sketch-typography clip (see CONTEXT.md section 7).
