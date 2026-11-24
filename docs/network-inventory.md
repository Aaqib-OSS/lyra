# Network inventory

Every outbound connection Lyra makes, found by reading the code (not by watching traffic). PRIVACY.md is the user-facing
version of this list; keep them in step. Reviewed 2026-11-24 against `main` at 0a2d7fb.

"Where" is the code that opens the connection. Everything in the main process goes through Electron's `net.fetch`
(Chromium network stack, system proxy and certificate store). No request carries a user id, device id or analytics value:
Lyra has none. There is no telemetry, crash reporting or advertising SDK (`grep` for sentry/analytics/gtag found none).

## Windows app

| Host | Where | Sent | Why | When |
|---|---|---|---|---|
| `lrclib.net` | `src/core/lyrics/lrclib.ts` | title, artist, album, duration; `User-Agent: Lyra/<version> (github url)` | synced lyrics | each new song (cached 12 h to 30 days) |
| `raw.githubusercontent.com` (`kennethyork/PubDomainOnly`) | `src/core/lyrics/public-domain.ts` | nothing about the song (a plain GET of one public file, about 0.8 MB, matched on the PC) | last-resort public-domain lyrics | once per session, only when LRCLIB has nothing |
| `musicbrainz.org` | `src/main/meta/musicbrainz.ts` | title, artist, duration; `User-Agent` as above | release year | each new song (cached) |
| `itunes.apple.com` | `src/core/background/itunes.ts` | title, artist | find a 30 s music-video preview | each new song while the background style is "auto" (cached 30 days) |
| `*.itunes.apple.com` (Apple CDN) | `src/main/background/clipStore.ts`, `service.ts` (`lyra-media://preview`) | the clip URL (host-checked with `HOST_RE`) | download the preview clip | when a clip is shown |
| `www.googleapis.com/youtube/v3` | `src/core/background/youtube.ts` | title, artist (+ "karaoke"); **the user's API key as `?key=`** | find a music video / karaoke version | only if the user pasted a YouTube key; cached |
| `i.ytimg.com` | `src/core/background/bars.ts` | the video id | one thumbnail to detect black bars | only with a YouTube key |
| `www.youtube-nocookie.com` | renderer `Backdrop.tsx`, `lib/karaoke/player.ts` (iframe); `src/main/studio.ts` (hidden export window) | video id; the browser sends its normal headers and Google may set cookies | play the chosen video | only with a YouTube key. Main adds `Referer: https://github.com/DhruvHarani1/lyra` (YouTube refuses players without one) |
| `i.ytimg.com`, `www.youtube-nocookie.com` (preconnect only) | `KaraokeScreen.tsx` | nothing (TCP/TLS handshake, so Google sees an IP address) | speed up the karaoke start | **only with a YouTube key** (changed in this review; before, it ran for everyone who opened karaoke) |
| `accounts.spotify.com` | `src/main/spotify/auth.ts` | client id, PKCE challenge/verifier, authorization code, refresh token | Spotify sign-in and token refresh | only with the optional Spotify API source |
| `api.spotify.com/v1` | `src/main/spotify/api.ts`, `source.ts` | `Authorization: Bearer <access token>`; commands (play, pause, seek, volume, like, queue) | read/control playback | only with the Spotify API source (polled while playing) |
| `*.scdn.co`, `*.spotifycdn.com` | `src/main/artwork.ts` (host allow-list, https only) | the artwork URL | cover art | only with the Spotify API source |
| `0.peerjs.com` (https + wss) and a STUN server (`stun.l.google.com:19302`, PeerJS default, UDP) | renderer `store/room.ts`, `store/jam.ts` | WebRTC signalling and IP candidates; then peer-to-peer data (song, lyrics, position) | "Listen together" rooms and Jam | only while a room is open or joined |
| `github.com`, `api.github.com`, `objects.githubusercontent.com` | `src/main/updater.ts` (electron-updater, `provider: github`) | nothing about the user (GitHub sees the IP) | update check and download | at start and periodically; owned by the release pipeline, reviewed only |
| the PC's LAN address, port 47813 | `src/main/connect/*` | what is playing (see PRIVACY.md) | Lyra Connect | only when the user turns Connect on. Not reviewed here (another agent owns it) |
| system browser: `open.spotify.com`, `accounts.spotify.com`, `developer.spotify.com`, `lrclib.net`, `musicbrainz.org`, `github.com/DhruvHarani1` | `window.ts` window-open handler, `ipc.ts` (`playerOpen`), `auth.ts` | nothing (the user clicks a link; opened by the OS, not by Lyra) | links | on click; any other URL is dropped |

The website (`lyra-website-rho.vercel.app`) is only ever **shown as text or a link** (share card, room link). The app
never makes a request to it.

Renderer-side requests are limited by the CSP (`src/shared/csp.ts`): `connect-src 'self' https://0.peerjs.com
wss://0.peerjs.com`, `frame-src https://www.youtube-nocookie.com`, `media-src ... https://*.itunes.apple.com`. All other
traffic is made by the main process.

## Android app (shared UI, own native code)

The same list applies for lyrics (LRCLIB, PublicDomainOnly, MusicBrainz), Apple previews (`WebSetup.previewProxy` allows
`https://*.itunes.apple.com/` only), YouTube (key in the Android Keystore) and rooms/Jam. Additionally:

| Host | Where | Sent | Why |
|---|---|---|---|
| `api.github.com`, `github.com` | `update/UpdateManager.kt`, `ReleaseModel.kt` | nothing about the user | in-app update check (GitHub-release builds only; off in store builds) |

Everything else the WebView loads comes from `https://appassets.androidplatform.net` (the APK's own assets).

## How to keep this true
- A new `fetch`, `net.fetch`, `HttpURLConnection`, iframe, `<img src=https://...>` or `shell.openExternal` is a new row here
  **and** in PRIVACY.md, in the same pull request.
- Quick check: `grep -rnE "https?://|wss?://" src android/app/src --include=*.ts --include=*.tsx --include=*.kt`.
