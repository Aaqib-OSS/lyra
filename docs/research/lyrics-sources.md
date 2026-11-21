# Lyrics sources research for Lyra

Researched 2026-11-22 against the code on branch `worktree-agent-a47cca2acbe40e2c1`. No app code was changed and no API keys appear in this file.

Legend: **[V]** verified against an official page or a live request made during this research. **[T]** taken from third-party summaries or search results only. **[?]** could not be confirmed, so check it before relying on it.

## 1. What Lyra already has

| Piece | File | Notes |
|---|---|---|
| LRCLIB provider | `src/core/lyrics/lrclib.ts` | Uses `/api/get`, `/api/search`, and `/api/get/{id}`. Sends a descriptive `User-Agent`. Reads `syncedLyrics`, `plainLyrics`, and `instrumental`. It does **not** read `lyricsfile` or `hasWordSync`, and it does not send a `Lrclib-App-Id`. |
| Public-domain provider | `public-domain.ts` | Reads a GitHub JSON dataset (`kennethyork/PubDomainOnly`). |
| Provider interface | `provider.ts` | `fetch`, optional `candidates` and `byId`. Its header says providers must use a documented, permitted API, with no scraping and no bypassing access controls. |
| Ranking | `rank.ts` | Tiers: word-synced 3.2, line-synced 3, plain 1, instrumental 0.2. A synced candidate is validated (line count, timestamps against track length, order, duplicate stamps, placeholders). A failed one is demoted. Title/artist/duration match score (`match.ts`) and a script-mismatch penalty are added. |
| Service | `service.ts` | Provider chain with a circuit breaker, backoff, persistent blob cache, and user pins/imports. |
| Parsing | `src/shared/lrc.ts` | Parses enhanced LRC (word tags). Word timing can also be estimated. |
| Romanization | `romanize.ts` | Offline Devanagari and Gurmukhi to Latin. Nothing for Korean, Japanese, Chinese or Arabic. |
| Translation | none found | No translation code path exists in `src/core`. |

Policy constraint to respect: Lyra is MIT-licensed and open source, and `provider.ts` forbids scraping and anything that bypasses access controls. Every recommendation below is judged against that rule.

## 2. Ranked table

Rank is by value to Lyra weighted by risk. "Fit" means whether the provider-chain rule above allows it.

