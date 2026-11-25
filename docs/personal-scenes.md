# Personal scenes (this PC only)

A personal scene gives ONE song its own screen and video on your own computer. It is not part of Lyra's look list, it is not
shared, and Lyra contains no song, person or video: everything lives in a folder you make.

## How it works
- When a song starts, Lyra compares its title and artist with the scenes found in `%USERPROFILE%\LyraPersonal\<name>\`
  (or the folder in the `LYRA_PERSONAL_DIR` environment variable).
- On a match, the fullscreen and the small player show the scene instead of the normal screen: a paper page, your video in a polaroid,
  Lyra's own synced lyrics with a highlighter that follows the singing, and a player card.
- No folder, no match, or a broken config: nothing changes, Lyra looks and works as it always did. Compact and minimal widgets are never
  replaced. Android is not affected.

## The folder
```
LyraPersonal\<name>\config.json      which song, how the video lines up
LyraPersonal\<name>\<your video>     .mp4 or .webm
LyraPersonal\<name>\<cover picture>  optional: .jpg, .png or .webp
```

`config.json`:
```json
{
  "match": { "title": "Song title", "artist": "Artist" },
  "video": "media/video.mp4",
  "art": "media/cover.jpg",
  "videoDurationSec": 60.6,
  "loopFrom": 2.0,
  "loopTo": 60.0,
  "videoNudgeSec": 0,
  "lyricNudgeSec": 0,
  "videoAnchors": [[58.1, 0.0], [60.1, 2.0], [118.2, 60.0]]
}
```
- `videoAnchors` are `[song second, video second]` pairs: the second of the video that shows each moment of the song. Between two
  anchors the video runs faster or slower to stay with the song. Before the first and after the last anchor the part of the video
  from `loopFrom` to `loopTo` loops.
- `videoNudgeSec` / `lyricNudgeSec` move the video or the lyrics a little earlier (negative) or later (positive).
- File names must stay inside the scene folder. Anything else is ignored.

## Notes
- The video is served to the app only through `lyra-media://personal/<name>/video` and `/art`; the page never gets a file path.
- Because the folder is outside Lyra, updating or reinstalling Lyra never touches it, and it is never uploaded anywhere.
- Code: `src/main/personal.ts` (finds the scenes, serves their files with Range support), `src/renderer/src/hooks/usePersonalScene.ts`
  (matches the playing song), `src/renderer/src/components/PersonalSceneView.tsx` and `styles/personal-scene.css` (the screen),
  `src/renderer/src/lib/personalScene.ts` (video timing, tested).
