# Troubleshooting

First step for almost everything: **Settings -> About -> Copy diagnostics**. It copies a report to your clipboard (versions, graphics card, settings without secrets, recent errors). Nothing is sent anywhere; paste it into a GitHub issue if you need help. **Open log folder** shows the raw log files.

## No lyrics for a song
- Lyrics come from LRCLIB; very new, rare or classical tracks may not be there. Try the lyrics match picker (side panel) to choose another entry, or drop a `.lrc`/`.srt`/`.txt` file on the window.
- "No lyrics" answers are cached for 12 hours. **Settings -> Clear cache** forces a new lookup.
- If many songs fail, check your internet connection and that a firewall or VPN is not blocking `lrclib.net`.

## Wrong lyrics, or out of time
- Open the lyrics match picker and pick another entry; Lyra remembers it for that song.
- Use the timing nudge for that song, or file a "Wrong or missing lyrics" issue.

## Spotify login does not finish
- Lyra opens your browser to approve access; finish it in that browser and come back. If nothing happens, check your default browser is set and no pop-up blocker hides the page.
- "Your Spotify session expired": sign in again from the player screen.
- Controlling playback remotely needs Spotify Premium. Without it Lyra can still show lyrics from the Spotify desktop app (Windows media controls).

## Connect (phone, TV, OBS overlay) does not find Lyra
- Both devices must be on the same network. Guest Wi-Fi and some routers isolate devices ("AP isolation").
- Allow Lyra through Windows Firewall when asked (Private networks). You can re-add it in Windows Security -> Firewall -> Allow an app.
- Check that Connect is on in Settings.

## A video background does not play
- Check your connection; videos stream from Apple or YouTube. A YouTube key is needed for karaoke/video search.
- If one song's video failed, pick another in the video picker. Settings -> Clear cache forgets failed lookups.
- Try turning the animated background off if your PC is slow.

## High CPU or fan noise
- Turn off animated backgrounds and effects, or enable "reduce motion". The full-screen vibes are the most demanding.
- If the diagnostics line says "software rendering: yes", your graphics driver crashed once; update the driver. The fallback lasts until the next Lyra version.

## Lyra shows a message that its window crashed, or starts oddly
- Lyra reloads the window itself (at most three times a minute). Your settings are kept.
- If it crashes twice while starting, it starts in safe mode (no Connect, no update check, software rendering) and returns to normal after one healthy start. You can force it with `Lyra.exe --safe-mode`.
- A damaged settings file is restored from its backup (`settings.json.bak`); the bad file is kept as `settings.json.corrupt`.

## Windows SmartScreen warns about the installer
Lyra is not code-signed yet, so Windows shows "Windows protected your PC". Choose **More info -> Run anyway** if you downloaded it from the official GitHub release page. Compare the file's SHA-256 with the one in the release notes if you want to be sure.