| # | Source / technique | Gives | Auth and limits | ToS / licence for an open-source app | Fit |
|---|---|---|---|---|---|
| 1 | **LRCLIB word sync (`lyricsfile`, `hasWordSync`)**, an upgrade of the existing provider | Real word-level timings in YAML (`lines[].words[].start_ms`) for a share of tracks. I saw it in 13 of the top results for "blinding lights" and 10 for "lemon kenshi yonezu", but 0 for "tum hi ho" and 1 for "shape of you" **[V]**. | No key. Identified clients get about 90 req/min per IP. Registering an app gives a public `Lrclib-App-Id` and about 180 req/min per IP. All of these are approximate and the docs say they can change **[V]**. | LRCLIB's own docs invite clients and say registration is optional. I found no licence statement for the data, so the lyrics stay publisher-owned **[?]**. Dumps are published at `lrclib.net/db-dumps` **[V]**. | Yes |
| 2 | **Kugou KRC and QQ Music QRC (word-level)**, opt-in | Word and syllable timing, plus translation and romanization lines in some cases. Strong for Chinese, Korean and Japanese pop. | Anonymous endpoints exist, but they are unofficial and reverse-engineered. QRC needs a custom 3DES variant and KRC needs XOR plus zlib decoding **[T]**. | No public API terms exist. The endpoints are undocumented and break when the protocol changes. This conflicts with the "documented API" rule in `provider.ts`. | Only as a clearly flagged, off-by-default, user-enabled experimental source |
| 3 | **NetEase Cloud Music (LRC and YRC word-level)**, opt-in | Line LRC, word-level YRC for many post-2021 tracks, translation (`tlyric`/`ytlrc`) and sometimes romanization (`romalrc`). | Unofficial. An anonymous `/api/song/lyric?id=…&lv=1&yv=1` form is reported to work. Other clients use the eapi-signed `/lyric/v1` route **[T]**. | NetEase publishes no public lyrics API terms **[T]**. A reference plugin is AGPL, so do not copy its code. Reimplement from the observed protocol only **[T]**. | Same as #2: opt-in and experimental |
| 4 | **Offline romanization libraries** for Korean, Japanese, Chinese and Arabic (Section 4) | Latin letters for lyrics shown in the original script. | None. Runs on the device. | All MIT or Apache-2.0 for the JS options below **[V]** (licence field from npm). | Yes |
| 5 | **On-device translation** (Android ML Kit, desktop Argos or LLM) and an optional user-keyed cloud API (Section 5) | Line translation. | ML Kit and Argos: no quota. DeepL Free: 500,000 characters per month. Azure F0: 2 million characters per month **[T]**. | Argos is MIT/CC0 **[T]**. ML Kit is free but Android-only. Cloud keys must be the user's own. | Yes, with the user's own key for cloud |
| 6 | **Forced alignment** to turn line-synced LRC into word timings offline (Section 6) | Word timestamps when no provider has them. | Local compute only. | MFA is MIT **[T]**. SOFA is MIT **[T]**. aeneas is AGPL-3.0 and not designed for words **[T]**. MMS aligner weights may be CC-BY-NC **[?]**. | Yes, as a later desktop-only feature |
| 7 | **Musixmatch free tier** | A 30% snippet of lyrics, no sync. | 2,000 calls per day, development use **[T]**. The full and synced lyrics need a paid partner licence. | Not usable for a lyrics screen. A 30% snippet is useless to Lyra, and caching beyond the licence is not allowed **[T]**. | No |
| 8 | **Genius** | Plain lyrics, unsynced. | The official API returns metadata only. Lyrics need page scraping **[T]**. | Scraping conflicts with Genius's terms **[T]**. The Genius v. Google case was dismissed because contract claims were preempted by copyright, which does not make copying the lyrics lawful **[T]**. | No (violates `provider.ts` rule) |
| 9 | **Spotify's own lyrics** | Synced lyrics from the Musixmatch partnership. | No Web API endpoint exists. The only route uses a copied `sp_dc` browser cookie against internal paths **[T]**. | That route bypasses access controls and is tied to a personal account. | No |
| 10 | **Apple Music lyrics** | Word-level TTML (`syllable-lyrics`). | Apple staff said lyrics are not available through MusicKit **[T, old thread]**. Working clients use the web player's privileged token plus a user subscription token **[T]**. | Undocumented and probably against Apple's terms. | No |
| 11 | **Deezer** | Reportedly word-synced lyrics. | The official Deezer API has no lyrics endpoint. The route used by aggregators is unofficial **[T]**. | No documented terms for it. | No |
| 12 | **AZLyrics-style sites** | Plain lyrics only. | Scraping. | Prohibited and no sync, so worse than LRCLIB. | No |
| 13 | **Open datasets (DALI, MulJam, Jamendo)** | Research data with word-aligned lyrics. | Academic licences (AFL, CC BY-NC-SA) and the audio is not included **[T]**. | Not suitable to ship or look up at runtime. Useful only to test an aligner. | No (test data only) |

## 3. Detail on the recommended time-synced sources

### 3.1 LRCLIB upgrade (do first)

What changed since Lyra's provider was written, all read from `lrclib.net/docs.txt` and live calls **[V]**:

- Every record now carries `lyricsfile`, a YAML document, plus a boolean `hasWordSync`. Word-synced records have `lines[].words[]` with `text` and `start_ms`, and lines have `start_ms` and `end_ms`. A sample is the record for "Blinding Lights" (id 3204715).
- `GET /api/v2/search` is a beta endpoint that returns metadata and `hasWordSync`, `hasSyncedLyrics`, `hasLyricsfile` flags without lyrics text, so it is cheap for building a candidate picker. Fetch the chosen record with `/api/get/{id}`.
- Rate limits are tiered by how you identify yourself (about 45, 90, or 180 requests per minute per IP). A 429 includes `Retry-After`, and the docs say ignoring it may cause a temporary ban. Lyra's `LyricsProviderError` already carries `retryAfterSec`.
- Registering an app in the developer portal is optional and gives a public `Lrclib-App-Id` header. That ID is not a secret and is safe to ship. **Do not** use the server-side `Lrclib-Api-Key` in a client app.

How to plug in: in `lrclib.ts`, parse `lyricsfile` when `hasWordSync` is true and convert it to the enhanced LRC (`<mm:ss.xx>` word tags) that `parseLrc` already turns into word-synced lines. `rank.ts` then gives it the word-synced tier with no change. When several LRCLIB records exist for one song, prefer a record with `hasWordSync` that still passes `validateSyncedLines`.

