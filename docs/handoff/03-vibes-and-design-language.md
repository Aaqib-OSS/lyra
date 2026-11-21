# 3. Vibes (looks) and the design language

A **vibe** is a complete look. It changes: lyric typography and the way each word arrives (the *lyric stage*), the background and animated effects (VibeFx), the layout archetype of card/lyrics/controls, the player card plate, the cover (poster) frame, the video treatment, the unsynced / no-lyrics / video screens, the Settings panel skin, the share card, the Android widget palette, and the smart-picker keywords. The owner's rule: **the look is designed, not configured** (no user layout/typeface/size/animation settings; saved values are ignored by `lockLook`).

## The 20 looks (id, name, layout archetype, lyric stage)
| id | name | layout | stage | idea |
|---|---|---|---|---|
| none | Artwork | side | classic | colours from the cover, glass |
| neon | Neon | dock | kinetic | synthwave tubes, sun and grid |
| chrome | Chrome | dock | kinetic | Y2K liquid metal (light plate, ink text) |
| dream | Dream | orb | constellation | pastel star map, twinkles |
| crt | Terminal | term | type | green phosphor, panes, `cat`-style |
| sticker | Stickers | side | sticker | die-cut pop, yellow ground |
| chat | DM | chat | chat | the song texts you (bubbles) |
| paper | Diary | side | diary | handwriting on ruled paper, taped polaroid |
| arcade | Arcade | dock | kinetic | 8-bit scoreboard, Press Start 2P |
| noir | Cinema | bar | subtitle | black-and-white, subtitles, letterbox |
| sunset | Sunset Drive | dock | kinetic | palms, radio, pink sky |
| blocks | Blocks | side | chatlog | sandbox with a chat log (Minecraft-inspired, original) |
| stadium | Stadium | dock | lowerthird | broadcast scoreboard |
| cassette | Cassette | side | type | Walkman, amber LCD, paper insert |
| trailer | Trailer | bar | kinetic | movie title cards, gold hairlines |
| sketch | Sketchbook | orb | zoom | giant red cut-out words on graphite paper (owner's reference video) |
| glitch | Glitch | orb | zoom | RGB-split words on a dying tape |
| comic | Pop Comic | orb | zoom | halftone, outlines, BAM words |
| stencil | Stencil | orb | zoom | spray-paint stencil on concrete |
| film | Film Reel | orb | zoom | sepia grain, light leaks, projector flicker |

Source of truth: `src/shared/vibes.ts` (`VIBES`, `ALL_VIBES`, `vibeInfo`, `stepVibe`, `pickVibe` smart scorer with per-vibe keyword regexes `WORDS`). Type union `Vibe` in `src/shared/types.ts`; `LyricStyle` there too.

## Vibe modes (how a vibe is chosen)
`vibeMode`: `fixed` (the chosen vibe), `cycle` (rotate through a pool, `V` key = next vibe), `smart` (`pickVibe` from words, pace, year, cover colour; deterministic per song). Per-song choices are remembered (`songVibes`). `hooks/useVibe.ts`: `useEffectiveVibe`, `cycleVibe`, `useVibeConductor`.

## Lyric stages (`components/LyricsStage.tsx`, `LyricsView.tsx`)
classic list (default), kinetic (words stack as big type), constellation (star map), sticker, chat, type (typewriter), diary, subtitle, chatlog, lowerthird, and **zoom** (one giant word at a time thrown at the camera: scale 2.7 -> 1 with blur and tilt, whole line small underneath; looks: fill / outline / cut / ghost, chosen deterministically per word). Stages use container query units (`cqw/cqh`) inside `.stage` (`container-type: size`).

## Everything a look touches (checklist when adding a vibe)
1. `src/shared/types.ts` Vibe union; `src/shared/vibes.ts` entry + `WORDS` regex (+ `vibes.test.ts` if counts are asserted).
2. `components/VibeFx.tsx` effect layers; CSS for them in `styles/vibes.css`.
3. `styles/vibes.css`: `:root[data-vibe='x'] { --rimc }`, `[data-vibe='x'] .shell { --accent --glow --font --fg ... }` (light vibes set `--fg` dark + `--on-fg`, `--word-dim`, and need the word/contrast overrides at the bottom of the file), lyric stage looks (e.g. `.kin__word`, `.zoom__word--*`).
4. `styles/states.css`: unsynced (`.lyrics__notice`, `.plain__stanza`), no lyrics/waiting (`.lfb*`), video-playing tweaks (`[data-bg-media]` dim/filters). Minimum text size 10 px.
5. `styles/skins.css`: Settings panel (`.sidepanel`) and the dock/pill/bar player card plate; `styles/cards.css`: mini player / phone dock / side layout plates (**generated** by `scripts/gen-cards.py`; edit the table and re-run).
6. `styles/posters.css`: animated cover frame using the three `.artwork__deco` layers (`Artwork.tsx`); small covers must keep thin frames (`states.css` rule).
7. `lib/shareCard.ts`: `THEMES[id]` (paper, pens, type, pattern) -> `cardTheme()`.
8. `styles/redesign.css`: `.vibecard--x .vibecard__sw` gallery swatch.
9. Android widget palette: `WidgetPalettes.of` in `android/.../LyraWidget.kt`.
10. Website: `website/vibes-data.js` entry + regenerate screenshots (`scripts/make-site-shots.mjs --only=<id>`), release notes.
11. Tests: nothing to register, `scripts/ui-test/run.mjs` reads `vibes.ts`; add the zoom-stage selectors if you invent a new stage (`stageSel`/`nowSel`).

## Design principles (apply to every look)
* **Distinct, not themed**: change type, motion, shape language and materials, not just colour. Each look has a signature gesture (neon flicker, pencil jitter, typewriter cursor, tape reels...).
* **Doodle/hand-drawn language where it fits** (Stickers, Diary, Sketchbook, Pop Comic, share cards): wobbly lines, hard offset shadows, tilted labels, marker highlights. The doodle share card is the reference: underline, circle, strike-through with a scribbled replacement, burst, little face.
* **Hard shadows and thick outlines** for poster looks; **glow and bloom** for light-emitting looks; **grain** for film/tape.
* Readability beats style: dark halo behind bright type on bright backdrops, paper cards behind ink text when a video is dark, `paint-order: stroke fill` for outlined type, tight glow not wide bloom on neon.
* Unsynced = **static** (no flicker, no highlight, no auto-scroll). No-lyrics = a designed message in the look's own voice (`ERR>` in the terminal, a LCD on the cassette, a title card in cinema).
* Videos are part of the look (cinema = black and white, trailer = graded, cassette = sepia, noir panes translucent in the terminal).
* Stop endless animation when `data-calm` is set (song paused / window hidden) and under reduced motion.
* Original art, no trademarks. Inspiration is allowed, copies are not.
* Fonts available: Inter, Nunito, Unbounded (display), Fraunces (italic), VT323, Caveat, Press Start 2P (all via `@fontsource`, imported in `renderer/src/main.tsx`).

## Light inked vibes (special care)
sticker, paper, cassette, sketch, comic (and chrome plate): dark ink on light ground. The generic rule forces the active word white in dark themes (`lyrics.css`) so each of these needs overrides (see the bottom of `vibes.css`). With a dark video behind, text must sit on paper cards (see `states.css` DIARY/SKETCHBOOK/POP COMIC blocks).
