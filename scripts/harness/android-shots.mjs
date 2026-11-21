// Android layout screenshots from the browser harness.
//   node scripts/harness/android-shots.mjs --port=5401 --vibes=neon,chrome --sizes=pp,pl,tab --out=tmp/shots [--q="video=night"] [--panel=settings]
// sizes: pp phone portrait 360x800, pb 412x915, ps small 360x640, pl phone landscape 800x360, tp tablet portrait 800x1280, tl tablet landscape 1280x800
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split(/=(.*)/s)).map(([k, v]) => [k, v ?? true]))
const PORT = Number(args.port ?? 5401)
const OUT = join(root, String(args.out ?? 'tmp/shots'))
mkdirSync(OUT, { recursive: true })
const src = readFileSync(join(root, 'src/shared/vibes.ts'), 'utf8')
const all = [...src.matchAll(/\{ id: '(\w+)', layout: '\w+'/g)].map((m) => m[1])
const vibes = args.vibes && args.vibes !== 'all' ? String(args.vibes).split(',') : all
const SIZES = { pp: [360, 800], pb: [412, 915], ps: [360, 640], pl: [800, 360], tp: [800, 1280], tl: [1280, 800] }
const sizes = String(args.sizes ?? 'pp,pl,tp').split(',')
const extra = args.q ? `&${args.q}` : ''
const panel = args.panel ? `&panel=${args.panel}` : ''
const browser = await chromium.launch()
for (const sz of sizes) {
  const [w, h] = SIZES[sz]
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true })
  for (const v of vibes) {
    const page = await ctx.newPage()
    const s = encodeURIComponent(JSON.stringify({ vibe: v, vibeMode: 'fixed' }))
    await page.goto(`http://localhost:${PORT}/?android=1&mode=mini&s=${s}${extra}${panel}`)
    await page.waitForTimeout(Number(args.wait ?? 2200))
    await page.screenshot({ path: join(OUT, `${v}-${sz}${args.tag ? '-' + args.tag : ''}.png`) })
    // report touch targets under 44px and horizontal overflow
    const bad = await page.evaluate(() => {
      const out = []
      document.querySelectorAll('button, [role=button], a, input, [role=switch]').forEach((e) => {
        const r = e.getBoundingClientRect()
        const cs = getComputedStyle(e)
        if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') return
        if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) return
        if (r.width < 44 || r.height < 44) out.push(`${(e.getAttribute('aria-label') || e.className || e.tagName).toString().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`)
      })
      const sw = document.documentElement.scrollWidth > innerWidth + 1 ? `hscroll ${document.documentElement.scrollWidth}` : ''
      return { small: out, sw }
    })
    if (bad.small.length || bad.sw) console.log(v, sz, bad.sw, bad.small.join(' | '))
    await page.close()
  }
  await ctx.close()
}
await browser.close()
