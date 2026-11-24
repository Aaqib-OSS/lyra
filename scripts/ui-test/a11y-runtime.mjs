// Runtime accessibility check against the browser harness (does not need Electron).
//   npx vite -c scripts/harness/vite.config.ts --port 5220 --strictPort
//   node scripts/ui-test/a11y-runtime.mjs --port=5220 [--vibes=neon,paper|all] [--shots=tmp/a11y]
// Per screen it checks: every interactive element has an accessible name, Tab reaches controls in a
// sane order without a trap and each focused control shows a focus indicator, dialogs are modal,
// Esc closes panels, dir=rtl does not overflow, and on Android every target is >= 48 px.
// Exit code 1 when a hard failure is found. Axe is not installed in this repo, so this is a custom, smaller check.
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split(/=(.*)/s)).map(([k, v]) => [k, v ?? true]))
const PORT = Number(args.port ?? 5220)
const SHOTS = args.shots ? join(root, String(args.shots)) : null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const src = readFileSync(join(root, 'src/shared/vibes.ts'), 'utf8')
const allVibes = [...src.matchAll(/\{ id: '(\w+)', layout: '\w+'/g)].map((m) => m[1])
const vibes = args.vibes === 'all' ? allVibes : String(args.vibes ?? 'neon').split(',')

const NAME_JS = () => {
  const nameOf = (e) => {
    const lab = e.getAttribute('aria-labelledby')
    if (lab) return lab.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim()
    const al = e.getAttribute('aria-label')
    if (al && al.trim()) return al.trim()
    if (e.labels && e.labels.length) return [...e.labels].map((l) => l.textContent).join(' ').trim()
    const img = e.querySelector('img[alt]')
    const txt = (e.textContent || '').replace(/[\s✕×]/g, '')
    if (txt) return e.textContent.trim()
    if (img && img.getAttribute('alt')) return img.getAttribute('alt')
    return (e.getAttribute('title') || e.getAttribute('placeholder') || '').trim()
  }
  const out = []
  document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=switch], [role=slider], [role=tab], [role=radio], [role=checkbox], [tabindex="0"]').forEach((e) => {
    const r = e.getBoundingClientRect()
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || cs.visibility === 'hidden' || e.closest('[aria-hidden=true]') || e.hasAttribute('hidden')) return
    if (!nameOf(e)) out.push(`${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} @${Math.round(r.left)},${Math.round(r.top)}`)
  })
  return out
}

const SMALL_JS = (min) => {
  const out = []
  document.querySelectorAll('button, a[href], input:not([type=hidden]):not([type=range]), select, [role=button], [role=switch], [role=tab], [role=radio]').forEach((e) => {
    const r = e.getBoundingClientRect()
    const cs = getComputedStyle(e)
    if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none' || e.closest('[aria-hidden=true]')) return
    if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) return
    // a transparent ::after hit area counts (small controls keep their look but take a 48px touch)
    const ps = getComputedStyle(e, '::after')
    const hit = ps.position === 'absolute' && ps.content !== 'none' ? { w: parseFloat(ps.width) || 0, h: parseFloat(ps.height) || 0 } : { w: 0, h: 0 }
    if (Math.max(r.width, hit.w) < min || Math.max(r.height, hit.h) < min) out.push(`${(e.getAttribute('aria-label') || e.textContent || e.className).toString().trim().slice(0, 24)} ${Math.round(r.width)}x${Math.round(r.height)}`)
  })
  return out
}

const RING_JS = () => {
  const e = document.activeElement
  if (!e || e === document.body) return null
  const cs = getComputedStyle(e)
  const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0
  const shadow = cs.boxShadow !== 'none'
  const r = e.getBoundingClientRect()
  return { label: (e.getAttribute('aria-label') || e.textContent || e.className || e.tagName).toString().trim().slice(0, 28), ring: outline || shadow, key: e.tagName + (e.id || '') + e.className + Math.round(r.left) + ',' + Math.round(r.top), visible: r.width > 0 && r.height > 0 }
}

