// Checks the fullscreen "scene" vibes one by one: every state x every window size, measured in a real browser.
//   node scripts/ui-test/scene-check.mjs --vibe=neon [--size=1366x768,1920x1080] [--state=A,B] [--port=5199]
// Needs the harness running (npx vite -c scripts/harness/vite.config.ts --port 5199). Writes ui-test-out/scene/<vibe>/ with one
// screenshot per screen and one contact sheet per size, and prints what is wrong: controls outside the card, lyrics that
// leave their region, the card, the lyrics and the video window sitting on top of each other.
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true] }))
const PORT = Number(args.port ?? process.env.UI_PORT ?? 5199)
const VIBES = String(args.vibe ?? 'neon').split(',')
const MODE = String(args.mode ?? 'full')
const SIZES = String(args.size ?? (MODE === 'mini' ? '420x700,380x600' : '1366x768,1920x1080,1024x600,800x1000')).split(',').map((s) => { const [w, h] = s.split('x').map(Number); return { id: s, w, h } })
// a stand-in video that lives next to the repo (git-ignored): brag-output/brag.mp4, served by the harness through /@fs/
const BRAG = `&video=${encodeURIComponent('@fs/' + resolve('brag-output', 'brag').split(String.fromCharCode(92)).join('/'))}`
const STATES = {
  A: { name: 'Full: video + synced', q: `vs=live${BRAG}` },
  B: { name: 'Lyrics only', q: 'vs=none' },
  C: { name: 'Video + unsynced', q: `vs=live${BRAG}&ly=plain` },
  D: { name: 'Text only', q: 'vs=none&ly=plain' },
  E: { name: 'Video, no words', q: `vs=live${BRAG}&ly=none` },
  F: { name: 'Nothing but music', q: 'vs=none&ly=none' },
  G: { name: 'Waiting', q: 'vs=none&ly=offline' },
  H: { name: 'Idle', q: 'vs=none&idle=1' },
  I: { name: 'Ad', q: 'vs=none&ad=1' }
}
// looks whose lyrics are meant to sit on top of the video window
const OVER_VIDEO = new Set(['trailer', 'dream', 'noir'])
const KEYS = String(args.state ?? Object.keys(STATES).join(',')).split(',')
const OUT = resolve('ui-test-out', MODE === 'mini' ? 'scene-mini' : 'scene')

const measure = (overVideo) => {
  const r = (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom } }
  const issues = []
  const vw = innerWidth, vh = innerHeight
  const side = document.querySelector('.full__side')
  const lyr = document.querySelector('.full__lyrics')
  const win = document.querySelector('.scenewin')
  const out = (c, box, tol = 1.5) => c.x < box.x - tol || c.y < box.y - tol || c.r > box.r + tol || c.b > box.b + tol
  const vis = (e) => { const cs = getComputedStyle(e); const b = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0 && b.height > 0 }
  if (side && vis(side)) {
    const sb = r(side)
    if (out(sb, { x: 0, y: 0, r: vw, b: vh }, 1)) issues.push(`card leaves the window (${Math.round(sb.x)},${Math.round(sb.y)} ${Math.round(sb.w)}x${Math.round(sb.h)})`)
    for (const e of side.querySelectorAll('button, h1, p, .progress, .progress__time, .artwork, svg')) {
      if (!vis(e)) continue
      const cb = r(e)
      if (out(cb, sb, 1.5)) issues.push(`card overflow: ${e.tagName.toLowerCase()}.${String(e.className?.baseVal ?? e.className).split(' ')[0]} ${Math.round(cb.x - sb.x)},${Math.round(cb.y - sb.y)} ${Math.round(cb.w)}x${Math.round(cb.h)} in ${Math.round(sb.w)}x${Math.round(sb.h)}`)
    }
  }
  if (lyr) {
    const lb = r(lyr)
    for (const e of lyr.querySelectorAll('.sign__line, .bloom, .lfb, .lyrics__notice, .sign__row, .bloom__line')) {
      if (!vis(e) || e.closest('.sign__refl')) continue
      const eb = r(e)
      if (eb.y < lb.y - 3 || eb.b > lb.b + 3 || eb.x < lb.x - 10 || eb.r > lb.r + 10) issues.push(`lyrics leave their region: ${String(e.className).split(' ')[0]} ${Math.round(eb.y - lb.y)}..${Math.round(eb.b - lb.b)} / x ${Math.round(eb.x - lb.x)}..${Math.round(eb.r - lb.r)}`)
    }
    const kids = lyr.querySelectorAll('.stage *, .lfb *')
    for (const e of kids) { if (!vis(e) || e.closest('.sign__refl')) continue; const eb = r(e); if (eb.r > vw + 1 || eb.b > vh + 1 || eb.x < -1 || eb.y < -1) { issues.push(`lyrics leave the screen: ${String(e.className).split(' ')[0]}`); break } }
  }
  const inter = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.y, b.y))
  const boxes = []
  if (side && vis(side)) boxes.push(['card', r(side)])
  if (win && vis(win)) boxes.push(['video window', r(win)])
  const content = lyr?.querySelector('.sign__line, .bloom, .lfb, .plain__stanza')
  if (content && vis(content)) boxes.push(['lyrics', r(content)])
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = inter(boxes[i][1], boxes[j][1]); if (a > 40 && !(overVideo && (boxes[i][0] === 'video window' || boxes[j][0] === 'video window'))) issues.push(`${boxes[i][0]} overlaps ${boxes[j][0]} (${Math.round(a)} px²)`) }
  if (document.documentElement.scrollWidth > vw + 1) issues.push('page scrolls sideways')
  return issues
}

