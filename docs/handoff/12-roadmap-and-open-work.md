# 12. Roadmap and open work (2026-11-21, after 0.22.0 / Android 0.8.0)

Detailed plan: `docs/roadmap.md`. Engine plan: `docs/engine-plan.md`. State matrix: `docs/ui-state-matrix.md`.

## Done
Everything in `CONTEXT.md` section 7 and the release notes (`website/whats-new.html`): 20 looks with layouts, states, cards, skins, posters, plates; fixed look (no layout settings); synced-first lyrics; clip cache; failure memory; prefetch; start gate (optional); video pause on Windows and phone; Android tablet/foldable, widget (vibe-aware, compiled only), queue where published; UI test suite in CI; website redesign; handoff docs.

## GitHub issues (open)
* **#69** one fixed UI per look for every matrix cell - done for full screen and phone; mini player/tablet reuse the CSS and are only tested for clipping/contrast.
* **#74** video lag: Apple clip stutter never measured on a real PC; Android clip cache missing; YouTube 720p in Light performance mode.
* **#75** smooth start: no measured "ready before the song" rate; Android prefetch limited by what players publish.
* **#76** widget on real launchers (battery optimisation, reboot state, Android 11 layout), ideas: persist last lines for reboot, 2x2 cover+line variant, Material You.
* **#77** more looks (standing issue).
Older: #53 code signing, #54 Vega as a source, #48 Android karaoke, #47/#46/#45 karaoke practice/export/pitch, #33/#30/#28 Android recording robustness/fps/sound check, #27 real-device test coverage, #26/#25/#20/#19 export/sharing, #23/#22 YouTube start/overlay issues, #21 screen turning off, #6 other Windows players, #3 translations.

## Ideas queue (owner likes these)
* More motion-graphics (zoom-stage) looks: comic variants, spray stencil variants, film strip, 3D camera fly-through of words, beat-reactive scale.
* Sports / games / music / movie looks: cricket scoreboard, racing dash, RPG dialogue box, battle-royale drop screen, DJ booth, radio dial, concert lights, anime opening, western, mission control, jukebox diner, lo-fi bedroom, rainy window (originals only).
* Per-cell designed screens for the mini player and tablet.
* Delete dead code: `shared/fullLayout.ts`, `layout-*` classes, layout shortcuts in `App.tsx` (no effect since 0.20).
* Share dialog: show the look's card by default, keep Classic as an option (partly done).
* Dependabot bumps (Electron 45 major is untested).

## Known gaps to state honestly
Nothing has been exercised on real Windows or Android hardware by the agent; widget Kotlin only compiled; Apple clip lag unmeasured; YouTube iframe latency unmeasured; Windows installer unsigned; Spotify gives no queue on Android.

## How to pick the next task
1. Check the owner's latest message and bug reports first (they test every release).
2. Fix regressions the tests or the owner found.
3. Then the oldest open roadmap issue that does not need hardware.
4. Always finish with docs + CONTEXT.md + a release if the owner asked for one.
