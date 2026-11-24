// Small static accessibility check for the renderer (no browser needed).
//   node scripts/check-a11y.mjs          report everything, exit 1 on any ERROR
//   node scripts/check-a11y.mjs --json   machine readable
// It reads JSX opening tags and flags: icon-only buttons with no name, inputs with no label,
// images with no alt, click handlers on non-interactive elements, dialogs that are not modal,
// and CSS that removes the focus outline. It is a lint, not a replacement for a screen reader.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const src = join(root, 'src', 'renderer', 'src')

function walk(dir, ext, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, ext, out)
    else if (ext.some((e) => name.endsWith(e)) && !name.endsWith('.test.tsx')) out.push(p)
  }
  return out
}

/** Yields { name, attrs, line, end } for each JSX opening tag, handling nested braces. */
function* tags(text) {
  const re = /<([A-Za-z][\w.]*)(?=[\s/>])/g
  let m
  while ((m = re.exec(text))) {
    let i = m.index + m[0].length
    let depth = 0
    let quote = ''
    for (; i < text.length; i++) {
      const c = text[i]
      if (quote) {
        if (c === quote && text[i - 1] !== '\\') quote = ''
      } else if (c === '"' || c === "'" || (c === '`' && depth > 0)) quote = c
      else if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0 && text[i - 1] !== '=') break
    }
    const attrs = text.slice(m.index + m[0].length, i)
    // skip TypeScript generics such as useState<string>(...)
    if (/^[A-Z]?[a-z]/.test(m[1]) || /^[A-Z]/.test(m[1])) {
      const before = text[m.index - 1]
      if (before && /[\w)]/.test(before)) continue
      yield { start: m.index, name: m[1], attrs, line: text.slice(0, m.index).split('\n').length, end: i }
    }
  }
}

const has = (attrs, a) => new RegExp(`(^|\\s)${a}(=|\\s|$|/)`).test(attrs)
const findings = []
const add = (severity, file, line, rule, msg) => findings.push({ severity, file: relative(root, file).replace(/\\/g, '/'), line, rule, msg })

for (const file of walk(src, ['.tsx'])) {
  const text = readFileSync(file, 'utf8')
  for (const t of tags(text)) {
    const inner = text.slice(t.end + 1, text.indexOf('</' + t.name, t.end))
    const selfClosing = text[t.end - 1] === '/'
    const named = has(t.attrs, 'aria-label') || has(t.attrs, 'aria-labelledby') || has(t.attrs, 'title')
    if (t.name === 'button' && !selfClosing && !named) {
      const visible = inner.replace(/<[^>]*>/g, '').replace(/\{[^}]*\}/g, (s) => (/[A-Za-z]/.test(s) ? 'x' : '')).replace(/[✕×▶⏸⏮⏭←→↑↓•·\s]/g, '')
      if (visible.length === 0) add('ERROR', file, t.line, 'button-name', 'icon-only <button> has no aria-label or title')
    }
    if (t.name === 'input' && !/type=["'](hidden|submit|button)["']/.test(t.attrs) && !named && !has(t.attrs, 'id')) {
      const before = text.slice(Math.max(0, t.start - 400), t.start)
      if (!/<label[^>]*>(?:(?!<\/label>)[\s\S])*$/.test(before)) add('ERROR', file, t.line, 'input-label', '<input> has no aria-label, id/label pair or wrapping <label>')
    }
    if ((t.name === 'select' || t.name === 'textarea') && !named && !has(t.attrs, 'id')) {
      const before = text.slice(Math.max(0, t.start - 400), t.start)
      if (!/<label[^>]*>(?:(?!<\/label>)[\s\S])*$/.test(before)) add('WARN', file, t.line, 'field-label', `<${t.name}> has no accessible name`)
    }
    if (t.name === 'img' && !has(t.attrs, 'alt')) add('ERROR', file, t.line, 'img-alt', '<img> has no alt (use alt="" when decorative)')
    if ((t.name === 'div' || t.name === 'span' || t.name === 'li') && has(t.attrs, 'onClick') && !has(t.attrs, 'role') && !has(t.attrs, 'aria-hidden')) {
      add('WARN', file, t.line, 'click-on-static', `<${t.name}> has onClick but no role or key handling (not keyboard reachable)`)
    }
    if (/role=["']dialog["']/.test(t.attrs) && !has(t.attrs, 'aria-modal')) add('WARN', file, t.line, 'dialog-modal', 'role="dialog" without aria-modal (is it modal? then add aria-modal and useDialog)')
    if (/role=["']dialog["']/.test(t.attrs) && !named) add('ERROR', file, t.line, 'dialog-name', 'dialog has no accessible name')
    if (t.name === 'a' && !named && inner.replace(/<[^>]*>/g, '').trim() === '') add('ERROR', file, t.line, 'link-name', 'link has no text or label')
  }
}

for (const file of walk(src, ['.css'])) {
  const css = readFileSync(file, 'utf8')
  const lines = css.split('\n')
  lines.forEach((l, i) => {
    if (!/outline:\s*(none|0)\b/.test(l)) return
    // find the selector of this rule
    let j = i
    while (j > 0 && !lines[j].includes('{')) j--
    const sel = lines[j]
    if (/focus-visible|::|:hover/.test(sel)) return
    if (/(border|box-shadow|background)/.test(lines.slice(i - 3, i + 6).join(' '))) return
    add('INFO', file, i + 1, 'outline-none', `outline removed on ${sel.trim().slice(0, 60)}: check a focus style exists`)
  })
}

if (process.argv.includes('--json')) console.log(JSON.stringify(findings, null, 2))
else {
  for (const f of findings) console.log(`${f.severity.padEnd(5)} ${f.file}:${f.line} [${f.rule}] ${f.msg}`)
  const n = (s) => findings.filter((f) => f.severity === s).length
  console.log(`\n${n('ERROR')} errors, ${n('WARN')} warnings, ${n('INFO')} info`)
}
process.exit(findings.some((f) => f.severity === 'ERROR') ? 1 : 0)
