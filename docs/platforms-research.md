# Where else can Lyra run? Platform research

Written 2026-11-22 against `feat/vibe-redesign`. Scope: besides Windows, Android phone/tablet, Android TV and cars.
"Verified" below means run or screenshotted here; everything else is analysis and is labelled as such.

## How music state reaches a new surface

Lyra's only network-facing mechanism is **Lyra Connect** (`src/main/connect/`, Settings, Devices; `docs/connect-protocol.md`,
`docs/connect-redesign.md`): a LAN-only HTTP + WebSocket host with per-device pairing. It replaced the older LAN viewer (shared
`?k=` key, `/events` SSE, `/lyrics`, `/art`), which no longer exists. Any device with a browser can be a *display*: paired
phones and TVs through the viewer page, and OBS through a view-only `overlay` role. No device can *send* playback state into Lyra.

New surfaces should read a `LyraFeed` (`src/shared/lyraFeed.ts`): `{nowPlaying, positionClock, lyrics, vibe, videoRef}`. It is
filled from Connect messages (`now`, `play` plus the ping/pong clock offset, `lyrics`, `art`, `view`). `videoRef` is part of the
contract but nothing fills it yet (the overlay role is deliberately not told the video id).

## Ranked table

| # | Platform | Audience value | Effort | Blockers | Recommendation |
|---|---|---|---|---|---|
| 1 | **OBS / streamer overlay** (browser source) | High: streamers, lyric-video makers, VTubers, "now playing" panels. Spotify-playing streamers are common and lyric overlays are rare | Low. **Built** | Needs the desktop app running with Devices on; LAN only. Streamers should play music they may broadcast (DMCA) | **Done**, including the Devices panel link ("Add an overlay link", revocable) |
| 2 | **Browser / PWA viewer** (any phone, tablet, laptop, smart-TV browser, Fire TV Silk, Chromecast with Google TV browser, Steam Deck) | High: the one route to Samsung Tizen, LG webOS, Fire TV, Nest Hub, consoles' browsers without writing an app per store | Low. **Polished** | Plain `http://<ip>` is not a "secure context": wake lock and the install prompt need HTTPS or localhost. Apple TV has no browser (use AirPlay from a Mac/iPad browser) | **Done.** For installable/wake-lock on LAN, a future option is a self-signed or tunnelled HTTPS (needs the owner's call) |
| 3 | **Discord Rich Presence** ("Listening to ...") | Medium-high: social reach, free advertising for Lyra | Low (about a day): local Discord IPC, one Discord application id | Owner must create the application id in the Discord developer portal. Presence strings update about every 15 s, so it can show song + "synced lyrics on Lyra", **not** a live lyric line. Privacy: it publishes what you play, must be opt-in, off by default | Next cheap one once the app id exists. Not built: cannot register the id from here |
| 4 | **Linux desktop** (Electron already builds for Linux) | Medium: Linux users like open-source, account-free tools; Spotify's Linux client speaks MPRIS | Medium: reader is done (groundwork), but packaging, source picker, icons, tray differences, `lyra-media.exe` bundling, CI job are not | SMTC is Windows-only. MPRIS via `playerctl` works but was not run on a real Linux desktop. Spotify Web API source already works anywhere | Groundwork **built** (`src/main/mpris/`, tested parser, unwired). Finish when someone can test on Linux |
| 5 | **macOS desktop** | Medium: large music/dev audience, but they mostly use Spotify's own lyrics | High | No public now-playing API: MediaRemote is private and was restricted for third-party use in recent macOS releases. Needs a signed + notarised native helper, an Apple developer account, a Mac to build and test | Not now. Web API source + the browser viewer already cover macOS users with a browser |
| 6 | **Google Cast / Chromecast receiver** | Medium: nice living-room story | High | A custom receiver needs a registered Cast app id (one-off developer fee), a **publicly hosted HTTPS** receiver page, and a Cast *sender* in the app (the Cast sender SDK is Chrome/Android/iOS, not Electron). Meanwhile users can already do "Cast tab" from Chrome on the viewer URL for free | Skip the custom receiver. Document "Cast this tab" |
| 7 | **Fire TV / Fire tablets** | Medium: cheap TVs, big in some markets | Low-medium | Fire OS is Android-based, so the existing Android TV build should sideload; unverified here. Store listing needs the Amazon Appstore and a check for Google Play services dependencies. Until then Silk browser can open the viewer | Test the Android TV APK on a Fire stick, then decide on a listing. Viewer works today |
| 8 | **Wear OS watch** (lyric line + play controls tile) | Medium-low: glanceable lyrics on a wrist are novel but tiny; Wear OS already mirrors phone media controls | High: a new Gradle module (Tiles + Data Layer to the phone), Wear store listing, round-screen design | `android/` was out of scope for this task; phone-to-watch link; battery limits on updating a lyric line every few seconds | Later, after Android 1.0. Prototype as a Tile showing the current line from the phone's lyric notification |
| 9 | **Smart displays** (Nest Hub, Echo Show) | Low-medium | Low | Nest Hub has no general-purpose browser (not verified in detail); Echo Show has Silk. Same page as #2 | Covered by the viewer on Echo Show; nothing to build for Nest Hub |
| 10 | **Desktop always-on-top lyrics overlay** | Medium: gamers, people working | Low-medium | The window is already frameless, transparent and always-on-top (`window.ts`, mini/widget modes). What is missing is a click-through lyrics-only mode (`setIgnoreMouseEvents`) | The OBS overlay URL can be loaded in a click-through window later with almost no new code |
| 11 | **E-ink / other** (Kindle, e-readers, Raspberry Pi frames) | Low: niche | Low | Slow refresh makes live lyrics unusable; a "current line" refresh every few seconds is the most it can do | A Raspberry Pi with a screen and a kiosk browser on the viewer URL already works. No work |

