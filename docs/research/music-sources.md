# Music data and audio sources for Lyra

Research date: 2026-11-22. Scope: free, legal sources of music metadata, cover art, previews, open-licensed full tracks, radio and audio features. No code was changed and no API keys appear here.

Verification legend: **[V]** read on the provider's official page during this research. **[S]** only seen in secondary sources (search summaries, GitHub issues). **[U]** from prior knowledge, not re-checked.

## 1. What Lyra already uses (do not re-recommend)

| Existing | Where | Purpose |
|---|---|---|
| LRCLIB | `src/core/lyrics/lrclib.ts` | Synced and plain lyrics, keyless |
| iTunes Search API | `src/core/background/itunes.ts` | Artwork and the ~30 s Apple preview clip (used as a video background, `kind: preview`) |
| MusicBrainz | `src/main/meta/musicbrainz.ts` | Release year lookup only (descriptive User-Agent) |
| YouTube Data API v3 | `src/core/background/youtube.ts` | Official video, user supplies own key |
| Spotify Web API + SMTC | `src/main/spotify/*`, `src/main/smtc/*` | Now-playing source and control, not catalog data |
| Android media session | `src/android-web`, `android/` | Now-playing source |

Gaps: no BPM/key/energy anywhere (`bars.ts` is letterbox detection, not music analysis); MusicBrainz is used for one field only; no Cover Art Archive; no fallback if iTunes has no artwork; no ISRC or MBID identity; no open-licensed audio.

## 2. Ranked recommendation table

Score is fit for Lyra (free, keyless or trivial key, legal for an MIT desktop/Android app, real value).

| Rank | Source | Gives | Auth | Limit | Fit |
|---|---|---|---|---|---|
| 1 | **MusicBrainz + Cover Art Archive** (extend existing) | Canonical IDs (MBID, ISRC), artist, album, year, genres/tags, label; hi-res front cover | None, User-Agent with contact | MB: 1 req/s per IP [V]; CAA: no published number, 503 if exceeded [V] | Best |
| 2 | **Deezer public API** | Search, 30 s MP3 preview, artwork up to ~1000 px, BPM and genre on track/album objects, artist images | None for search/read | ~50 req/5 s per IP, error code 4 returned with HTTP 200 [S] | Very good fallback for artwork and previews |
| 3 | **ReccoBeats audio features** | Spotify-style energy, valence, danceability, tempo, key, by Spotify ID or ISRC | None [S] | Unpublished [S] | Only free route to "vibe" numbers; fragile |
| 4 | **Openverse audio API** (fronts Jamendo, Wikimedia Commons, Freesound) | CC-licensed audio search with per-item license | None (anon) or free client credentials | ~20/min, 200/day anon [S] | Best way to offer legal full tracks without a Jamendo key |
| 5 | **Jamendo API v3** | ~600k+ full-length CC tracks, streams, cover art, tags, BPM-like tags | Free client_id | 35,000 req/month, non-commercial only [V] | Good for an optional "free music" mode |
| 6 | **GetSongBPM** | BPM, key, time signature by title/artist | Free API key, backlink to getsongbpm.com required [V] | 3,000/hour [V] | Good BPM fallback; backlink obligation |
| 7 | **Internet Archive** (Advanced Search, metadata, download) | Public-domain and CC audio (Live Music Archive, netlabels, 78rpm) | None | Fair use, no published number [U] | Niche, great for long-form/ambient |
| 8 | **Radio Browser** | Community directory of ~50k internet radio streams, tags, country | None, User-Agent asked [V] | Be polite, round-robin servers [V] | Only if radio mode is wanted |
| 9 | **TheAudioDB** | Artist bios, banners, fanart, album art, MV links | Public key `123` for free tier; Premium $8/mo [V] | Free tier limited, numbers unpublished [V] | Optional artist art |
| 10 | **ccMixter query API** | CC remix/sample music, JSON | None | None published | Niche, per-track license |
| 11 | **Discogs** | Deep release data, label, credits, images | Token; images need auth [S] | 60/min authed, 25/min anon [S] | Overkill; image terms strict |
| 12 | Last.fm | Tags, similar artists, listener counts | Free key | 5 req/s/IP averaged over 5 min [S] | Non-commercial only; no images |

Not recommended: Spotify audio features/analysis, Spotify `preview_url`, Apple MusicKit, YouTube Music (see section 3), Free Music Archive (API effectively dead).

## 3. Source by source

