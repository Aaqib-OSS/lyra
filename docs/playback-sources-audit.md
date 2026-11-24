# Playback sources audit

Scope: Spotify Web API source, Windows media session (SMTC) bridge, Linux MPRIS, demo source, the song clock, source
switching. Ranked by user impact. "Fixed" means fixed on this branch; the rest is left for the owner.

## Weak points

1. **A network blip during token refresh signs the user out (fixed).** `SpotifyAuth.tokenRequest` throws
   `AuthError('network')` when accounts.spotify.com is unreachable (typical right after wake from sleep, before Wi-Fi is
   back). `SpotifySource.handlePollError` treated every `AuthError` as "session expired", stopped polling and showed the
   sign-in screen. Only `revoked` / `invalid-client` are real sign-out cases; `network` and transient `unknown` must back
   off and retry. The same mistake was in `mapCommandError` (a failed volume tweak said "session expired").
2. **No reaction to wake from sleep (fixed).** The poll timer is a plain `setTimeout`; after resume the app waited out
   the old (up to 15 s) delay, and the first request raced the network coming back. Now `powerMonitor` resume/unlock
   triggers an immediate poll (Spotify) or a bridge restart (SMTC).
3. **Offline screen lies for the Windows source (fixed).** `OfflineScreen` / widget status always said "Can't reach
   Spotify" with a "Sign out and reconnect" button, even when the failing thing was the local media helper. The status now
   carries which source it belongs to and the copy and action follow it.
4. **Retry-After is trusted blindly (fixed).** A 429 with a huge `Retry-After` froze the UI for that long with no cap and
   the countdown showed the raw number. Now capped (5 min) and the countdown is honest. Backoff gets jitter so several
   Lyra instances do not hammer in step.
5. **Idle polling never relaxes.** With nothing playing, Spotify was polled every 5 s (15 s hidden) forever. Now it backs
   off progressively the longer the player stays idle (up to 30 s visible / 60 s hidden) and snaps back on any change,
   on window show, on a command and on wake (fixed, `pollPolicy.ts`).
6. **Token file is written non-atomically and loaded unvalidated (fixed).** A crash mid-write leaves a truncated blob;
   a decrypted-but-malformed record would crash later in `getAccessToken`. Now written to a temp file and renamed, and
   the parsed record is shape-checked (`parseTokenRecord`).
7. **Position re-anchor logic is duplicated** in the Spotify and SMTC sources with the same magic 400 ms. Extracted to
   `src/core/snapshotDelta.ts` with tests (fixed).
8. **Windows source only follows the Spotify app** (`--app Spotify` in `native/lyra-media`). YouTube Music, Apple Music,
   VLC, browsers are invisible. The helper already accepts `--app <substring>`; supporting "any player" needs a rebuild
   of the committed binary `resources/lyra-media.exe`, which I could not do and verify here. Not changed; decision for
   the owner. Title/artist cleaning for lyric search (strip "- Topic", "(Official Video)", "[Lyrics]") should then be
   added in the lyrics query layer, which another area owns.
9. **Spotify scopes.** `user-read-recently-played` and `user-library-*` are used (recent list, likes), so all are needed;
   nothing extra is requested. No change.
10. **Position accuracy.** Spotify progress is already latency-compensated (midpoint of request). SMTC adds the age of
   the timeline update. Remaining error is Spotify's own progress staleness (a few hundred ms); not fixable client side.
11. **Local files / podcasts.** Local files have `id: null` and fall back to the uri (handled: likes skipped). Episodes map
   show name as artist (handled). Ads: `currently_playing_type === 'ad'` freezes the clock (handled).

## Not verified here

No real Electron, Spotify or Windows media session is available in this environment: behaviour is covered by unit tests
of the pure logic (poll policy, error classification, delta, token record) and typecheck, not by live runs.
