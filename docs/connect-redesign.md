# Device connection: what existed, what changed, why

Protocol spec for client authors: `docs/connect-protocol.md`.

## 1. What existed before (mapped from the code)

Three overlapping features, all "show Lyra on another screen":

1. **TV and party mode** (`src/main/lan/server.ts`, `viewerHtml.ts`; settings `lanViewer`, `lanPort`, `lanToken`).
   A Node `http` server bound to `0.0.0.0` (every interface, including VPN / virtual adapters), default port 47813.
   Authentication: one static 12-hex-character secret (`?k=`) stored in settings, passed in the URL query of every
   request. Transport: plain http, Server-Sent Events (`/events`, a state message every 4 s plus on change),
   `/lyrics` and `/art` fetched with the same key in the URL. Viewer page: read-only synced lyrics. One shared key for
   all devices: nobody could be removed except by rotating the key for everyone (there was no UI to rotate it). No
   pairing, no device list, no roles, no remote control, no clock-offset (the page used the host `now` stamp and
   assumed zero skew). The link with the key was shown as text and QR in Settings.
2. **Jam nearby / Stream sound** (`src/renderer/src/store/nearby.ts`, `/rtc/offer` on the same server, setting `lanAudio`).
   The viewer could request WebRTC audio of the PC's whole system sound (loopback capture of everything the PC plays)
   which also needed a display-capture permission handler in `src/main/index.ts`.
3. **Rooms / Jam** (`store/room.ts`, `store/jam.ts`, `website/room.html`). Host a room or join one by code through the
   public PeerJS cloud broker (`0.peerjs.com`) over the internet: browser-to-browser WebRTC, state (song, position,
   lyrics) pushed by the host, a basic ping for skew, guests can see the host's network address. Joiners in the app
   match their own Spotify to the host.

Gaps relative to the goal: open-ish LAN server on all interfaces, secret in URLs and shared by all, no revocation, no
discovery, no per-device identity, nothing shared except lyrics (no video id, vibe or user choices), no remote
control, no real clock sync, no reconnect logic in the page, polling-style state every 4 s.

## 2. Decisions

| Old | New | Why |
| --- | --- | --- |
| TV mode server on `0.0.0.0`, `?k=` shared key | Lyra Connect host, bound to ONE private LAN address, per-device tokens | Open server and shared URL secret were the main exposure. |
| `?k=` in every URL, `/lyrics` `/art` HTTP endpoints | One WebSocket, nothing but the static viewer page is served unauthenticated; code in URL fragment | No secrets in URLs, referrers or logs; no data endpoint to scrape. |
| SSE one-way | WebSocket, versioned JSON, heartbeat, reconnect with backoff | Two-way (control), lower overhead, battery friendly (only changes are sent). |
| Static key | One-time 8-char code (2 min, single use, 5 tries) then a per-device token proven by HMAC challenge | Revocable, short-lived pairing; token never re-sent. |
| No device list | Devices panel: list, online state, Viewer/Controller role, one-click Disconnect | Visibility and control. |
| (nothing) | Party mode: shared viewer-only code, guests expire when party ends | Group screens without handing out control. |
| Wall-clock `now` | NTP-style ping, lowest-rtt filter | Tight sync. |
| Lyrics only | now-playing, shared song clock, lyrics, video id, vibe, per-song choices and lyric offset, cover art | "Share everything" with local playback instead of streaming. |
| **Removed**: WebRTC system-audio streaming (Jam nearby, `lanAudio`, `/rtc/offer`, `nearby.ts`) | each device plays its own video locally | Streaming everything the PC plays is a privacy-heavy, laggy feature that duplicates "play the same song yourself", and it required a standing capture permission. The capture handler now only serves the recording studio. |
| **Removed**: Settings "Nearby screens (TV mode)" section | "Devices" section (`DevicesPanel.tsx`) | One place, one concept. |
| **Kept untouched**: Rooms / Jam over PeerJS | | It is a different job (internet, friends elsewhere) and owned by contributors; it stays. Its confusing overlap with Devices (both say "room"/"guests") is documented as a follow-up: merge it onto this protocol with a relay. |

Settings: `lanViewer`, `lanAudio`, `lanPort`, `lanToken` are replaced by `connectEnabled` (off by default). Old
stored values are simply ignored (and harmless). Paired devices live in `userData/connect-devices.json`.

