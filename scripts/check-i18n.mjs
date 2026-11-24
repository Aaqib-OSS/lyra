// Translation check for the renderer.
//   node scripts/check-i18n.mjs              coverage report; exit 1 if a locale lacks a key that code uses
//   node scripts/check-i18n.mjs --hardcoded  also list user-visible strings that are not wrapped in t()
//   node scripts/check-i18n.mjs --strict     exit 1 on hard-coded strings in files listed in STRICT_FILES
// Keys are the English sentence itself: t('Share a lyric card'). English needs no entry; a missing
// entry in another language falls back to English at runtime, but this script makes the gap visible.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const src = join(root, 'src', 'renderer', 'src')
const LOCALES = ['hi', 'gu']
// Files that are fully translated: hard-coded strings in them fail --strict.
const STRICT_FILES = new Set(['components/ShareCard.tsx', 'components/Welcome.tsx', 'components/Controls.tsx', 'components/Toasts.tsx', 'components/RecordDialog.tsx'])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.tsx') && !name.endsWith('.test.tsx')) out.push(p)
  }
  return out
}

const unescape = (s) => s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n')

// ---- keys used in code: t('...'), t("..."), tp('...', '...', n)
const used = new Map() // key -> first file:line
const hard = []
for (const file of walk(src)) {
  const text = readFileSync(file, 'utf8')
  const rel = relative(src, file).replace(/\\/g, '/')
  const lineOf = (i) => text.slice(0, i).split('\n').length
  for (const m of text.matchAll(/\b(?:t|translate)\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    if (m[1] === '`' && m[2].includes('${')) continue
    const k = unescape(m[2])
    if (!used.has(k)) used.set(k, `${rel}:${lineOf(m.index)}`)
  }
  for (const m of text.matchAll(/\btp\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*,\s*(['"])((?:\\.|(?!\3)[^\\])*)\3/g)) {
    for (const k of [unescape(m[2]), unescape(m[4])]) if (!used.has(k)) used.set(k, `${rel}:${lineOf(m.index)}`)
  }
  // ---- hard-coded: JSX text and label-like attributes
  const code = text.replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, (_, a) => a)
  for (const m of code.matchAll(/>([^<>{}=]*[A-Za-z]{2,}[^<>{}]*)</g)) {
    const s = m[1].replace(/\s+/g, ' ').trim()
    if (!s || /^[\w.-]+$/.test(s) && s.length < 3) continue
    if (/\b(const|return|function|import|export|=>|\)\s*\{)/.test(s)) continue // TypeScript generics, not JSX
    hard.push({ file: rel, line: lineOf(m.index + 1), text: s })
  }
  for (const m of code.matchAll(/\b(aria-label|title|placeholder|alt)=("([^"{}]*[A-Za-z]{2,}[^"{}]*)"|'([^'{}]*[A-Za-z]{2,}[^'{}]*)')/g)) {
    hard.push({ file: rel, line: lineOf(m.index), text: `${m[1]}="${m[3] ?? m[4]}"` })
  }
}

// ---- locale files
const locales = {}
for (const l of LOCALES) {
  const text = readFileSync(join(src, 'locales', `${l}.ts`), 'utf8')
  const dict = new Map()
  for (const m of text.matchAll(/^\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")\s*:\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`([^`]*)`)\s*,?\s*$/gm)) {
    dict.set(unescape(m[1] ?? m[2]), unescape(m[3] ?? m[4] ?? m[5]))
  }
  locales[l] = dict
}

let bad = 0
for (const l of LOCALES) {
  const missing = [...used].filter(([k]) => !locales[l].has(k))
  const stale = [...locales[l].keys()].filter((k) => !used.has(k))
  const placeholders = [...locales[l]].filter(([k, v]) => {
    const a = (k.match(/\{\w+\}/g) ?? []).sort().join()
    const b = (v.match(/\{\w+\}/g) ?? []).sort().join()
    return a !== b
  })
  console.log(`${l}: ${locales[l].size} entries, ${used.size - missing.length}/${used.size} keys used in code are translated`)
  for (const [k, where] of missing) console.log(`  MISSING ${where}  ${JSON.stringify(k).slice(0, 90)}`)
  for (const [k] of placeholders) console.log(`  PLACEHOLDER MISMATCH ${JSON.stringify(k).slice(0, 90)}`)
  if (stale.length) console.log(`  ${stale.length} entries not referenced by a literal t() call (fine if used dynamically)`)
  bad += missing.length + placeholders.length
}

const byFile = new Map()
for (const h of hard) byFile.set(h.file, (byFile.get(h.file) ?? 0) + 1)
console.log(`\nhard-coded user-visible strings: ${hard.length} in ${byFile.size} files`)
for (const [f, n] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${String(n).padStart(4)}  ${f}`)
if (process.argv.includes('--hardcoded')) for (const h of hard) console.log(`  ${h.file}:${h.line}  ${h.text.slice(0, 100)}`)
const strict = process.argv.includes('--strict') ? hard.filter((h) => STRICT_FILES.has(h.file)) : []
for (const h of strict) console.log(`STRICT ${h.file}:${h.line}  ${h.text.slice(0, 100)}`)
process.exit(bad || strict.length ? 1 : 0)
