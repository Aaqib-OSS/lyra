// Renderer performance probe: drives the harness in headless Chromium and reports, per scenario, the main-thread
// busy time (CDP TaskDuration / ScriptDuration / LayoutDuration / RecalcStyle), long tasks, frame cadence, JS heap,
// DOM nodes, running animations, setProperty / timer / rAF rates, and the time to first lyric paint.
//
//   npx vite -c scripts/harness/vite.config.ts --port 5217 --strictPort     (in another shell)
//   node scripts/perf/measure.mjs                       every scenario, writes perf-out/perf.json
//   node scripts/perf/measure.mjs --vibe=neon --secs=8   one vibe
//
// Headless Chromium has no GPU, so frame times and CPU are software-rendered: compare before/after on the SAME machine,
// do not read them as absolute numbers for a real PC or phone.
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]))
const PORT = Number(process.env.PERF_PORT ?? 5217)
const BASE = `http://localhost:${PORT}`
const SECS = Number(args.secs ?? 6)
const WARM = 2500

const VIBES = String(args.vibe ?? 'dusk,neon,cassette,arcade,journal,terminal').split(',')
const scenarios = [
  // idle: nothing plays (calm); playing: the usual fullscreen lyrics; light: the Light performance mode while playing
  { id: 'idle-full', q: 'mode=full&idle=1' },
  { id: 'paused-full', q: 'mode=full&paused=1' },
  { id: 'mini', q: 'mode=mini' },
  ...VIBES.map((v) => ({ id: `full-${v}`, q: `mode=full&s=${encodeURIComponent(JSON.stringify({ vibe: v }))}` })),
  { id: 'full-dusk-light', q: `mode=full&s=${encodeURIComponent(JSON.stringify({ vibe: 'dusk', performance: 'light' }))}` }
]

const INIT = `(() => {
  const c = (window.__perf = { intervals: 0, timeouts: 0, raf: 0, setProp: 0, long: 0, longMs: 0, frames: [], created: [] });
  const si = window.setInterval; window.setInterval = function (f, ms, ...a) { c.intervals++; c.created.push('i' + ms); return si.call(this, f, ms, ...a) };
  const st = window.setTimeout; window.setTimeout = function (f, ms, ...a) { c.timeouts++; return st.call(this, f, ms, ...a) };
  const raf = window.requestAnimationFrame; window.requestAnimationFrame = function (f) { c.raf++; return raf.call(this, f) };
  const sp = CSSStyleDeclaration.prototype.setProperty; CSSStyleDeclaration.prototype.setProperty = function (...a) { c.setProp++; return sp.apply(this, a) };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { c.long++; c.longMs += e.duration } }).observe({ entryTypes: ['longtask'] }) } catch {}
  let last = 0; const loop = (t) => { if (last) c.frames.push(t - last); last = t; raf.call(window, loop) }; raf.call(window, loop);
})()`

const metrics = async (cdp) => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))

async function run(browser, sc) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.addInitScript(INIT)
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Performance.enable')
  const t0 = Date.now()
  await page.goto(`${BASE}/?${sc.q}`)
  await page.waitForSelector('#root > *', { timeout: 15000 })
  const ready = Date.now() - t0
  const boot = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0]
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]
    return { domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: fcp ? Math.round(fcp.startTime) : null }
  })
  await page.waitForTimeout(WARM)
  const m0 = await metrics(cdp)
  await page.evaluate(() => { const p = window.__perf; p.intervals = p.timeouts = p.raf = p.setProp = p.long = p.longMs = 0; p.frames.length = 0 })
  await page.waitForTimeout(SECS * 1000)
  const m1 = await metrics(cdp)
  const r = await page.evaluate(() => {
    const p = window.__perf
    const f = p.frames.slice().sort((a, b) => a - b)
    const pick = (q) => (f.length ? Math.round(f[Math.min(f.length - 1, Math.floor(f.length * q))] * 10) / 10 : null)
    return {
      frames: f.length, p50: pick(0.5), p95: pick(0.95), max: pick(1),
      long: p.long, longMs: Math.round(p.longMs), intervalsCreated: p.intervals, timeoutsCreated: p.timeouts, rafCalls: p.raf, setProp: p.setProp,
      dom: document.getElementsByTagName('*').length, anims: document.getAnimations().length,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e5) / 10 : null
    }
  })
  const d = (k) => Math.round((m1[k] - m0[k]) * 1000)
  const out = {
    id: sc.id, bootMs: ready, ...boot,
    busyMsPerSec: Math.round(d('TaskDuration') / SECS), scriptMsPerSec: Math.round(d('ScriptDuration') / SECS),
    layoutMsPerSec: Math.round(d('LayoutDuration') / SECS), styleMsPerSec: Math.round(d('RecalcStyleDuration') / SECS),
    ...r,
    setPropPerSec: Math.round(r.setProp / SECS), rafPerSec: Math.round(r.rafCalls / SECS), timeoutsPerSec: Math.round(r.timeoutsCreated / SECS),
    errors
  }
  await ctx.close()
  return out
}

const browser = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] })
const results = []
for (const sc of scenarios) {
  if (args.only && !String(args.only).split(',').includes(sc.id)) continue
  const r = await run(browser, sc)
  results.push(r)
  console.log(JSON.stringify(r))
}
await browser.close()
mkdirSync(join(root, 'perf-out'), { recursive: true })
writeFileSync(join(root, 'perf-out', args.name ? `${args.name}.json` : 'perf.json'), JSON.stringify(results, null, 1))
console.log('\nid | busy ms/s | script | layout | style | long | p95 frame | anims | dom | heap MB | setProp/s | raf/s')
for (const r of results) console.log([r.id, r.busyMsPerSec, r.scriptMsPerSec, r.layoutMsPerSec, r.styleMsPerSec, r.long, r.p95, r.anims, r.dom, r.heapMB, r.setPropPerSec, r.rafPerSec].join(' | '))
