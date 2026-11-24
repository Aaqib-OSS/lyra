// Startup cost of a production renderer build: node scripts/perf/startup.mjs <out/renderer dir> [runs]
// Serves the built folder, loads it in fresh headless contexts with a stub window.lyra (so nothing waits on Electron) and reports
// the median of: load event, main-thread script time, total main-thread task time until 1.5 s after load. Compile + evaluate of the
// startup script dominates, so this tracks bundle size and splitting. Run it on two builds on the same machine to compare.
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

const dir = resolve(process.argv[2] ?? 'out/renderer')
const runs = Number(process.argv[3] ?? 7)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png' }
const srv = createServer((req, res) => {
  const p = join(dir, decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/$/, '/index.html'))
  if (!existsSync(p)) return res.writeHead(404).end()
  res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' }).end(readFileSync(p))
}).listen(0)
const port = srv.address().port
const browser = await chromium.launch()
const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)]
const rows = []
for (let i = 0; i < runs; i++) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  const page = await ctx.newPage()
  page.on('pageerror', () => {})
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Performance.enable')
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]))
  const load = await page.evaluate(() => Math.round(performance.getEntriesByType('navigation')[0].loadEventEnd))
  const res = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => /\.(js|css)$/.test(r.name)).length)
  rows.push({ load, script: Math.round(m.ScriptDuration * 1000), task: Math.round(m.TaskDuration * 1000), res })
  await ctx.close()
}
console.log(JSON.stringify({ dir, runs, loadMs: med(rows.map((r) => r.load)), scriptMs: med(rows.map((r) => r.script)), taskMs: med(rows.map((r) => r.task)), startupJsCssFiles: rows[0].res }))
await browser.close()
srv.close()
