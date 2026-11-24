# Small features audit (roadmap item 12)

Scope: share card, saved moments, favorites/like, queue, devices panel, SidePanel, Toasts, Welcome, Controls (transport, volume, progress).
Status: DONE = changed in this pass, OPEN = found, not done (owner decision or out of reach without real Spotify/Electron).

## Findings

| Area | Finding | Status |
| --- | --- | --- |
| Moments storage | File read with no validation: a hand-edited or damaged file reached the UI as-is; text and artwork URL had no caps; dedupe was case-sensitive; rules were duplicated in Electron and the Android shell | DONE: `src/shared/moments.ts` (sanitize, normalize, cap 500, text 600, dedupe ignoring case/spacing, artwork URL scheme check), used by both shells, tested |
| JSON stores | A corrupt file was silently replaced by defaults on the next save (data loss, no trace) | DONE: the unreadable file is kept as `<name>.corrupt` before defaults are used. Writes were already atomic (tmp + rename) |
| Favorites | Unbounded growth, no validation on load | DONE: cap 5000 (oldest dropped), field caps, junk entries dropped on load |
| Like button | A failed Spotify like rolled the heart back even after the song had changed, painting the old answer on the next track | DONE: roll back only on the same track. Failure already toasts the API error |
| Moments panel | No search, no export, no undo, no error state, whole list rendered | DONE: search (words, accent/case blind), copy all as Markdown (grouped by song), copy line with song caption, undo for 6 s, load error with retry, list semantics, paging (60 at a time) and `content-visibility` |
| Queue | Null queue always said "isn't available"; no retry; Premium-only limit and the Windows source (no queue) not explained | DONE: three clear messages and a retry. OPEN: reorder/remove, because the Spotify Web API only offers add-to-queue |
| Progress bar | Arrow keys seeked from the stale snapshot position (jumped back); no valuetext; no Home/End/PageUp/PageDown; right-click started a scrub; no way to cancel a drag; no preview | DONE: live position, valuetext "1:05 of 3:40", Shift = 15 s, PgUp/PgDn = 30 s, Home/End, Esc cancels a drag, primary button only, hover time preview |
| Volume | Mute memory lost on restart; no wheel; slider read as a bare number | DONE: level before mute persisted, wheel 5 % per notch, `aria-valuetext` |
| Toasts | Errors announced politely like infos | DONE: error toasts use `role="alert"`; label says "press to dismiss" |
| Welcome | Taught window dragging (not what matters); no focus, no Esc | DONE: three things (play in Spotify, F and V, bookmark/share and `?`), autofocus, Esc, `aria-modal` |
| Shortcuts | No in-app cheat sheet (only buried in Settings) | DONE: press `?` opens a Keyboard shortcuts panel (in-app keys, bar keys, global keys as the user set them) |
| Share card | Story only; two overlapping async draws could paint over each other; no text copy; no Escape; unlabelled canvas | DONE: Story / 4:5 / Square, draws serialised, "Copy text" (quote, title, artist: no link), Esc, canvas label, `aria-pressed` on segments |
| Share privacy | Checked: the image holds only the chosen lines, title, artist, cover and the fixed site line. No account, device, path or position data | OK |
| Devices panel | It is the Connect pairing UI (owned by the Connect work), not Spotify device transfer. No transfer UI exists | OPEN: Spotify "transfer playback" has no UI; needs a design decision |
| Favorites vs Spotify Liked Songs | Spotify source already writes to Liked Songs; local source uses `favorites.json` (local only) | OK; syncing local favourites to Spotify is OPEN (needs scopes and real account to verify) |

## Not done / known
- Square format: with four wrapped rows at the smallest size the doodle marks can overlap a word (the layout was tuned for 1920 high). Story and 4:5 are clean.
- Moments import (JSON) and tags: not built; export covers Markdown and text only.
- Queue drag reorder: not possible with the Spotify API.
- Nothing here was run against real Spotify or a packaged Electron.