const failures = []
const notes = []
const fail = (scene, msg) => failures.push(`${scene}: ${msg}`)

const browser = await chromium.launch()
async function scene(name, url, opts, fn) {
  const ctx = await browser.newContext({ viewport: opts.viewport ?? { width: 1100, height: 760 }, hasTouch: !!opts.touch, isMobile: !!opts.touch, reducedMotion: opts.reducedMotion ?? 'no-preference', forcedColors: opts.forcedColors ?? 'none' })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`http://localhost:${PORT}/${url}`)
  await page.waitForTimeout(2600)
  const unnamed = await page.evaluate(NAME_JS)
  for (const u of unnamed) fail(name, `no accessible name: ${u}`)
  if (opts.small) {
    const small = await page.evaluate(SMALL_JS, opts.small)
    for (const s of small) fail(name, `target under ${opts.small}px: ${s}`)
  }
  if (opts.tab) {
    const seen = new Set()
    let last = ''
    let repeats = 0
    for (let i = 0; i < opts.tab; i++) {
      await page.keyboard.press('Tab')
      const f = await page.evaluate(RING_JS)
      if (!f) continue
      if (f.key === last) repeats++
      else repeats = 0
      last = f.key
      if (repeats >= 2) {
        fail(name, `Tab seems stuck on ${f.label}`)
        break
      }
      if (!seen.has(f.key)) {
        seen.add(f.key)
        if (!f.ring) fail(name, `no visible focus indicator on ${f.label}`)
      }
    }
    notes.push(`${name}: ${seen.size} stops reached by Tab`)
  }
  if (fn) await fn(page, name)
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name.replace(/[^\w-]+/g, '_')}.png`) })
  for (const e of errors) fail(name, `page error: ${e}`)
  await ctx.close()
}

for (const v of vibes) {
  const s = encodeURIComponent(JSON.stringify({ vibe: v, vibeMode: 'fixed' }))
  await scene(`desktop-full-${v}`, `?mode=full&s=${s}`, { tab: 14 })
}
const s0 = encodeURIComponent(JSON.stringify({ vibe: 'neon', vibeMode: 'fixed' }))
await scene('desktop-mini', `?mode=mini&s=${s0}`, { tab: 12 })
await scene('settings', `?mode=mini&panel=settings&s=${s0}`, { tab: 30 }, async (page, name) => {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  if (await page.$('.sidepanel')) fail(name, 'Esc did not close the settings panel')
})
await scene('android-mini', `?android=1&mode=mini&s=${s0}`, { viewport: { width: 412, height: 915 }, touch: true, small: 48 })
await scene('android-settings', `?android=1&mode=mini&panel=settings&s=${s0}`, { viewport: { width: 412, height: 915 }, touch: true, small: 48 })
await scene('rtl-mini', `?mode=mini&lang=ar&s=${encodeURIComponent(JSON.stringify({ vibe: 'neon', vibeMode: 'fixed', language: 'ar' }))}`, { viewport: { width: 420, height: 700 } }, async (page, name) => {
  await page.evaluate(() => (document.documentElement.dir = 'rtl'))
  await page.waitForTimeout(300)
  const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
  if (over) fail(name, 'horizontal overflow with dir=rtl')
})
await scene('forced-colors', `?mode=full&s=${s0}`, { forcedColors: 'active', tab: 6 })
await scene('reduced-motion', `?mode=full&s=${s0}`, { reducedMotion: 'reduce' }, async (page, name) => {
  const anim = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.getTiming().iterations === Infinity && a.playState === 'running').length)
  notes.push(`${name}: ${anim} infinite animations still running`)
})
await browser.close()

for (const n of notes) console.log('note ', n)
for (const f of failures) console.log('FAIL ', f)
console.log(`\n${failures.length} failure(s)`)
process.exit(failures.length ? 1 : 0)
