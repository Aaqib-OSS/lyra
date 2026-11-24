// Fast per-look system check (no screenshots): does every look honour the global switches?
//   node scripts/ui-test/looks-check.mjs [--vibe=neon,chrome] [--port=5212] [--size=1366x768]
// Needs the harness on --port (a dev server, or `vite preview` of a harness build). For each look it loads the full-screen scene and
// verifies, in a real browser (document.getAnimations() also sees ::before / ::after animations):
//   calm      (nothing playing)           -> no endless animation is running
//   motion    (Reduce motion on, playing) -> no endless animation is running
//   light     (Light performance mode)    -> no endless animation, no backdrop-filter anywhere (pseudo-elements included)
//   rim off   (playing)                   -> EdgeFx writes no --lp/--li/--lt/--lv/--ts on <html> unless the look's fx layer reads them
//   forced    (forced-colors: active)     -> the page still renders and shows a lyric element
// The three global switches are plain <html> attributes (data-calm, data-motion, data-perf) flipped in place, so one page load per
// look covers them. Contrast and clipping per look are run.mjs's job (--vibe=x --quick); this covers what that does not.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true] }))
const PORT = Number(args.port ?? process.env.UI_PORT ?? 5212)
const BASE = `http://localhost:${PORT}`
const [W, H] = String(args.size ?? '1366x768').split('x').map(Number)
const vibesSrc = readFileSync(join(root, 'src/shared/vibes.ts'), 'utf8')
const ALL = [...vibesSrc.matchAll(/\{ id: '(\w+)', layout: '\w+', style: '(\w+)'/g)].map((m) => ({ id: m[1], style: m[2] }))
const vibes = args.vibe ? ALL.filter((v) => String(args.vibe).split(',').includes(v.id)) : ALL
// looks whose fx layer reads the song variables even with the rim off (src/renderer/src/lib/edgeVars.ts FX_VIBES)
const READS_VARS = new Set(['cassette', 'dusk', 'flap', 'lens', 'trailer', 'wallet', 'glitch', 'route'])

const ENDLESS = () => {
  const name = (a) => {
    const t = a.effect?.target
    const pe = a.effect?.pseudoElement ?? ''
    const cls = t && typeof t.className === 'string' && t.className.trim() ? '.' + t.className.trim().split(/\s+/)[0] : ''
    return `${t ? t.tagName.toLowerCase() : '?'}${cls}${pe}:${a.animationName ?? ''}`
  }
  return document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity).map(name)
}
const BLUR = () => {
  const hits = []
  for (const el of document.querySelectorAll('*')) {
    for (const pe of [null, '::before', '::after']) {
      const c = getComputedStyle(el, pe)
      const b = c.backdropFilter || c.webkitBackdropFilter
      if (b && b !== 'none') hits.push(`${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/)[0] ?? ''}${pe ?? ''}`)
    }
  }
  return hits
}

const browser = await chromium.launch()
const problems = []
let checked = 0
async function load(ctx, v, settings, query = '') {
  const page = await ctx.newPage()
  await page.setViewportSize({ width: W, height: H })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)))
  const s = encodeURIComponent(JSON.stringify({ vibe: v.id, lyricStyle: v.style, performance: 'smooth', vibeMode: 'fixed', ...settings }))
  await page.goto(`${BASE}/?mode=full&vs=none&t=43500&${query}&s=${s}`)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(900)
  return { page, errors }
}
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

for (const v of vibes) {
  const ctx = await browser.newContext({ deviceScaleFactor: 1 })
  const fail = (what, list) => { if (list.length) problems.push(`${v.id}: ${what}: ${[...new Set(list)].slice(0, 6).join(', ')}${new Set(list).size > 6 ? ' ...' : ''}`) }
  const { page, errors } = await load(ctx, v, {})
  fail('page error', errors)
  // the app re-writes data-calm (player updates) and data-motion / data-perf (settings) itself: an observer keeps what the test set
  await page.evaluate(() => {
    const html = document.documentElement
    window.__want = {}
    const apply = () => {
      for (const [k, v] of Object.entries(window.__want)) {
        if (v === null) { if (k in html.dataset) delete html.dataset[k] } else if (html.dataset[k] !== v) html.dataset[k] = v
      }
    }
    new MutationObserver(apply).observe(html, { attributes: true })
  })
  const flip = async (attr, on, value = '') => {
    await page.evaluate(([a, o, val]) => {
      window.__want[a] = o ? val : null
      if (o) document.documentElement.dataset[a] = val
      else delete document.documentElement.dataset[a]
    }, [attr, on, value])
    await frame(page)
  }
  await flip('calm', true)
  fail('calm: endless animation still running', await page.evaluate(ENDLESS))
  await flip('calm', false)
  await flip('motion', true, 'off')
  fail('reduced motion: endless animation still running', await page.evaluate(ENDLESS))
  await flip('motion', true, 'on')
  await flip('perf', true, 'low')
  fail('light: endless animation still running', await page.evaluate(ENDLESS))
  fail('light: backdrop-filter still on', await page.evaluate(BLUR))
  await page.close()

  // rim off, playing
  const r2 = await load(ctx, v, {})
  await r2.page.evaluate(() => { document.documentElement.dataset.rim = 'off' })
  await r2.page.waitForTimeout(400)
  const vars = await r2.page.evaluate(() => ['--lp', '--li', '--lt', '--lv', '--ts'].filter((k) => document.documentElement.style.getPropertyValue(k) !== ''))
  if (vars.length && !READS_VARS.has(v.id)) problems.push(`${v.id}: rim off but EdgeFx wrote ${vars.join(',')} on <html>`)
  await r2.page.close()

  // forced colors
  const fp = await ctx.newPage()
  await fp.emulateMedia({ forcedColors: 'active' })
  await fp.setViewportSize({ width: W, height: H })
  const errs = []
  fp.on('pageerror', (e) => errs.push(e.message.slice(0, 120)))
  await fp.goto(`${BASE}/?mode=full&vs=none&paused=1&t=43500&s=${encodeURIComponent(JSON.stringify({ vibe: v.id, lyricStyle: v.style, vibeMode: 'fixed' }))}`)
  await fp.waitForFunction(() => [...document.querySelectorAll('[class*="lyric"], [class*="stage"]')].some((e) => (e.textContent ?? '').trim().length > 3), null, { timeout: 8000 }).catch(() => {})
  await fp.waitForTimeout(900)
  const seen = await fp.evaluate(() => {
    const el = [...document.querySelectorAll('[class*="lyric"], [class*="sign"], [class*="stage"], [class*="lfb"], [class*="plain"], [class*="bk-"], [class*="bub"]')].find((e) => (e.textContent ?? '').trim().length > 3)
    if (!el) return 'no lyric element'
    const b = el.getBoundingClientRect()
    const c = getComputedStyle(el)
    return b.width > 4 && b.height > 4 && c.visibility !== 'hidden' && c.opacity !== '0' ? '' : 'lyric not visible'
  })
  if (seen) problems.push(`${v.id}: forced-colors: ${seen}`)
  fail('forced-colors page error', errs)
  await ctx.close()
  checked++
  process.stdout.write('.')
}
await browser.close()
console.log(`\nlooks-check: ${checked} looks, ${problems.length} problem${problems.length === 1 ? '' : 's'}`)
for (const p of problems) console.log('  ' + p)
process.exit(problems.length ? 1 : 0)
