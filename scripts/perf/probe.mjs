// Lists what is animating / ticking on one harness page: node scripts/perf/probe.mjs "mode=full&idle=1"
import { chromium } from 'playwright'
const BASE = `http://localhost:${process.env.PERF_PORT ?? 5217}`
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage()
await page.goto(`${BASE}/?${process.argv[2] ?? 'mode=full'}`)
await page.waitForTimeout(3500)
const r = await page.evaluate(() => {
  const by = {}
  for (const a of document.getAnimations()) {
    const t = a.effect?.target
    const props = [...new Set((a.effect?.getKeyframes?.() ?? []).flatMap((k) => Object.keys(k)).filter((k) => !['offset','easing','composite','computedOffset'].includes(k)))].join(','); const key = `${a.animationName ?? a.constructor.name} (${props}) on ${t?.tagName?.toLowerCase()}.${String(t?.className ?? '').toString().slice(0, 40)} [${a.playState}]`
    by[key] = (by[key] ?? 0) + 1
  }
  const root = document.documentElement.dataset
  return { dataset: { calm: root.calm, perf: root.perf, vibe: root.vibe }, by }
})
console.log(JSON.stringify(r, null, 1))
await browser.close()