## What was built

### 1. OBS / stream overlay: `/overlay`

`src/main/connect/overlayPage.ts` (page, CSS, runtime), served by the Connect host (`hub.ts`) at `/overlay`, with its own tight CSP.
It authenticates as a view-only `overlay` device (docs/connect-redesign.md section 3b): the link carries the credential in the URL
**fragment**, the page runs the normal Connect `hello`/`auth` handshake, and removing the device in Devices kills the link.
Fully transparent by default (OBS Browser Source composites it). Ten text "looks"; every app vibe maps to the nearest one:

| Look | Vibes |
|---|---|
| classic | Artwork, Sunset Drive, Lens, Dream, Drift Wall, Web, Route, Metro, Picto, Flap |
| neon | Neon |
| chrome | Chrome |
| terminal | Terminal, Editor, Blocks |
| subtitle | Cinema, Film Reel, Film Strip, Trailer, Stadium |
| chat | DM, Lock Screen, Wallet |
| sticker | Stickers, Pop Comic, Stencil |
| hand | Diary, Sketchbook, Cassette |
| pixel | Arcade |
| glitch | Glitch |

Honest limit: this is **not** the app's scene renderer. The scenes' backgrounds, props and 3D motion live in the React
bundle and would not fit a small, dependency-free, transparent page. The overlay carries the *type treatment* of each vibe
(colour, font feel, line shape), not its set. If a streamer wants the full scene, they can capture the Lyra window.

Setup in OBS: turn Devices on in Lyra, Settings, Devices, press **Add an overlay link**, then **Copy link** on the new row.
In OBS: Sources, add Browser, paste the URL (it looks like `http://192.168.1.20:47813/overlay#d=...&t=...`). Add options before
the `#` (`...:47813/overlay?vibe=neon&lines=2#d=...`) or after the credentials (`#d=...&t=...&vibe=neon`). Set the width and height to your canvas (type scales with height,
so a 1920x1080 source and a 1280x720 source look the same). Tick nothing else; leave "custom CSS" empty.

URL parameters (all optional):

| Parameter | Values | Default |
|---|---|---|
| `vibe` | any vibe id (`neon`, `crt`, `noir`, ...) or `app` to follow the app's current vibe | `app` |
| `look` | `classic neon chrome terminal subtitle chat sticker hand pixel glitch` (wins over `vibe`) | from vibe |
| `lines` | 1 to 9 visible lines (1 = one line at a time) | 3 |
| `mode` | `single` or `stack` | by `lines` |
| `size` | base type size in px at 1080 px tall, 12 to 400 | 64 |
| `scale` | multiplier 0.25 to 4 | 1 |
| `font` | a font installed on the streaming PC (letters, digits, spaces, commas) | the look's own |
| `align` / `pos` | `left center right` / `top middle bottom` | `center` / `bottom` |
| `chroma` (or `bg`) | background colour for chroma key: `00ff00`, `ff00ff`, `magenta`; `transparent` | transparent |
| `color`, `accent` | text and accent colour | the look's own |
| `shadow`, `words` | `0`/`1`: text shadow, word-by-word highlight | on |
| `meta`, `art`, `progress` | `1` shows a now-playing chip, the cover in it, a progress bar | off |
| `nudge` | lyric timing shift in ms, -5000 to 5000 (positive = lyrics later) | 0 |
| `idle` | `1` shows a hint when nothing is playing | off (stays invisible) |
| `debug` | `1` shows a connection indicator | off |