async function main() {
  try { const ok = await fetch(`http://localhost:${PORT}/`).then((r) => r.ok); if (!ok) throw new Error() } catch { console.error(`the harness is not running on port ${PORT}`); process.exit(2) }
  const browser = await chromium.launch()
  let failed = 0, total = 0
  for (const vibe of VIBES) {
    const dir = join(OUT, vibe)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    for (const sz of SIZES) {
      const tiles = []
      const ctx = await browser.newContext({ viewport: { width: sz.w, height: sz.h }, reducedMotion: 'no-preference' })
      for (const k of KEYS) {
        const st = STATES[k]
        const url = `http://localhost:${PORT}/?mode=${MODE}&paused=1&t=21500&${st.q}&s=${encodeURIComponent(JSON.stringify({ vibe, reducedMotion: 'off' }))}`
        const page = await ctx.newPage()
        await page.goto(url)
        await page.waitForTimeout(st.q.includes('live') ? 3800 : 2200)
        const issues = await page.evaluate(measure, OVER_VIDEO.has(vibe))
        const file = `${sz.id}-${k}.png`
        await page.screenshot({ path: join(dir, file) })
        await page.close()
        total++
        if (issues.length) { failed++; console.log(`✗ ${vibe} ${sz.id} ${k} ${st.name}\n    ${issues.join('\n    ')}`) }
        tiles.push({ k, name: st.name, file, bad: issues.length })
      }
      await ctx.close()
      const html = `<body style="margin:0;background:#111;font:12px sans-serif;color:#fff"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:6px">${tiles.map((t) => `<div><div style="padding:2px 4px;color:${t.bad ? '#ff7070' : '#9f9'}">${t.k} ${t.name}${t.bad ? ' (' + t.bad + ' issues)' : ''}</div><img style="width:100%;display:block" src="data:image/png;base64,${readFileSync(join(dir, t.file)).toString('base64')}"></div>`).join('')}</div></body>`
      const sheet = await browser.newPage({ viewport: { width: 2100, height: 1200 } })
      await sheet.setContent(html)
      await sheet.screenshot({ path: join(dir, `sheet-${sz.id}.png`), fullPage: true })
      await sheet.close()
    }
  }
  await browser.close()
  console.log(`\nscene check: ${total} screens, ${failed} with problems. Sheets: ${OUT}`)
  process.exit(failed ? 1 : 0)
}
main()