### MusicBrainz + Cover Art Archive (recommend, extend)
- **Gives:** recording/release/artist metadata, ISRC, MBID, tags, genres, release year (already used). CAA gives front/back cover at original size and 250/500/1200 px thumbnails via `coverartarchive.org/release/{mbid}/front[-500]` (307 redirect to archive.org). [V]
- **Auth:** none. Required descriptive User-Agent with contact info. [V]
- **Limits:** about 1 request/s per IP averaged; excess gets 503 for all requests until the rate drops; global cap 300/s. [V] CAA returns 503 when its limit is exceeded, number not published. [V] Thumbnail generation currently has a backlog, so some `-500` images may lag; fall back to the original. [V]
- **License:** core MB data is CC0; supplementary data (ratings, tags, annotations) is CC BY-NC-SA 3.0; commercial live-feed use needs a MetaBrainz license. [V] Lyra is free and MIT, so API use is fine; credit "Metadata from MusicBrainz" and keep tags non-redistributed. Cover images remain copyright of rights holders; show them, do not redistribute or bundle.
- **Reliability:** good but strictly rate limited; search is fuzzy. Quality: best open metadata, covers are community scans (varied quality).
- **Plug-in:** extend `src/main/meta/musicbrainz.ts` to return `{mbid, releaseMbid, isrc, genres, year}`; add `coverArt.ts` fetching CAA by release MBID. Use as fallback after iTunes artwork or when the user wants hi-res/uncropped art. Queue all MB calls through one 1 req/s limiter, cache forever by track key via `PersistentCache`.

### Deezer public API (recommend)
- **Gives:** `GET api.deezer.com/search?q=artist:"x" track:"y"` returns title, duration, `preview` (30 s MP3), `album.cover_xl` (1000 px), artist picture. Track/album endpoints add `bpm`, `gain`, genres, release date, label. [S, field list]
- **Auth:** none for catalog reads; the developer page says only the "simple API" requires login to accept terms. [V partial]
- **Limits:** about 50 requests per 5 s per IP; quota errors arrive as JSON `error.code 4` with HTTP 200. No CORS (call from main process or Android native, not the webview). [S]
- **License/ToS:** Deezer terms limit apps to private, non-commercial use, forbid extracting content to build a separate database, and restrict streaming of recordings to private use. [V] Practical reading: live lookups plus a short per-user cache are fine; do not bulk-harvest or ship a prebuilt dataset. Deezer branding/attribution applies. The terms are legal-text; have the owner read section on "Content" before shipping previews as a feature. **[Legal ambiguity: not verified whether a free open-source app counts as "non-commercial" under their approval process.]**
- **Reliability:** historically stable, undocumented quotas. Quality: previews are 128 kbps MP3, covers excellent.
- **Plug-in:** add `DeezerArtwork` as a second provider behind iTunes in the artwork resolver; use `bpm` field when present as a cheap tempo hint; use preview only for a user-initiated "hear a clip" (not background loops).

### iTunes Search API (already used, caveat)
Apple's Search API docs say promotional content (previews, album art) may be used "only to promote store content and not for entertainment purposes", and the API is limited to roughly 20 calls/minute. [V] Lyra uses the 30 s clip as a looping video background, which is arguably entertainment use. Recommend the owner review this and keep artwork use, treat preview video as best-effort and easy to disable. Existing cache already mitigates the 20/min limit.

### ReccoBeats (audio features, recommend with caution)
- **Gives:** `GET api.reccobeats.com/v1/track/{id}/audio-features` and bulk `/v1/audio-features?ids=` (up to ~40 ids) with acousticness, danceability, energy, valence, tempo, key, loudness, etc.; also an `extract` endpoint that analyzes an uploaded file. [S]
- **Auth/limits:** no key reported; limits unpublished, reports conflict. Coverage gaps (one test: 26 of 40 tracks). Values are a proprietary substitute and will not match old Spotify numbers. [S]
- **Risk:** third-party, as-is, could vanish; ToS not verified. Treat as optional enrichment, never block the UI on it, cache hard, and degrade to "no tempo" gracefully.
- **Plug-in:** feeds the vibe/motion engine (tempo drives lyric motion tempo, energy picks vibe intensity). Look up by Spotify track ID (Lyra already has it from the Spotify source) or ISRC from MusicBrainz.