## 3. Architecture

- `src/core/connect/` (pure, tested): `protocol` (messages, validation), `hmac` (one HMAC-SHA-256 source used by host,
  tests and the browser page), `clockSync` (offset estimation, follow position, seek decision, ping cadence,
  backoff), `pairing` (codes, devices, proofs, command gate, party), `syncState` (what changed, snapshot).
- `src/main/connect/`: `ws` (small RFC 6455 server, no new dependency), `hub` (HTTP + WebSocket, state machine),
  `mdns` (advertise `_lyra-connect._tcp`), `net` (LAN address choice, peer and origin checks), `viewerHtml` (viewer
  client), `service` (glue: playback snapshots, lyrics, user choices, commands, device store).
- Renderer: `store/connect.ts` (status + publisher of vibe, video id, lyric offset to the host process),
  `components/DevicesPanel.tsx` (the Devices UI), one `videoId` field added to `bgState` and set from `Backdrop`.
- Song, position, lyrics and art come from the main process (it owns playback); the vibe in effect, the resolved
  video and the per-song offset are renderer knowledge, so the renderer reports them over `connect:view`.

## 4. Security model and honest limits

Provided: LAN-only bind and peer check; off by default; single-use short-lived code in the URL fragment;
per-device 256-bit token; challenge-response so the token is never re-sent; HMAC-signed commands with replay counter;
roles enforced on every command; rate limits and pre-auth limits; max 12 devices; revocation drops the socket at once;
same-origin check for browsers; strict CSP, `no-store`, `no-referrer` on the page; payload caps (4 KB in, 768 KB out);
no data served before pairing.

NOT provided, plainly:
- **No encryption.** Plain `ws`/`http`: an attacker on the same Wi-Fi can read the now-playing stream, and can read the
  token if they sniff the moment of pairing (they could then act as that device). Pair on a network you trust. The
  code is single use and short, so a sniffed code alone is useless after pairing, but the token travels once.
  Planned fix: self-signed certificate per install with the fingerprint in the QR (`#p=CODE&fp=...`), native
  clients pin it; browsers would warn, which is why it is not done yet, and Node has no built-in cert generator.
- Server-to-client messages are not individually MACed (read-only data); commands are.
- mDNS answers queries for the service name only; no browsing.
- A hostile device that is already paired as controller can control playback until disconnected.

## 5. Limits and what is verified

Unit tested (vitest): protocol parsing and limits, HMAC against node:crypto, clock-offset maths and follow decisions,
backoff, pairing (expiry, single use, brute force, rate limit, party, revoke, persistence, device cap), command gate,
sync-state diffing, WebSocket framing, mDNS packet building and parsing, LAN address and origin rules. The hub is
tested over real loopback sockets: pair, replay state, reconnect by proof, bad code / bad proof, forbidden commands,
signed commands and replays, revoke, party, ping, live broadcast, wrong origin.
The viewer was loaded in a browser against a live hub: pairing from the QR fragment (fragment wiped), credential
stored, lyric highlight following the shared clock, controller controls and vibe accent shown.

NOT verified: the Electron app end to end (Devices panel, IPC, real mDNS on a network, real second device), the YouTube
embed sync on the viewer (needs internet), TV browsers, Android. The viewer's seek control and command signing in the
browser were not exercised against the host; the HMAC used for auth in the browser was (pairing and reconnect would
fail otherwise).

## 6. Android plan (minimal bridge, not implemented here)

`src/android-web/api.ts` gets a stub `connect` API (disabled). Android TV, Auto and other-device apps should be clients
of this protocol: discover with `NsdManager` for `_lyra-connect._tcp`, pair with a typed code or QR, store
`deviceId`/`token` in the Keystore-backed `EncryptedSharedPreferences`, implement sections 3, 5, 6 of the protocol
(OkHttp WebSocket + HMAC from `javax.crypto`). An Android phone running Lyra as the HOST would need the hub ported to
Kotlin (same messages); until then the phone app is a client, or hosts via the existing Rooms feature.
Known follow-ups: TLS pinning, a Lyra-to-Lyra "follow another PC" client inside the desktop app (today another PC
uses the web viewer), migrating Rooms onto this protocol.
