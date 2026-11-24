# Settings page audit (roadmap item 8)

Ranked by user impact. "Done" marks what this branch changed.

## Findings

1. **A corrupt `settings.json` silently loses everything.** `JsonStore.load` logged a warning, fell back to defaults and the next save overwrote the broken file. No backup, no way to recover. (Done: the unreadable file is kept as `settings.json.corrupt`, a last-known-good `.bak` is written before each replace, and loading falls back to the `.bak`.)
2. **Validation covers only some values.** Most booleans were coerced with `!!` or not at all (`"false"` was truthy for `alwaysOnTop`), numbers like `ambientBrightness` etc. only some were clamped, `spotifyClientId` was unbounded, `songVibes` was only trimmed by length. (Done: every boolean/number/string key is checked against its default's type, strings are length limited.)
3. **No way to see or undo what you changed.** 60+ options, no "what is different from default", only one all-or-nothing Reset. (Done: "Changed" view with a per-setting Reset, Reset all keeps its confirm step.)
4. **No backup / move to another PC.** (Done: copy settings as text, paste to import; sensitive and device specific values (Spotify client id, window position and size, per-song picks) are never exported; import is validated and size capped.)
5. **Search shows nothing, silently, when no row matches**, and the search observer re-ran on every DOM change even with an empty box. (Done: "No settings match" live message, observer only while searching.)
6. **Per-song versus global is never explained.** Sync offset, vibe, background and video picks exist both as a global default and per song. (Done: short plain explanations at the vibe and sync rows.)
7. **No deep links.** Nothing could open Settings at a given section or with a search. (Done: `openSettings({ tab, query })` helper plus the `lyra:settings-open` event.)
8. **Diagnostics included the full per-song vibe map** (song ids = listening history) and shortcut layout. (Done: only the count of per-song picks is reported.)
9. **Accessibility**: search result changes are not announced; the Changed list and import box have labels. (Done for the new parts.)
10. Left alone, listed for the owner: the Settings text is still partly not translated (`t()` is used for the Player and Connect tabs only); `lockLook` hides five legacy keys in both main and renderer (kept for compatibility); the panel subscribes to the whole settings object so every change re-renders all sections (cheap in practice, not worth a store split now).

## PRIVACY.md
Still true: nothing new leaves the device. Export is text the user copies by hand.
