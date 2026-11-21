# Where else can Lyra run? Platform research

Written 2026-11-22 against `feat/vibe-redesign`. Scope: besides Windows, Android phone/tablet, Android TV and cars.
"Verified" below means run or screenshotted here; everything else is analysis and is labelled as such.

## How music state reaches a new surface

Lyra's only network-facing mechanism today is the **LAN viewer** (`src/main/lan/server.ts`, Settings, TV & party mode): a small
read-only HTTP server with a secret key `?k=`, offering `/events` (SSE: track, position clock, playing, and now the app's vibe),
`/lyrics` (line-synced), `/art`, and an opt-in WebRTC audio route. Any device with a browser can be a *display*. No device can
*send* playback state into Lyra; the connection protocol being written elsewhere may add that.

New surfaces should therefore read a `LyraFeed` (`src/shared/lyraFeed.ts`): `{nowPlaying, positionClock, lyrics, vibe, videoRef}`.
Today it is filled from the LAN viewer endpoints; when the connection protocol lands, only the filler changes.
`videoRef` is part of the contract but nothing fills it yet.

## Ranked table

| # | Platform | Audience value | Effort | Blockers | Recommendation |
|---|---|---|---|---|---|
| 1 | **OBS / streamer overlay** (browser source) | High: streamers, lyric-video makers, VTubers, "now playing" panels. Spotify-playing streamers are common and lyric overlays are rare | Low. **Built** | Needs the desktop app running with TV & party mode on; LAN/localhost only. Streamers should play music they may broadcast (DMCA) | **Done.** Add a settings link/QR for the overlay URL (not done: Settings UI untouched) |
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

`src/main/lan/overlayPage.ts` (page, CSS, runtime), served by `server.ts` at `/overlay`, same secret key as the viewer.
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

Setup in OBS: Sources, add Browser, URL = the viewer link with `/overlay` before the `?`, e.g.
`http://192.168.1.20:47813/overlay?k=KEY&vibe=neon`. Set the width and height to your canvas (type scales with height,
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

Colours and fonts are sanitised so a shared URL cannot inject CSS.

### 2. Browser / PWA viewer polish (`src/main/lan/viewerHtml.ts`, `pwa.ts`)

* Web app manifest (`/manifest.webmanifest`, keeps the key in `start_url`), icon route, apple-touch / mobile-web-app meta.
* Full-screen: a button, the `F` key and double-click/tap.
* Screen wake lock, re-requested when the tab becomes visible again (the browser drops it on hide).
* Pointer and buttons hide after 4 s of no input.
* TV layout: auto-detected from the user agent (Tizen, webOS, Fire TV `AFT*`, Android TV Chromecast `CrKey`, Bravia, Roku, Vidaa, and so on), forced with `?tv=1`, disabled with `?tv=0`: bigger type, bigger cover, small controls hidden. `?scale=0.5..3` zooms the layout.
* The app's vibe is now included in `/events` so overlays can follow it.

Limitations to know: wake lock and the install prompt need a secure context, which plain `http://192.168.x.x` is not;
on a real TV browser the TV layout detection is by user-agent string and has only been tested with a faked Tizen string.

### 3. Linux MPRIS groundwork (`src/main/mpris/`)

* `parse.ts`: pure parser for `playerctl --follow metadata --format ...` lines and transport-command mapping. Unit-tested.
* `source.ts`: `MprisSource` (a `PlaybackSource`, kind `mpris`) running `playerctl`. **Not wired in anywhere**, never run on Linux.
* Still needed for a Linux release: source selection on `process.platform`, Settings copy, an `electron-builder` Linux target
  (AppImage/deb), a Linux CI job, a `playerctl` install note, `file://` cover art, and a test on a real desktop (GNOME and KDE).
* macOS: not started. See row 5.

## Verified

* `npx vitest run src/main`: 22 tests pass (16 for the overlay/manifest/feed logic, 6 for the MPRIS parser). Full suite not run, as asked.
* `npm run typecheck`: clean.
* `node scripts/ui-test/overlay-check.mjs` (Playwright + Chromium, mock of the LAN server, not the real Electron server): all
  checks pass. It screenshots a contact sheet of the ten looks over a photo-like gradient, confirms the page background is
  transparent, `chroma=00ff00` gives pure green, `size=120` gives 120 px type at 1080p, `lines=1` shows one line, the active
  line advances with the clock, the viewer renders in desktop, phone and faked-Tizen modes, and the manifest is served.
  Output lands in `ui-test-out/overlay/`.

## Not verified

* The routes were exercised through a mock server that runs the same page strings, not through the Electron `LanViewer`
  (the app was not launched). The only server changes are small: three new routes and the `vibe` field.
* Not tested inside OBS itself, on a real TV or on Fire TV, or over HTTPS (wake lock, install prompt).
* `MprisSource` was never run against a real player.
* No Settings UI for the overlay link yet.
