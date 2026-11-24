# Karaoke audit (2026-11-24)

Scope: `src/core/karaoke`, `src/renderer/src/lib/karaoke`, `KaraokeScreen.tsx`, `KaraokeStage.tsx`, `karaoke2.css`, `karaoke3.css`.
Note: `docs/improvement-roadmap.md` does not exist in this tree; the karaoke status lives in `docs/karaoke-mode.md` and `docs/roadmap.md`.

## What was already good
- Pure engine in `core/karaoke` (ranking, picking, count-in, smoothed clock) with tests.
- Stage is cheap: React renders per line, word fill is a CSS variable written from one rAF loop.
- Honest score copy in `score.ts` (timing and steadiness, not melody).
- Bad-version memory, YouTube error fallback, lyrics-only mode with the original song, timing nudge, tempo, vocal guide.

## Findings and what was done

| Area | Finding | Action |
|---|---|---|
| Scoring | Instrumental / empty lines (`♪`) were scored as 0 and dragged the total down. | `isScorable`: lines without a letter or digit are skipped. |
| Scoring | Finishing early turned every line not yet reached into a miss. | Only lines already started are scored at "Finish". |
| Scoring | No allowance for reaction + audio latency (voice always looked late). | `REACTION_MS` (150 ms) shift. A constant, not a measured loopback; documented. |
| Scoring | A muted or wrong microphone gave a 0 score that was saved as a "take". | `Summary.silent`: nothing heard, so a warning is shown and the score is not saved. |
| Scoring | Results showed only a total. | Timing %, steadiness %, grade counts, last takes sparkline, "new best" with the old best. |
| Mic | Any failure said "No microphone". | `classifyMicError`: denied / missing / busy / unsupported with an action to take. |
| Mic | Unplugged mid-song: silence scored as misses. | `Mic.onLost`; later lines are not scored, notice shown, "Mic lost" chip. |
| Mic | Calibration while singing (or loud room) put the gate above a voice. | Gate capped at 0.06 rms. |
| Mic | AudioContext could start suspended. | `resume()`. |
| Setup | No way to check the mic before starting. | "Test my microphone" (user started, live meter, auto-stops after 30 s, nothing stored). |
| Privacy | Not visible in the UI. | Line on the setup screen, "Mic on, not recorded" chip while singing, "Forget my karaoke data" button. |
| Storage | Scores: a bare `trackId -> best` map, unbounded; offsets unbounded. | `core/karaoke/records.ts`: per-song record (best, stars, plays, last 8 totals), capped at 200 songs, damaged data sanitised, old map migrated. Offsets capped at 300. |
| Recording | None. | Optional "keep a recording of my voice" (opt-in, in memory, 20 MB cap, opus). Kept only if the user presses Save. Hidden on Android (no file download in the WebView). |
| Sharing | None. | "Copy result" (text). |
| UI | HUD unreadable on light looks; grade colours fixed bright; start button below the fold on phones. | HUD chip, grade colours mixed with the look's foreground, sticky action row, focus rings, larger lyrics on 1500 px+ screens. |

## Decisions and non-goals
- **Recording the backing track with the take / lyric video from a take: not possible** from here. The backing audio comes from a cross-origin YouTube iframe, which cannot be captured without screen/system audio capture, and Studio files are owned by another change. The voice-only take is what can be done honestly.
- **Pitch against the song's melody:** still no (no melody source). The score stays "timing + steadiness" and says so on the results screen.
- **Share card image** with the existing share-card code: not done (the card is a lyric card, a score layout would need its own design). Text copy only.
- **Gamepad:** not implemented; keyboard works (Space, arrows, T, G, F, Esc, Enter).
- **Latency calibration:** a measured loopback needs speakers and a microphone in a quiet room, against the headphone advice. Left as the lyrics-timing nudge, which is stored per song.

## Not verified
No real microphone, Electron or device. Checked in the browser harness with a synthetic tone as the microphone (phone, tablet, desktop; looks journal, crt, neon). Blob download of the voice take, `MediaRecorder` output and Android WebView behaviour are untested.
