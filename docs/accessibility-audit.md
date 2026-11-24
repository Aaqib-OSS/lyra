# Accessibility and languages audit (roadmap item 17)

Audit date 2026-11-24, on the worktree branch for item 17. Tools: `scripts/check-a11y.mjs` (static, reads the JSX and CSS), `scripts/ui-test/a11y-runtime.mjs` (browser harness, Playwright), `scripts/check-i18n.mjs` (translations). **No real screen reader (NVDA, TalkBack, VoiceOver) was available: names, roles and live regions are checked from the DOM, not heard.**

Severity: **High** blocks a keyboard or screen-reader user, **Medium** makes it hard, **Low** polish.

## Found and fixed in this pass

| # | Area | Finding | Sev | Fix |
|---|------|---------|-----|-----|
| 1 | Dialogs | Share card, Export (Studio), Record (Android), Welcome and Karaoke had no focus trap, no Esc, did not return focus. Esc in Share/Studio also left fullscreen behind the dialog. | High | `src/renderer/src/hooks/useDialog.ts` (focus in, Tab trap, Esc, focus return) on all five; `aria-modal="true"` added. |
| 2 | Karaoke | Space was swallowed even when a button had focus, so a keyboard user could not press a focused button with Space. | High | Space now passes through when the target is a `<button>`. |
| 3 | Settings and global keys | Arrow keys on Settings radio groups and tabs also seeked the song 5 s and changed volume (the app-level hotkeys ran as well). | High | `App.tsx` ignores the arrows when the target is a radio, tab or menu item. |
| 4 | Focus ring | The ring was `2px accent`, which can vanish against a look whose background is close to its accent (34 looks). | High | `styles/a11y.css`: a black ring against the control plus a white ring outside it, so one of them always contrasts. Forced-colors uses `Highlight`. |
| 5 | Names | 4 inputs/textareas had no accessible name (API key, Client ID, caption; file inputs sit inside labels). | Medium | `aria-label` added. |
| 6 | Android targets | Icon buttons were 44 px, tabs 44 px, pills 30 px, the lyric offset buttons 20 px, the ambient switch 30 px. Target is 48 dp. | Medium | `a11y.css`: 48 px floor (`!important`, per-look rules are more specific); small controls keep their look and get a larger invisible hit area (`::after`). |
| 7 | Errors | Toasts were one polite region; errors were not announced as errors, and toast text was English only. | Medium | Error toasts get `role="alert"`; every toast is translated and the button names its action ("Dismiss: ..."). |
| 8 | Language | Only Hindi existed, for ~95 Settings strings; everything else was hard-coded English; `<html lang>` and `dir` were never set. | High | See "Languages" below. |
| 9 | RTL | Lines of lyrics followed the UI direction. | Low | `unicode-bidi: plaintext` on lyric text; `lineDir()` helper exported for line wrappers (see open items). |
| 10 | Wording | Error text used internal words ("playerctl", "media bridge", "rate limiting"). | Low | Three messages rewritten in plain words (`src/main/smtc/source.ts`, `src/main/mpris/source.ts`, `src/main/spotify/source.ts`). |

## Checked and fine

- **Reduced motion**: Settings has System / On / Off. `data-reduced` stops CSS animation and `MotionConfig` stops framer-motion. With the OS setting on, the harness found 0 infinite animations still running on a fullscreen look.
- **Esc** closes the side panel first, then leaves fullscreen, then collapses the mini player (`App.tsx`).
- **Tab order** in the harness: fullscreen (13 stops), mini (12), Settings (30) are reached in visual order with no trap and a visible indicator on every stop (neon; two other looks spot-checked in screenshots).
- **Names**: every `<button>`, `<input>`, `<img>`, dialog and link found by `check-a11y.mjs` now has a name; the runtime check finds no unnamed interactive element on the screens it visits.
- **Live regions**: toasts are `role="status"`; the lyrics are deliberately *not* a live region (a changing line would be read out on every line).
- **Colour-only information**: toggles use `role="switch"` + `aria-checked`, segmented controls `role="radio"` + `aria-checked`, the repeat/shuffle buttons `aria-pressed`. Status dots in Settings are paired with text.
- **Forced colors**: focus ring switches to `Highlight`; borders restored on pills and switches. Smoke-run only (screenshot exists, no pixel check).

## Open (not fixed here)

| # | Area | Finding | Sev | Who |
|---|------|---------|-----|-----|
| A | Lyrics keyboard | Each lyric line carries two small buttons (save, share) that are tab stops, so Tab in a long song walks hundreds of stops. The lines themselves are `tabIndex=-1`. A roving tabindex (one stop for the whole list, arrows move) or "skip lyrics" link is needed. | High | lyrics view owner |
| B | Lyrics direction | The stage layouts (neon sign, etc.) lay words out in a flex row per line, so Arabic/Hebrew lines inherit the UI direction. Put `dir={lineDir(text)}` (from `i18n.ts`) on each line wrapper. Harness has no Arabic sample, so this is untested with real Arabic text. | Medium | lyrics view owner |
| C | Translation coverage | `npm run check:i18n --hardcoded` lists ~310 hard-coded user-visible strings (Settings 43, Karaoke 39, Studio 39, Devices 30, State screens 24, Lyrics match 16 ...). The shell (controls, side panel, share card, welcome, toasts, lyrics footer and fallback) is translated; Settings only partly (the Settings owner had 95 strings). | Medium | owner / Settings agent |
| D | Contrast of chrome | Only lyrics are contrast-checked (`scripts/ui-test/run.mjs`, 3:1). Small chrome text ("PLAYING ON STUDIO PC", times, dim secondary lines) in some looks looks below 4.5:1. Needs a per-look measurement. | Medium | design owner |
| E | Text scaling | Not verified on a real device. The web layout was only checked at a 500 x 360 viewport (about 200% zoom of a laptop window); Android font scale 1.3 to 2.0 was not tried. | Medium | needs device |
| F | Settings tabs | With Gujarati the Settings tab row scrolls horizontally (last tab is clipped until scrolled). It is reachable with the keyboard. | Low | Settings agent |
| G | Side panel | `SidePanel` has `role="dialog"` but is not modal (the scrim is click-to-close); it has no focus return. | Low | |

## Languages

- Pattern: key = the English sentence; `t('...')`, `tp(one, other, n)`, `formatNumber`, `formatDate`, `formatDuration`; missing keys fall back to English; `<html lang>` and `dir` follow the language. Details in `docs/accessibility.md`.
- Hindi (`src/renderer/src/locales/hi.ts`) and Gujarati (`src/renderer/src/locales/gu.ts`) each have the same ~200 entries and cover every `t()` key currently in code (`npm run check:i18n` reports 152/152).
- **Both are machine-assisted and not yet reviewed by a native speaker.** Wording is simple and avoids stiff Sanskritised words, but names such as "pal/પળ" for "moment" and the karaoke/vibe terms need a human opinion.
- Picker: the Settings "Language" row (already present) now lists English, Hindi, Gujarati. A system language of Hindi or Gujarati is picked automatically on first run.
