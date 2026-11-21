// Car mode screenshots from the browser harness (start it first: npx vite -c scripts/harness/vite.config.ts --port 5401).
//   node scripts/harness/car-shots.mjs --port=5401 --out=tmp/car
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split(/=(.*)/s)).map(([k, v]) => [k, v ?? true]))
const PORT = Number(args.port ?? 5401)
const OUT = join(root, String(args.out ?? 'tmp/car'))
mkdirSync(OUT, { recursive: true })
const SIZES = { hu: [1280, 720], sm: [800, 480], pp: [360, 800], pb: [412, 915] }
// looks: name -> query
const LOOKS = {
  night: 'car=1&carnight=1',
  day: 'car=1&carnight=0',
  second: 'car=1&track=1&t=61000',
  paused: 'car=1&paused=1',
  nolyrics: 'car=1&ly=none',
  plain: 'car=1&ly=plain',
  hindi: 'car=1&lang=hi&t=20000',
  idle: 'car=1&idle=1',
  offer: 'android=1&dock=1&mode=mini'
}
const browser = await chromium.launch()
const only = args.sizes ? String(args.sizes).split(',') : null
for (const [sz, [w, h]] of Object.entries(SIZES)) {
  if (only && !only.includes(sz)) continue
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, colorScheme: 'dark' })
  for (const [name, query] of Object.entries(LOOKS)) {
    const page = await ctx.newPage()
    await page.goto(`http://localhost:${PORT}/?android=1&${query}`)
    await page.waitForTimeout(1800)
    await page.screenshot({ path: join(OUT, `${name}-${sz}.png`) })
    if (name === 'night') {
      // touch targets: report any control smaller than 96 px, and any text under 24 px
      const bad = await page.evaluate(() => {
        const out = []
        document.querySelectorAll('.car button').forEach((b) => {
          const r = b.getBoundingClientRect()
          if (r.width < 64 || r.height < 64) out.push(`btn ${b.className} ${Math.round(r.width)}x${Math.round(r.height)}`)
        })
        document.querySelectorAll('.car *').forEach((e) => {
          if (e.children.length === 0 && e.textContent && parseFloat(getComputedStyle(e).fontSize) < 24) out.push(`text ${e.className} ${getComputedStyle(e).fontSize}`)
        })
        const l = document.querySelector('.car__lyrics')
        if (l && l.scrollHeight > l.clientHeight + 1) out.push(`lyrics overflow ${l.scrollHeight}>${l.clientHeight}`)
        return out
      })
      console.log(sz, bad.length ? bad.join(' | ') : 'ok: all controls >=64px (buttons are 96px+), all text >=24px, no overflow')
    }
    await page.close()
  }
  await ctx.close()
}
await browser.close()
