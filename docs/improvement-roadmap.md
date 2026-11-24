# Improvement roadmap

How we work: one item at a time. I write a plan for the item, you read and approve it, I build it, we move to the next.
"Known gaps" are what I already know from the code and earlier work. The first step of every plan is to check them again.

## A. Core services (backend)

| # | Area | Where | Known gaps / ideas |
|---|---|---|---|
| 1 | **Lyrics engine**: find, match, rank, cache, word timing, romanization | `src/core/lyrics`, `src/main/lyrics` | One main source (LRCLIB). Wrong-song matches, per-song offset memory, plain-text fallback quality, more sources, cache size and expiry, Hindi/Punjabi romanization quality |
| 2 | **Playback sources**: Spotify API, Windows media session, Linux MPRIS, demo | `src/main/spotify`, `smtc`, `mpris`, `source.ts` | Token refresh and offline handling, ads detection, position accuracy and drift, other players (YouTube Music, Apple Music, VLC) |
| 3 | **Video and background service**: Apple clip, YouTube, own files | `src/main/background`, `src/core/background` | Android has no clip cache or resume (only the player retry). YouTube picking accuracy, long intro offset per video, failed-video memory, disk cache limits |
| 4 | **Recording and lyric-video export (Studio)** | `src/renderer/src/lib/studio`, `studio.ts` | New "current look" capture never run in real Electron. 30 fps capture cap, software rendering cost, file-source songs still use the simple layout, progress and failure messages, Android recorder issues (#19, #28, #30, #33) |
| 5 | **Karaoke** | `src/core/karaoke`, `KaraokeScreen` | Microphone handling, scoring and pitch, YouTube karaoke video sync, recording a karaoke take, sharing it |
| 6 | **Lyra Connect** (LAN host, phone/TV viewer, OBS overlay) | `src/main/connect`, `src/core/connect` | Never tried on a real TV or phone. Pairing UX, reconnect, firewall help, discovery on tricky networks |
| 7 | **Updates and release pipeline** | `updater.ts`, workflows, Android updater | Unsigned Windows installer (SmartScreen), signing, update channel choice, release automation, rollback |

## B. App screens and features

| # | Area | Where | Known gaps / ideas |
|---|---|---|---|
| 8 | **Settings page** | `SettingsPanel.tsx` | Size and grouping, search, explanations, import/export of settings, reset, per-song versus global clarity |
| 9 | **Looks (34 themes)** | `src/renderer/src/styles` | Many stacked CSS layers (hard to change safely), performance of heavy looks, per-look testing cost, Wallet/Drift Wall class clash seen in the earlier review |
| 10 | **Window modes**: minimal, compact, mini, fullscreen, car mode | `window.ts`, `CarMode`, `CompactWidget`, `MiniPlayer`, `FullscreenPlayer` | Menus differ between modes, multi-monitor, always-on-top edge cases, fade when idle |
| 11 | **Lyrics view and fallback screens** | `LyricsView`, `LyricsStage`, `LyricsFallback`, `LyricsMatchPanel` | Manual lyric fix flow, import (.lrc/.srt), unsynced display, search for the right song |
| 12 | **Share card, saved moments, favorites, queue, devices** | `ShareCard`, `moments.ts`, `favorites.ts`, `DevicesPanel` | Small features that got less attention. Export formats, sync of moments |
| 13 | **Android app**: widget, notification, lock screen, ambient/AOD, overlay, TV, Auto | `android/` | Real-device checks still missing, battery use, OEM background limits, F-Droid build separation |

## C. Platform and quality

| # | Area | Known gaps / ideas |
|---|---|---|
| 14 | **Performance and memory** | Always-running effects, weak-PC mode, hidden-window cost, video and blur layers, startup time |
| 15 | **Tests and CI** | Real Electron end-to-end test (none today), Windows versus Linux differences seen in CI, faster UI suite |
| 16 | **Security and privacy** | Connect protocol review, safe storage of tokens, dependency alerts (GitHub reports some), PRIVACY text kept true |
| 17 | **Accessibility and languages** | Keyboard use, screen readers, contrast in all looks, translations |
| 18 | **Reliability and diagnostics** | Logging, a "copy diagnostics" report, crash handling, clearer error messages (no telemetry) |
| 19 | **Website and docs** | Screenshots of the 34 looks, install guide, Vega section, docs that still mention removed features (old LAN TV mode) |
| 20 | **Lyra Pro (paid plan)** | Plan written in `docs/payments-plan.md`, waiting for your answers on price, what is paid and provider |

## Suggested order

1. Lyrics engine (the core of the product; every wrong or missing line is felt at once)
2. Playback sources
3. Video and background service (finish the Android side of the clip fix)
4. Recording and export (verify the new look capture in the real app first)
5. Settings page
6. Karaoke
7. Lyra Connect
8. Updates and release pipeline
9. The rest in the order you prefer; Lyra Pro whenever you want it started
