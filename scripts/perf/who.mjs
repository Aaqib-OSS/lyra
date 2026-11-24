// Who writes CSS variables / requests frames / starts timers? node scripts/perf/who.mjs "mode=full&paused=1" [secs]
import { chromium } from 'playwright'
const BASE = `http://localhost:${process.env.PERF_PORT ?? 5217}`
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage()
await page.addInitScript(`(() => {
  const agg = (window.__who = {});
  const where = () => { const l = (new Error().stack || '').split('\\n').slice(3, 6).map((s) => s.replace(/https?:\\/\\/[^/]+/, '').replace(/\\?t=\\d+/, '').trim()); return l.join(' < ') };
  const bump = (k) => { agg[k] = (agg[k] || 0) + 1 };
  const sp = CSSStyleDeclaration.prototype.setProperty; CSSStyleDeclaration.prototype.setProperty = function (n, ...a) { if (window.__on) bump('setProp ' + n + ' @ ' + where()); return sp.call(this, n, ...a) };
  const raf = window.requestAnimationFrame; window.requestAnimationFrame = function (f) { if (window.__on) bump('raf @ ' + where()); return raf.call(this, f) };
  const st = window.setTimeout; window.setTimeout = function (f, ms, ...a) { if (window.__on) bump('timeout ' + ms + ' @ ' + where()); return st.call(this, f, ms, ...a) };
  const si = window.setInterval; window.setInterval = function (f, ms, ...a) { bump('interval ' + ms + ' @ ' + where()); return si.call(this, f, ms, ...a) };
})()`)
await page.goto(`${BASE}/?${process.argv[2] ?? 'mode=full'}`)
await page.waitForTimeout(3000)
await page.evaluate(() => { window.__on = true; for (const k of Object.keys(window.__who)) if (!k.startsWith('interval')) delete window.__who[k] })
const secs = Number(process.argv[3] ?? 4)
await page.waitForTimeout(secs * 1000)
const w = await page.evaluate(() => window.__who)
for (const [k, v] of Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(String(v).padStart(5), k.slice(0, 230))
await browser.close()
