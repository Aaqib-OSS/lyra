# Website and docs audit (roadmap item 19), 2026-11-24

Scope: `website/*` (static, Vercel) and the Markdown docs. Method: Playwright overflow scan of every page at 320, 375, 768, 1024, 1440 and 1920 px, a read of every HTML file, `vercel.json`, `site.js`, and a claim-by-claim check against the code and docs. Not done: a real Lighthouse run, the live site, a real GitHub API rate-limit test.

## Findings

### Layout
| Where | Finding | Status |
|---|---|---|
| Home, showcase bar at 320 px | The three-way device switch (Full screen / Android / Mini player) was wider than the stage and spilled out | fixed (`site.css`, max-width 400 rule) |
| 375 to 1920 px, all pages | No horizontal overflow; the remaining wide elements (aurora, ticker) are clipped by design | ok |
| Vega section | Phone screenshots no longer overlap (fixed in ab19b06) | ok |

### Downloads
`site.js` reads the GitHub releases API, caches 1 h in sessionStorage, takes the highest version per platform, and ignores a rate-limit object. On any failure the buttons keep their static link to the releases page, and a `<noscript>` text explains which release to pick. Behaviour is correct by reading; not exercised against a real 403.

### Performance
Images are WebP with width/height and srcset on the hero and showcase; the hero image is preloaded with `fetchpriority`; fonts are self-hosted woff2 (128 KB) with preload; videos use `preload="none"` with posters; there is no tracking script. Total transfer on first load was not measured. Cache headers existed for fonts, shots and media; added for HTML (revalidate) and the unhashed CSS and JS.

### SEO and sharing
Title, description, canonical, Open Graph and Twitter tags with a 1200x630 image already existed. Added: JSON-LD (`SoftwareApplication`, `WebSite`), sitemap `lastmod`, a description on `room.html`. `robots.txt` correctly disallows `/room`.

### Security headers
Only `nosniff` and Referrer-Policy existed. Added: Content-Security-Policy (strict for all pages; `room.html` gets inline script plus the PeerJS cloud host), X-Frame-Options, Permissions-Policy, COOP. Verified by reading: no inline scripts or `on*` handlers on the other pages. Not verified in a deployed browser (local header injection was not possible in the harness): see owner decisions.

### Content and claims
| Claim | Check | Result |
|---|---|---|
| 34 looks | `vibes-data.js`, `check-site.mjs` | correct |
| Official video behind the lyrics | needs a free YouTube API key (README, PRIVACY); default is living artwork or an Apple preview | home and README said it unconditionally; the FAQ and README now say how it works |
| Windows works with Spotify | `smtc/script.ts` matches Spotify only | correct; stated in the FAQ |
| No account / no analytics | PRIVACY | correct |
| Newest features missing from the home page | export in the current look, Lyra Connect, karaoke, Android TV | added as feature cards; TV marked "early, not run on a real TV" |
| No FAQ, privacy summary, support path | n/a | added a FAQ section (SmartScreen, Play Protect, sources, privacy, support) |

### Docs
- `SECURITY.md` still described the removed TV-mode server and secret link: rewritten for Lyra Connect.
- `README.md` said "Current: Android 0.10.1" (stale) and the unconditional official-video claim: fixed; FAQ added.
- `docs/README.md` (index) did not exist: added.
- `check-docs.mjs` failed on two backticked paths that are generated and not committed: reworded.
- Left alone (another agent owns them): `docs/connect-redesign.md`, `docs/connect-protocol.md`. `CONTEXT.md` and `PRIVACY.md` mention LAN only for Lyra Connect, which exists; no dead feature found.

## Checks added to `scripts/check-site.mjs`
Meta tags per page (title, description, viewport, lang, OG, Twitter, canonical), a `<main>` landmark, `alt` and `width`/`height` on every `<img>`, in-page `#` links resolve, `target=_blank` has `noopener`, no inline scripts outside `room.html`, pages listed in the sitemap with `lastmod`, required headers in `vercel.json`, JSON-LD present.

## Open for the owner
- Check the CSP on a Vercel preview (open every page, read the console) before production.
- Windows and Android download buttons fall back to the releases list; a direct "latest" link is not possible because both apps share one repo.
- A real Lighthouse run (mobile) and a 1-2 minute contrast pass on the accent colours.
- The 34-look screenshots were not regenerated (owner decision).
