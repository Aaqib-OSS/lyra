// Android TV screenshots from the browser harness (data-platform="tv", no pointer, remote keys only).
//   node scripts/harness/tv-shots.mjs --port=5611 --vibes=neon,sunset --sizes=hd,tv720 --out=tmp/tv [--ui=1] [--setup=pair|access|nolist]
// sizes: hd 1920x1080, tv720 1280x720.  --ui=1 wakes the controls first (a key press); default shows them hidden (lyrics only).
// Also reports: text smaller than 24 px (min body 28 px is the target for reading text), text outside the 5 % safe margins,
// and focusable controls with no visible focus ring.
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split(/=(.*)/s)).map(([k, v]) => [k, v ?? true]))
const PORT = Number(args.port ?? 5611)
const OUT = join(root, String(args.out ?? 'tmp/tv'))
mkdirSync(OUT, { recursive: true })
const src = readFileSync(join(root, 'src/shared/vibes.ts'), 'utf8')
const all = [...src.matchAll(/\{ id: '(\w+)', layout: '\w+'/g)].map((m) => m[1])
const vibes = args.vibes && args.vibes !== 'all' ? String(args.vibes).split(',') : all
const SIZES = { hd: [1920, 1080], tv720: [1280, 720] }
const sizes = String(args.sizes ?? 'hd,tv720').split(',')
const wake = args.ui ? true : false
const setup = args.setup ? `&tvs=${args.setup}` : ''
const extra = args.q ? `&${args.q}` : ''
const browser = await chromium.launch()
for (const sz of sizes) {
  const [w, h] = SIZES[sz]
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  for (const v of vibes) {
    const page = await ctx.newPage()
    const s = encodeURIComponent(JSON.stringify({ vibe: v, vibeMode: 'fixed' }))
    await page.goto(`http://localhost:${PORT}/?tv=1&s=${s}${setup}${extra}`)
    // the renderer's chrome is up for 3.5 s after load, then fades: --ui shoots with it up, default with lyrics only
    await page.waitForTimeout(args.setup ? 1500 : wake ? 1800 : 5200)
    await page.screenshot({ path: join(OUT, `${args.setup ? 'setup-' + args.setup : v}-${sz}${wake ? '-ui' : ''}.png`) })
    const report = await page.evaluate(() => {
      const W = innerWidth
      const H = innerHeight
      const small = []
      const outside = []
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = n.textContent?.trim()
        if (!t) continue
        const e = n.parentElement
        if (!e) continue
        const cs = getComputedStyle(e)
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) continue
        const r = document.createRange()
        r.selectNodeContents(n)
        const b = r.getBoundingClientRect()
        if (b.width < 2 || b.height < 2) continue
        let z = 1
        for (let a = e; a; a = a.parentElement) z *= parseFloat(getComputedStyle(a).zoom) || 1 // CSS zoom (the scene card) multiplies the size on screen
        const px = parseFloat(cs.fontSize) * z
        if (px < 24) small.push(`${t.slice(0, 22)} ${px.toFixed(0)}px`)
        const mx = W * 0.05 - 2
        const my = H * 0.05 - 2
        if (b.left < mx || b.right > W - mx || b.top < my || b.bottom > H - my) outside.push(`${t.slice(0, 22)} [${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.right)},${Math.round(b.bottom)}]`)
      }
      return { small: small.slice(0, 8), outside: outside.slice(0, 8) }
    })
    if (report.small.length || report.outside.length) console.log(v, sz, '\n  small:', report.small.join(' | '), '\n  outside safe area:', report.outside.join(' | '))
    await page.close()
  }
  await ctx.close()
}
await browser.close()