Caveats: word coverage is patchy. It looks stronger for English and Japanese hits than for Hindi in my small sample, so treat it as a bonus, not something to depend on. Also note the word end time is missing in the sample (only `start_ms` per word), so the end of the last word must come from the next word or the line `end_ms`. The `lyricsfile` schema is described on `lrclib.net/lyricsfile`, which needs JavaScript, so the full field list is **[?]**.

Caching and redistribution: LRCLIB publishes database dumps, so the community clearly expects local copies. Lyra's persistent cache is a per-user cache and is fine. Do not bundle lyrics in the app or its repo. The lyrics themselves remain copyrighted by their owners, and I found no data licence **[?]**.

### 3.2 Optional experimental sources (NetEase, QQ, Kugou)

These are the only free sources with good word timing and strong CJK coverage. They are also unofficial.

- Reliability: format and parameters change without notice. Other open-source clients put NetEase last in their fallback chain for that reason **[T]**.
- Legal: no published terms permit third-party apps, and nothing in this research says they forbid it, so the risk is unknown. Several open-source clients ship them, but that is not permission.
- Recommendation: ship none of them in the default chain. If the owner wants them, build each as a separate provider behind a Settings toggle labelled experimental, with a kill switch through the existing `CircuitBreaker`, a low request rate, no key sharing, and cache-only storage on the user's device. Reimplement from the observed JSON and byte format. Do not copy AGPL reference code into an MIT repo.
- QRC needs a custom 3DES implementation and KRC needs XOR plus zlib. Both are small but need unit tests with fixtures.

## 4. Romanization and transliteration

Lyra already covers Hindi and Punjabi. The table covers what is missing. Licences are from the npm or PyPI registry **[V]**. Quality notes are my judgement and should be tested on real lyrics.

| Language | Option | Licence | Notes |
|---|---|---|---|
| Japanese | `wanakana` (kana to romaji) plus `kuroshiro` with `kuroshiro-analyzer-kuromoji` for kanji | MIT, kuromoji Apache-2.0 | The kuromoji dictionary is about 41 MB unpacked (npm unpacked size), which is heavy for Android. Kanji readings are the hard part. Lyrics often use non-standard readings, so expect errors. Prefer the line's own romanization from NetEase/QQ when a provider returns one. |
| Korean | `@romanize/korean` or `hangul-romanization` | MIT | Small, rule-based, so it works fully offline. Avoid the Python `korean-romanizer` (GPL-3.0). |
| Chinese | `pinyin-pro` | MIT | Actively maintained, handles polyphonic characters with context. About 0.95 MB unpacked. |
| Arabic | `transliteration` (generic) or `any-ascii` (ISC) | MIT / ISC | Arabic text normally lacks short vowels, so any rule-based output is rough. A provider-supplied romanization is better. |
| Hindi, Sanskrit variants | `@indic-transliteration/sanscript` | MIT | Useful only as a cross-check. Lyra's own romanizer already produces chat-style spelling, which `sanscript` does not. |
| Anything else | `uroman` (Python, permissive licence) | permissive | Universal but Python-only. Useful offline or as a dev tool, not in the app. |

Avoid: `pykakasi` and `aksharamukha` (GPL-3.0 and AGPL-3.0 respectively, which are a problem for an MIT app).

Plug-in: add per-script functions beside `romanize.ts` behind one `romanize(text, script)` entry point. Load Japanese lazily so the dictionary download does not hit startup.

## 5. Translation

| Option | Limits | Licence/ToS | Notes |
|---|---|---|---|
| Android ML Kit on-device translation | No quota, more than 50 languages, models download once **[T]** | Free SDK | Android only, quality modest. Best default on Android. |
| Argos Translate (desktop) | None | MIT/CC0 **[T]** | Language packs are large, so offer them as an optional download. Quality is below the cloud engines. |
| DeepL API Free | 500,000 chars per month per key **[T]** | User must hold their own key | A typical song is about 1,500 characters, so about 300 songs per month. Good quality for major languages. |
| Azure Translator F0 | 2 million chars per month **[T]** | User's own subscription | Needs an Azure account, so heavier setup. |
| MyMemory | 5,000 chars per day anonymous, 50,000 with an email **[V]** | Public API | Poor quality for lyrics. Fallback only. |
| LibreTranslate | The hosted instance needs a key. Self-hosted limits are set by the host **[T]** | AGPL server | Only useful if the user runs it themselves. |
| Google Translate unofficial web endpoint | Unknown | Unofficial, ToS unverified **[?]** | Do not use. |
| Provider-supplied translation (NetEase `tlyric`, Apple, QQ) | Free with the lyric | Same as the provider | Best quality because it is human. Only appears if an experimental provider is enabled. |

