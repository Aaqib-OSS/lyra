# Personal scenes (this PC only)

A personal scene is a web page of your own that Lyra shows instead of its own screen while ONE song plays. It lives in a folder on
your computer, so you can change the look at any time (edit the files, play the song again) without waiting for a new Lyra. Lyra
itself contains no song, person, picture or video: with no folder, nothing changes.

## How it works
- When a song starts, Lyra compares its title and artist with the scenes in `%USERPROFILE%\LyraPersonal\<name>\`
  (or under the folder in the `LYRA_PERSONAL_DIR` environment variable).
- On a match, the fullscreen and the small player show the scene's page. The compact and minimal widgets are never replaced.
  Android is not affected.
- The page runs in a **sandboxed frame**: it cannot reach Lyra, your settings, your Spotify account, or the network (its own policy
  allows only files from its own folder). It receives the song, where the song is and the lyrics by message, and can ask Lyra for a
  few things back. Nothing you put in the folder is uploaded.

## The folder
```
LyraPersonal\<name>\config.json     {"match": {"title": "Song title", "artist": "Artist"}, "page": "web/index.html"}
LyraPersonal\<name>\...             the page and everything it uses: .html .css .js .json .svg .png .jpg .webp .gif .woff2 .woff .ttf .otf .mp4 .webm
```
`page` is optional (default `web/index.html`). Any other keys in `config.json` are yours: the page can read the file
(`fetch('../config.json')` from a page in `web/`). Only files inside the scene folder, of those types, are served.

## The messages
All messages are plain objects sent with `postMessage`. Your page only needs `bridge.js` from the example scene, but this is the whole
contract.

Lyra to the page:
| `type` | fields | when |
| --- | --- | --- |
| `lyra:state` | `track` (`id`, `title`, `artists[]`, `album`, `durationMs`, `artworkUrl`) or null, `playing`, `positionMs`, `at` | on every player update and every 2 s. Where the song is now = `positionMs` + (`Date.now()` - `at`) while it plays. |
| `lyra:lyrics` | `status` (`synced`, `plain`, `loading`, `none`, ...), `lines[]` (`timeMs`, `text`), `offsetMs` | when the lyrics or the song's lyric offset change. Lyric time = song time + `offsetMs`. |
| `lyra:mode` | `mode`: `full` or `mini` | when the window changes between fullscreen and the small player |

The page to Lyra:
| `type` | fields | effect |
| --- | --- | --- |
| `lyra:ready` | | send once the page has loaded: Lyra answers with the three messages above |
| `lyra:cmd` | `cmd`: `toggle`, `next`, `prev`, or `seek` with `ms` | the player controls |
| `lyra:window` | `action`: `settings`, `fullscreen` (toggles), `minimize`, `collapse`, `quit` | window buttons (the small player has no title bar, so the page draws them; its top 30 px move the window) |
| `lyra:key` | `key`, `shiftKey` | a key press handed to Lyra's shortcuts (F, Esc, space, arrows, V, D, [ ], M, ?) |

Only messages from the scene's own frame are accepted. The video is a normal `<video>` with a relative URL into the folder; Range
requests work, so it can be seeked and looped.

## Code
`src/main/personal.ts` (finds the scenes, serves their files with the page policy and Range support),
`src/renderer/src/hooks/usePersonalScene.ts` + `lib/personalScene.ts` (matches the playing song),
`src/renderer/src/components/PersonalSceneView.tsx` (the frame and the bridge), `styles/personal-scene.css`.