### Spotify Web API (limits, mostly not useful)
- Since 2024-11-27, new apps and dev-mode apps without a pending extension can no longer use Related Artists, Recommendations, **Audio Features**, **Audio Analysis**, featured/category playlists, and 30 s preview URLs in multi-get responses; existing extended-mode apps are unaffected. [V] So Lyra cannot rely on Spotify for BPM or previews.
- Dev mode: up to 5 authorized users, owner needs Premium; extended quota only for organizations (individuals not accepted since 2025-05-15). [V] Lyra's current Spotify auth is therefore for the owner and small testers; a public build cannot scale on it. Metadata and cover art fetched are allowed to be resized but Spotify content may not be used for ML or redistributed per Developer Terms (v10). [V partial]
- **Plug-in:** nothing new; keep as now-playing only. Do not build features on audio-features.

### Apple Music API / MusicKit (not recommended)
Catalog search needs a developer-token JWT signed with a key from a paid Apple Developer membership ($99/year); a key cannot be shipped in an open-source app without leaking. [S] Apple's agreement reportedly bars using MusicKit text/artwork apart from playback/playlist management. [S, unverified] Skip; iTunes Search covers the same artwork keylessly.

### YouTube Music (not recommended)
No official API. Unofficial wrappers scrape private endpoints against Google's ToS and break often. [U] Lyra already uses the official YouTube Data API for video, which stays the right route.

### Jamendo (recommend as optional free-music mode)
- **Gives:** full-track MP3 streams, cover images, tags, license per track, search by tag/mood/speed. Radios endpoint. [V]
- **Auth/limits:** free `client_id` from devportal.jamendo.com; 35,000 requests/month on free non-commercial use. [V]
- **License:** API free for non-commercial uses only; commercial (including ad or affiliate revenue) needs a quote. Each track has its own CC license; some are NC or SA; filters exist (`ccnc`, etc.). Display attribution (artist, title, license). [V]
- **Key problem:** Lyra is open source, so each user would need their own key, or the owner embeds one key and carries the monthly quota for everyone. Prefer Openverse for keyless access, or "bring your own key" like the YouTube setting.
- **Plug-in:** a "Lyra Radio / Discover" source implementing a `PlaybackSource` that is not a mirror of another app. Larger design change; see integration plan phase 4.

### Openverse audio API (recommend)
- **Gives:** unified search over Jamendo (~645k), Wikimedia Commons, Freesound with license, creator, duration, stream URL; filters for `category=music` and license type including commercial. [S]
- **Auth/limits:** anonymous works; about 20/min and 200/day anon, higher with free registered client credentials. [S]
- **License:** every result is CC/PD but licenses differ; filter to `cc0,by,by-sa` and show attribution, or hide NC/ND. [S]
- **Plug-in:** same Discover mode as Jamendo but with no Lyra-owned key. Verify current endpoint behavior in a spike before committing.

### Internet Archive
Advanced Search (`archive.org/advancedsearch.php?q=mediatype:audio ...&output=json`), metadata API and direct downloads, no key. Contains Live Music Archive, netlabels and public-domain 78s; per-item license metadata. [U, portal checked [V] but not limits] Good source for ambient/long-form legal audio and a CAA image backend. Be polite on rate; no published limit.

### GetSongBPM (BPM and key fallback)
Free key with mandatory backlink to getsongbpm.com on a website or store listing (account is suspended otherwise); 3,000 requests/hour; base `api.getsong.co`; key sent via `api_key` or `X-API-KEY`. [V] The backlink fits Lyra's website and README/F-Droid listing. Sending artist/title leaves the device, so add to PRIVACY.md and make it opt-in. Key must be user-supplied or kept out of the repo (an embedded key in open source is extractable and shared quota).

### AcousticBrainz and successors
AcousticBrainz stopped collecting data in 2022; the static archive (~29M recordings by MBID, last updated 2022-07) remains readable but frozen and will not cover new releases. [V] MetaBrainz points to "AcousticBrainz labs" experiments only. Useful solely as an offline-ish fallback for older songs; **I could not verify the API is still online and stable**, so do not depend on it.

### Last.fm (low value)
Free key, non-commercial only, 5 requests/IP/s averaged over 5 min, must follow cache headers; third-party use of images is prohibited and album art was removed from responses. [S, ToS pages partly V] Only tags and similar-artist data are useful and MusicBrainz genres cover most of it. Skip.

### Discogs (low value)
60 req/min authenticated, 25 anonymous, unique User-Agent mandatory, images need auth. [S] A secondary source says terms restrict caching age (about 6 h); **not verified**. Too heavy for lyrics-companion use; skip unless credits/label depth is wanted.

