# 13. Glossary and pitfalls

## Glossary
* **Vibe / look**: a complete visual identity (see doc 3). Code says vibe, UI says "look" sometimes.
* **Archetype / arch**: layout family of card + lyrics + controls (`side dock orb bar chat term`).
* **Stage**: the lyric presentation style (`classic kinetic zoom constellation sticker chat type diary subtitle chatlog lowerthird`).
* **Plate**: the designed player-card box (cover + title + controls) of a look.
* **Poster / cover frame**: animated frame and doodles around the album art (`.artwork--lift` + `.artwork__deco--a/b/c`).
* **Cinema mode / `is-cinema`**: fullscreen with a video behind: the card shrinks to a dock. (`is-video` for the terminal.)
* **Calm**: `data-calm` - nothing playing or window hidden: endless animations pause.
* **Moments**: saved lyric lines. **Room / Jam nearby**: LAN page `room.html` that shows lyrics on other devices.
* **Studio**: lyric-video export (WebCodecs) - Windows own-file export and live export; Android screen recording.
* **LRCLIB**: free community lyrics database (first provider).
* **Song identity**: normalised `artist|title` key (`songKey`).
* **Harness**: the mocked browser version of the app used for design and tests.
* **Fork / worker**: a parallel sub-agent in its own worktree.

## Pitfalls (each cost real time)
1. A **stale Vite server** serves old CSS; kill servers before reviewing. Use a unique output path for images or the viewer shows the cached one.
2. **Generic rules beat vibe rules**: `lyrics.css` forces the active word white; `layouts.css` pads `.lyrics__inner` with `cqh` when `is-cinema`; plate rules in `layouts.css` out-specificity skins. Check computed styles in the browser (`getComputedStyle`, or enumerate matching rules) before guessing.
3. `container-type: size` on `.lyrics__scroller` collapses its height when you make it `flex: 0 1 auto`; set `container-type: normal` when you do.
4. Thick poster frames on small covers overlap the title next to them: small covers get thin frames (rule in `states.css`).
5. Light vibes under a **dark video**: ink text becomes unreadable; put text on paper cards or tint the video.
6. `paused=1` in the harness must freeze the position or tests drift into instrumental gaps.
7. 3D transforms on lyric lines made neighbours collide; depth is size + opacity only.
8. Gurmukhi/Devanagari glyphs overflow their box: `.lyric__text { padding-inline-end: .28em }`.
9. Android `RemoteViews` supports only a few view types; test only compiles in CI.
10. `merge_pull_request` returns 405 while checks on the new head are still running; wait, do not retry blindly.
11. Squash merges rewrite history: after merging a PR, merge `origin/main` back with `--ours` conflict resolution before continuing on the branch.
12. The release workflow marks pre-release by **version** dash, not tag.
13. YouTube embeds flash their controls on start and after resume; keep the mask logic.
14. Test text-size floor is 10 px: small caps labels at 9 px fail CI (only in some vibes).
15. CI runners may lack tools (ffmpeg): install in the workflow.
16. Parallel test runs on the same port kill each other: set `UI_PORT`.
17. Never claim success of a release before checking the release page and assets.
18. Do not reuse names/art from games, films or brands.
