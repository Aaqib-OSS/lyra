# Keeping Lyra accessible, and translated

What was found and what is still open lives in `docs/accessibility-audit.md`. This page is the working guide.

## Keyboard shortcuts

In the app window (fullscreen and the mini player):

| Keys | Does |
|------|------|
| Space | Play / pause (when a button or slider has focus, Space presses that control instead) |
| Left / Right | Seek 5 s |
| Shift + Left / Right | Previous / next song |
| Up / Down | Volume |
| F | Fullscreen on / off |
| Esc | Closes the open panel or dialog first; then leaves fullscreen; then collapses the player |
| D | Distraction-free (fullscreen) |
| [ and ] | Lyrics later / earlier |
| V, Shift + V | Next / previous vibe |
| Tab, Shift + Tab | Move between controls (every control shows a focus ring in every look) |

Arrow keys belong to the widget when focus is on a slider, a radio group, a tab strip or a menu, and the app-level seek and volume do not fire then.

Global shortcuts (work when Lyra is in the background, can be changed in Settings): Ctrl + Alt + P play / pause, Ctrl + Alt + Left / Right previous / next, Ctrl + Alt + L expand / collapse, Ctrl + Alt + F fullscreen lyrics, Ctrl + Alt + H show / hide.

Karaoke: Space or K pause, Left / Right nudge the sync by 0.2 s (Shift: 0.5 s), T tempo, G guide, F finish, Enter start / sing again, Up / Down pick another version, Esc close.

The source of truth for the list is `src/shared/shortcuts.ts`; keep this table in step with it.

## Rules for new UI

1. **Every control has a name.** Icon-only buttons need `aria-label` (or use `IconButton` from `src/renderer/src/components/Controls.tsx`, which takes a `label` and translates it). Inputs need a visible `<label>` or an `aria-label`. Decorative icons get `aria-hidden="true"`; images get `alt` (empty when decorative).
2. **Use real buttons.** A clickable `<div>` is not reachable by keyboard. If you must, give it `role="button"`, `tabIndex={0}` and Enter/Space handling.
3. **Dialogs**: `role="dialog" aria-modal="true" aria-label=...`, a ref, and `useDialog(ref, onClose)` from `src/renderer/src/hooks/useDialog.ts`. It moves focus in, traps Tab, closes on Esc (stopping the app's own Esc) and returns focus to the opener. Pass `{ escape: false }` if the dialog already handles Esc.
4. **Do not remove focus outlines.** `src/renderer/src/styles/a11y.css` draws a two-colour ring (black against the control, white outside) so it contrasts with any look. If a look needs another ring, set `--focus-in` / `--focus-out`, do not set `outline: none`. If you restyle a control's focus, keep a visible indicator of at least 2 px.
5. **State is not colour only.** Toggles use `role="switch"` + `aria-checked`; choices `role="radio"` + `aria-checked`; toggle buttons `aria-pressed`. Pair a coloured dot with text.
6. **Announce sparingly.** Toasts are a polite live region; errors use `role="alert"`. Lyrics are never a live region (a new line every few seconds would be read out each time).
7. **Motion**: respect `data-reduced` (set from the OS setting and the Settings choice). New infinite animations need a reduced-motion rule.
8. **Android touch targets are 48 px.** `a11y.css` enforces a floor on `.ibtn`, pills, tabs and radios; for a small visual control keep its look and give it a larger invisible hit area (see the `::after` rules in `android-scenes.css`).
9. **Text size**: do not fix heights on containers that hold text; use `min-height`, let long words wrap (`overflow-wrap: anywhere`), test at 200% zoom and with Gujarati/Hindi, which are taller than English.
10. **Direction**: use logical CSS (`margin-inline-start`, `inset-inline-end`, `text-align: start`) in new rules. Lyric lines decide their own direction (`unicode-bidi: plaintext`, and `dir={lineDir(text)}` on wrappers that lay words out in a flex row).

## Checks

```
npm run check:a11y      static: unnamed buttons/inputs/images, clickable divs, non-modal dialogs, removed outlines
npm run check:i18n      translations: keys missing in a language, {placeholder} mismatches, hard-coded English
node scripts/check-i18n.mjs --hardcoded   list every hard-coded user-visible string
node scripts/check-i18n.mjs --strict      fail on hard-coded strings in the fully translated files
npx vite -c scripts/harness/vite.config.ts --port 5220 --strictPort
node scripts/ui-test/a11y-runtime.mjs --port=5220 [--vibes=neon,paper|all] [--shots=tmp/a11y]
```

The runtime check needs the harness running. It checks accessible names, Tab order, a focus indicator on every stop, Esc closing the Settings panel, 48 px targets on Android, `dir=rtl` overflow, forced-colors and reduced-motion smoke runs. Pass `--vibes=all` to repeat the fullscreen Tab walk in all 34 looks. Lyric contrast per look is checked by `scripts/ui-test/run.mjs`. There is no axe package in the repo (and no new dependency was added), so these scripts are narrower than axe.

Still manual: a real screen reader pass (NVDA on Windows, TalkBack on Android) and the Android font scale at 1.3 to 2.0.

## Translating

Where: `src/renderer/src/i18n.ts` (the helpers) and `src/renderer/src/locales/hi.ts`, `src/renderer/src/locales/gu.ts` (the words).

```tsx
const { t, tp, formatNumber, formatDate } = useTranslation()
t('Share a lyric card')                          // the key is the English sentence
t('Cleared {n} saved lookups', { n: count })     // values; numbers are formatted for the language
tp('{n} line', '{n} lines', count)               // plural by the language's rule, {n} is filled in
formatDate(timestamp)                            // Intl, per language
```

- English needs no entry. A key missing from a language falls back to English, so a half-translated screen still works.
- Use `useTranslation()` inside components so they re-render when the language changes. `translate` (exported) is for code outside React, such as toasts.
- Do not build a sentence from pieces in code: translators need the whole sentence. Where markup is in the middle (`<b>`, `<kbd>`), split into fragments that read right in order, as `Welcome.tsx` does.
- `{placeholders}` must be kept as they are in every language; `npm run check:i18n` and `src/renderer/src/i18n.test.ts` fail when they differ.
- To add a language: add a file in `src/renderer/src/locales/`, add it to `translations` and `LANGUAGES` in `i18n.ts` (with `dir: 'rtl'` for Arabic or Hebrew), add it to the `LOCALES` list in `scripts/check-i18n.mjs`, and add an `<option>` to the Language row in Settings.
- Lyrics are never translated; only the app's own words.

### Review status of the translations

| Language | File | Status |
|----------|------|--------|
| Hindi (hi) | `src/renderer/src/locales/hi.ts` | The first ~95 Settings strings were written earlier; the rest were added in the item 17 pass. **Machine-assisted, needs a native reader before release.** |
| Gujarati (gu) | `src/renderer/src/locales/gu.ts` | **Machine-assisted, not reviewed by a native speaker.** |

When a reviewer changes a string, edit it in the locale file and remove the "machine-assisted" note for that language here. Terms to decide on with a reviewer: moment (pal / પળ), vibe, room, karaoke, cache, queue.

### Plain-language rule for messages

Say what happened, say what Lyra is doing, say what the person can do. No internal words (API, bridge, rate limit, playerctl). Examples: "Spotify asked Lyra to slow down. Try again in a moment." and "No media player found. Open one and try again."