### TheAudioDB (optional)
Free tier key is the public `123`; Premium $8/month unlocks V2 and bigger limits; free API was previously abused and now limited. [V] Useful for artist fanart/banners that could feed backgrounds. Because the shared key is public and shared by all apps, expect throttling; low priority.

### ccMixter and Free Music Archive
ccMixter query API: `ccmixter.org/api/query?f=json&...&lic=by`, no key, per-track CC license (NC items exist). [V] Niche indie/remix catalog. Free Music Archive: old public API is listed as deactivated and reported broken since about 2021; I found no evidence it came back. Do not integrate. [S]

### Radio Browser
Community directory, free, no key, HTTP JSON; asks for a descriptive User-Agent and to use DNS round-robin across servers (`all.api.radio-browser.info`). [V] Gives station name, stream URL, country, tags, codec, bitrate. Only relevant for a "radio mode" where Lyra itself plays audio; stations often lack track metadata Lyra could match, though ICY metadata could feed the lyric lookup.

## 4. Caveats

1. **Preview audio is promotional.** Apple restricts previews/art to promoting store content; Deezer limits to private non-commercial use; Spotify previews are largely gone for new apps. Do not make previews a core entertainment feature; keep them optional and user-initiated.
2. **Keys in open source.** Anything needing a developer key (Jamendo, GetSongBPM, TheAudioDB premium, Last.fm, YouTube) must be bring-your-own-key via settings, like the existing YouTube key, never committed. Shared keys in a public repo get revoked.
3. **Privacy.** Every new lookup sends artist/title off-device. Update `PRIVACY.md` and `THIRD_PARTY.md` per source; add a settings toggle for each.
4. **Rate limits are per IP.** Desktop users each have their own IP, which is favorable; a central proxy would be an anti-pattern.
5. **Caching.** Cache aggressively on disk (the existing `PersistentCache`); Deezer forbids building a separate database and Discogs reportedly limits cache age, so use TTLs (for example 30 days for metadata, covers keyed by URL) rather than permanent bulk stores. MusicBrainz data may be cached freely (CC0).
6. **Unverified items:** ReccoBeats ToS/limits, Deezer quota numbers and field list, Openverse limits, Internet Archive limits, Apple DPLA artwork clause, Discogs cache age, AcousticBrainz API uptime, whether Deezer's terms apply to an MIT-licensed free app.
7. **Per-track CC licenses** (Jamendo, ccMixter, Openverse) require attribution UI and license filtering; NC items are fine for a free app but keep the filter honest.

## 5. Integration plan

**Phase 1 (small, safe, keyless):**
- Extend `musicbrainz.ts` to return MBID, release MBID, ISRC and genres in one request; add a shared 1 req/s queue and the existing UA.
- Add `coverArt.ts` (CAA) as an artwork fallback; keep iTunes primary.
- Add Deezer as second artwork provider and optional preview, behind an attribution line in About.

**Phase 2 (vibe data):**
- Add an `AudioFeatures` provider interface: order Deezer `bpm` (cheap), ReccoBeats (tempo, energy, valence, key), optional GetSongBPM with user key. Result `{bpm?, key?, energy?, valence?}` cached per track key and exposed to the vibe engine for motion tempo and intensity. All optional; vibes must render fine with none.

**Phase 3 (privacy, docs):** per-source toggles in the settings page, PRIVACY.md and THIRD_PARTY.md entries, attributions for MusicBrainz and GetSongBPM (website footer and README).

**Phase 4 (optional new mode):** "Discover/Free music" using Openverse (keyless) with optional Jamendo key, filtered to CC0/BY/BY-SA, showing license attribution; Radio Browser as a separate stream mode only if there is demand. This changes Lyra from a mirror to a player, so it needs a product decision first.

**Top 5 order:** MusicBrainz + CAA, Deezer, ReccoBeats, Openverse, GetSongBPM (Jamendo as the BYO-key alternative to Openverse).

## 6. Sources checked

MusicBrainz API rate limiting, Cover Art Archive API and MusicBrainz database license pages; Spotify "Changes to the Web API" (2024-11-27), quota modes and Developer Terms v10; Deezer terms of use; Apple Search API documentation; Last.fm API ToS; TheAudioDB free API page; Internet Archive developer portal; AcousticBrainz site; Radio Browser docs; Jamendo API terms (via search); GetSongBPM API page (via search); ReccoBeats, Deezer quota, Openverse, ccMixter, Discogs and Apple MusicKit details via search summaries (marked [S]).