Rule for all cloud options: the user supplies their own key, stored like Lyra's other keys, never shipped. Cache translations per song so each song costs characters once, and send only the lyric text, never track metadata about the user.

## 6. Forced alignment for word timings

Goal: take the line-synced LRC that a provider gave us, plus the audio, and produce per-word start times.

| Tool | Licence | Singing fit | Size and cost | Verdict |
|---|---|---|---|---|
| **WhisperX** (Whisper plus wav2vec2 alignment) | BSD-style repo **[?]**, models MIT | Built for speech. Reports about 93% word-timing precision on speech and no singing numbers **[T]**. Sustained notes and backing music hurt it. | Python and PyTorch, heavy. Not Android-friendly. | Desktop tinkering only. |
| **whisper.cpp** | MIT | Gives rough word timestamps and also transcribes. Poor on sung audio without vocal isolation. | tiny 75 MiB, base 142 MiB, small 466 MiB, quantised tiny-q5_1 31 MiB, base-q5_1 57 MiB. RAM about 273 MB (tiny) to 852 MB (small) **[T]**. Has an official Android example. | Best portable engine, but needs vocal separation first. |
| **Vocal separation (Demucs, ONNX)** | MIT | Greatly helps any aligner. | The vocals-only htdemucs-ft ONNX model is about 316 MB, about 22 s for a 3-minute song on an Apple M4 Pro CPU **[T]**. A phone CPU will be several times slower **[?]**. | Desktop only, as an optional download. |
| **Montreal Forced Aligner** | MIT | Designed for speech. A paper advises caution on singing **[T]**. | Kaldi based, Python, large. Needs per-language models and a pronunciation dictionary. | Not practical to embed. |
| **SOFA** (singing-oriented forced aligner) | MIT | Built for singing voice **[T]**. | Needs trained models per language and Python. | Worth a prototype for English or Chinese. |
| **MMS or ctc-forced-aligner** | Code permissive. The MMS weights may be CC-BY-NC **[?]** | Covers 1,100+ languages including Hindi. Non-Latin text must go through `uroman` first. One paper says its defaults misplace word boundaries **[T]**. | wav2vec2 300M, hundreds of MB. An ONNX build exists for Node **[T]**. | Check the weight licence before any use. |
| **aeneas** | AGPL-3.0 | Not designed for words **[T]** | Small, DTW based | Reject (licence and fit). |

Feasibility summary: desktop, as an opt-in "improve timing" action on a song the user is playing, is plausible: separate vocals, align known lyric lines to the vocal stem, write the word times to the per-song cache. Android is not realistic for full songs today because of the CPU time and model sizes. A cheaper Android route is "constrained estimation": keep the provider's line times and distribute words inside each line by syllable count, which Lyra already does for line-synced lyrics. Aligner output is a guess for sung audio, so mark such lyrics as "estimated word timing" in the UI.

## 7. Quality-scoring heuristics (additions to `rank.ts`)

Lyra already handles tiers, title/artist/duration, timestamps against track length, order, duplicate stamps and script mismatch. Possible additions:

1. **Word-sync validation.** For a candidate with word times, reject or demote if word stamps go backwards inside a line, a word falls outside its line's start/end, or a single word lasts more than about 6 s without a break. Then demote it to line-synced rather than dropping it.
2. **Agreement between candidates.** If two providers return the same lyrics text (normalised) with first-line times within about 1 s, boost both. A lone outlier whose times differ by several seconds from the consensus gets a small penalty. This detects wrong-edit and wrong-offset copies.
3. **Offset estimate.** Compare the last timestamp with the track duration. A candidate whose last line is far from the end of the vocal usually has an offset or is from a different edit. Use duration difference as a tie-breaker, in addition to the existing hard limits.
4. **Line-length and density sanity.** Lines per minute outside a plausible range, or many single-word lines, suggest a bad sync.
5. **Duplicates and junk.** Penalise text containing credit lines, URLs, "Lyrics by", or contributor tags. Penalise very repetitive auto-generated text.
6. **Language consistency.** Extend `languagePenalty`: if the track is in a known language (from Spotify or LRCLIB `language` metadata) and the text script differs, penalise. Already done for non-Latin titles. Add the reverse case, where the title is Latin (romanised Hindi) and the lyrics are Devanagari, as neutral.
7. **User pins and feedback.** Keep the existing rule that pins win. Remember per-source wins and losses in the Store, and use them as a small prior (for example plus or minus 0.1).
8. **Source reliability prior.** A small constant per provider (LRCLIB word sync above LRCLIB line sync above experimental providers) so ties resolve predictably.

