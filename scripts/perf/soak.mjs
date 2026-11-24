// Memory growth probe: node scripts/perf/soak.mjs "mode=full" 60
// Samples JS heap (after a forced GC), DOM nodes and event listeners every 5 s; a steady app stays flat.
import { chromium } from 'playwright'
const BASE = `http://localhost:${process.env.PERF_PORT ?? 5217}`
const secs = Number(process.argv[3] ?? 60)
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } })
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await page.goto(`${BASE}/?${process.argv[2] ?? 'mode=full'}`)
await page.waitForTimeout(3000)
const rows = []
for (let t = 0; t <= secs; t += 5) {
  await cdp.send('HeapProfiler.collectGarbage')
  const c = await cdp.send('Memory.getDOMCounters')
  const heap = await cdp.send('Runtime.getHeapUsage')
  rows.push({ t, heapMB: +(heap.usedSize / 1e6).toFixed(2), nodes: c.nodes, listeners: c.jsEventListeners })
  await page.waitForTimeout(5000)
}
for (const r of rows) console.log(JSON.stringify(r))
const a = rows[1], b = rows[rows.length - 1]
console.log(`growth ${(b.heapMB - a.heapMB).toFixed(2)} MB, nodes ${b.nodes - a.nodes}, listeners ${b.listeners - a.listeners} over ${b.t - a.t} s`)
await browser.close()
