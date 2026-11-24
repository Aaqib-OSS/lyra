# Lyrics engine audit (roadmap item 1)

Scope: `src/core/lyrics/*`, `src/shared/lrc.ts`, `wordTiming.ts`, `LyricsView/Fallback/MatchPanel`, `store/lyrics.ts`, import in `main/ipc.ts` and `App.tsx`.
Method: read the code. Nothing here was run in the real Electron app.

## What is already solid (checked, left alone)

- Ranking: word-synced > line-synced > plain > instrumental, validated (title/artist/duration, timestamp sanity, too-short, out of order). Unit tested.
- Resilience: per-service circuit breaker, backoff retry, rate-limit wait, in-flight de-duplication per song, 15 s error hold, stale copy served when offline (up to 1 year), "no lyrics" only remembered after a complete answer.
- Manual fix: "Wrong lyrics?" opens a ranked picker with "why" text; the pick is pinned across restarts and players; paste / file / drop import; per-song timing nudge (`store/offsets`).
- Privacy: PRIVACY.md lists LRCLIB and the public-domain file and the cache lifetimes; matches reality.
- Romanization (Hindi/Punjabi) is offline and has the schwa rules.

## Weaknesses, ranked by user impact

1. **Wrong-song risk is invisible.** The footer only says "LRCLIB" with the matched title in a tooltip; the raw id `public-domain` is shown to the user. A user cannot see at a glance that the lyrics belong to a differently named entry. Fix: friendly source names and an inline "Matched X by Y" warning when the match looks off.
2. **Imported files in UTF-16 or a legacy code page show garbage.** `.lrc` files saved by Windows Notepad "Unicode" or by old Hindi/Latin tools are read as UTF-8 only (both the file dialog and the drop handler). Fix: BOM / validity based decoder with a Windows-1252 fallback.
3. **Cache trusts the disk.** A disk entry that parses as JSON but has the wrong shape (hand edit, older build, truncated write that still parses) is returned as a result and can crash the screen; entry size is unbounded (only the entry count is capped). Fix: shape validation, drop corrupt entries, skip oversized writes.
4. **Pins grow forever** (`lyrics-pins.json` has no cap). Fix: cap with oldest-first eviction.
5. Accessibility: the plain-text notice and the offset readout are not announced; fix with `role`/`aria-live`.
6. Not changed, by decision (see report): LRC `[offset:]` sign (the existing test fixes "+ shifts later"; the LRC spec says the opposite and players disagree), a third provider (needs a documented, permitted API and a PRIVACY.md change, owner decision), word timing and romanization quality (reasonable; improving them needs real song samples to judge).