## 8. Short integration plan

1. **LRCLIB word sync (small, no new dependency).** In `lrclib.ts`, add the `lyricsfile` and `hasWordSync` fields to the record type, convert word-synced YAML to enhanced LRC, and expose it as `synced`. Add a fixture test using a trimmed copy of the Blinding Lights record. Parse YAML with a small safe parser, and fail closed to the existing `syncedLyrics` when parsing fails.
2. **Register Lyra with LRCLIB** and send the public `Lrclib-App-Id` header. The owner does this in the developer portal. No key is involved because the ID is public and is not a secret, but put it in config rather than guessing a value.
3. **Rank additions** from Section 7 items 1, 2 and 8. They are pure functions and fit the existing `rank.test.ts` style.
4. **Romanization for Korean, Chinese, Japanese**, in that order of effort, using `@romanize/korean` and `pinyin-pro` first. Add Japanese with a lazily loaded dictionary after the other two.
5. **Translation**: on Android use ML Kit. On desktop start with a user-supplied DeepL or Azure key, or Argos as an optional download. Cache per song.
6. **Experimental providers** (NetEase first, then QQ and Kugou) only if the owner accepts the risk. Each is a separate class behind a toggle that defaults to off, rate limited, with fixtures for the decoders.
7. **Desktop "improve word timing"** (separation plus alignment) as a later spike. Measure on 10 songs across English, Hindi and Korean before committing.

## 9. Open questions and unverified items

- LRCLIB data licence: not found. Ask the maintainers whether caching and display in an open-source app are in line with their expectations (the docs suggest yes).
- Share of LRCLIB records with word sync is only sampled (8 queries, 20 results each at most). Measure on the owner's real library before promising it.
- Musixmatch plan limits come only from third-party summaries. The official plans page needed JavaScript. One directory listed different numbers (1,000 per month), so confirm on the developer site if it ever matters.
- Apple Music lyrics via MusicKit: the only primary statement I found is an old forum answer.
- Deezer unofficial endpoint and the exact NetEase, QQ and Kugou terms were not located.
- Phone-side speed of Demucs and whisper.cpp: no Android benchmark was found.
- Licence of the MMS aligner weights and WhisperX repo: conflicting or unchecked.
- Legal notes in this file are research, not legal advice.

## Sources

- LRCLIB API reference: https://lrclib.net/docs.txt and https://lrclib.net/llms.txt (fetched, plus live API calls)
- LRCLIB server source (MIT): https://github.com/tranxuanthang/lrclib
- LRCLIB mirror from dumps: https://github.com/nikarh/lrclib-mirror
- MyMemory limits: https://mymemory.translated.net/doc/usagelimits.php
- Genius v. Google coverage: https://www.theregister.com/2023/06/26/supreme_court_google_genius/
- lyricsgenius notes on scraping: https://lyricsgenius.readthedocs.io/en/stable/how_it_works.html
- NetEase client notes: https://github.com/jav76/Cantus/issues/65 and https://github.com/thedavidweng/openkara-sources/pull/22
- QQ and Kugou formats: https://github.com/0x535a/LrcAPI and https://github.com/maxmixalex/musicloom/pull/10
- Apple Music lyrics: https://developer.apple.com/forums/thread/698127 and https://github.com/rryam/MusanovaKit
- whisper.cpp: https://github.com/ggml-org/whisper.cpp
- Demucs ONNX: https://stemsplit.io/blog/htdemucs-ft-onnx-export
- Montreal Forced Aligner: https://github.com/MontrealCorpusTools/Montreal-Forced-Aligner
- SOFA: https://github.com/qiuqiao/SOFA
- ctc-forced-aligner: https://github.com/MahmoudAshraf97/ctc-forced-aligner
- aeneas: https://www.readbeyond.it/aeneas/
- Argos Translate: https://github.com/argosopentech/argos-translate
- Library licences: npm and PyPI registry metadata queried 2026-11-22
- DALI: https://transactions.ismir.net/articles/10.5334/tismir.30