Colours and fonts are sanitised so a shared URL cannot inject CSS. The link is a secret: anyone with it on your LAN can see what
you play (read-only) until you press **Remove link**. A wrong, missing or removed credential shows nothing (with `debug=1` the page
says why).

### 2. Browser / PWA viewer polish (`src/main/connect/viewerHtml.ts`, `pwa.ts`)

* Web app manifest (`/manifest.webmanifest`, static, `start_url: /`, no secret), `/icon.png` from the app icon, apple-touch / mobile-web-app meta. The pairing credential lives in the browser's own storage, so an installed copy that has separate storage (iOS home-screen apps) pairs again once.
* Full-screen: a button, the `F` key and double-click/tap.
* Screen wake lock, re-requested when the tab becomes visible again (the browser drops it on hide).
* Pointer and buttons hide after 4 s of no input.
* TV layout: auto-detected from the user agent (Tizen, webOS, Fire TV `AFT*`, Android TV Chromecast `CrKey`, Bravia, Roku, Vidaa, and so on), forced with `?tv=1`, disabled with `?tv=0`: bigger type, bigger cover, small controls hidden. `?scale=0.5..3` zooms the layout.
* The viewer's CSP gained only `manifest-src 'self'` and `'self'` for images; pairing (QR fragment, code screen, reconnect by proof) is unchanged.

Limitations to know: wake lock and the install prompt need a secure context, which plain `http://192.168.x.x` is not (the page asks anyway and ignores a refusal);
on a real TV browser the TV layout detection is by user-agent string and has only been tested with a faked Tizen string.

### 3. Linux MPRIS groundwork (`src/main/mpris/`)

* `parse.ts`: pure parser for `playerctl --follow metadata --format ...` lines and transport-command mapping. Unit-tested.
* `source.ts`: `MprisSource` (a `PlaybackSource`, kind `mpris`) running `playerctl`. **Not wired in anywhere**, never run on Linux.
* Still needed for a Linux release: source selection on `process.platform`, Settings copy, an `electron-builder` Linux target
  (AppImage/deb), a Linux CI job, a `playerctl` install note, `file://` cover art, and a test on a real desktop (GNOME and KDE).
* macOS: not started. See row 5.

## Verified

* `npx vitest run` (whole suite): 355 tests pass. The overlay work adds to `src/main/connect/overlayPage.test.ts` (options incl. fragment
  options, credentials parsing, feed from Connect messages, clock offset, the page and manifest) and the "overlay role" block in
  `hub.test.ts` (link shape, `/overlay` CSP, proof auth, redaction, view-only enforcement with a valid signature, no upgrade or
  minting through codes, hidden from controllers, revocation of a live and a stale link, wrong token, device cap, a loopback test
  driving the overlay feed and clock from a live host over a real socket).
* `npm run typecheck`: clean.
* `node --experimental-transform-types scripts/ui-test/overlay-check.mjs` (Playwright + Chromium against the REAL Connect hub on
  loopback, not Electron): all checks pass. Contact sheet of the ten looks, transparent background, `chroma=00ff00` green,
  `size=120` gives 120 px at 1080p, `lines=1`, `meta`/`art` (cover arrives over the socket), options in the fragment, the line
  advances with the clock and freezes on pause, a vibe change in the app re-styles the overlay live, a wrong / missing / revoked
  credential is refused, revoking a live overlay is noticed, no CSP violation, the viewer in desktop, phone and TV modes with
  its manifest, icon, idle hide, code wiped from the address bar, reconnect by stored credential. Output: `ui-test-out/overlay/`.

## Not verified

* The Electron app (Devices panel buttons, IPC, copying the link, the app icon route) was not launched. The hub, pages and
  options ran through the real hub class with an in-memory registry.
* Not tested inside OBS itself (its CEF browser), on a real TV or Fire TV, or over HTTPS (wake lock, install prompt, full screen).
* `MprisSource` was never run against a real player.
