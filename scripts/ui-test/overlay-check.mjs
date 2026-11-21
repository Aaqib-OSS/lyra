// Checks the stream overlay (/overlay) and the browser viewer (/) in a real browser, without Electron:
//   node scripts/ui-test/overlay-check.mjs [--out=ui-test-out/overlay]
// It loads the page strings straight from src/main/lan (Node strips the types), serves them from a tiny mock of the LAN
// viewer server (/events, /lyrics, /art, /manifest.webmanifest) and takes screenshots:
//   * a contact sheet of every overlay look over a photo-like gradient (this is what OBS composites)
//   * transparency (the page background is really transparent) and the chroma-key colour
//   * the viewer in desktop, phone and TV-browser modes, plus the manifest
// Exits non-zero when an assertion fails.
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { join, resolve } from 'node:path'

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true] }))
const OUT = resolve(String(args.out ?? 'ui-test-out/overlay'))
mkdirSync(OUT, { recursive: true })
const lan = (f) => import(pathToFileURL(resolve('src/main/lan', f)).href)
const { OVERLAY_HTML } = await lan('overlayPage.ts')
const { VIEWER_HTML } = await lan('viewerHtml.ts')
const { buildManifest } = await lan('pwa.ts')
const TOKEN = 'abc123def456'

const LINES = [
  [1000, 'Neon lights are falling on the avenue'], [5000, 'I keep counting every star in the rain'], [9000, 'Hold me close until the morning comes'],
  [13000, 'Tell me that you feel it too'], [17000, 'We were made for midnight drives'], [21000, 'Take me anywhere tonight']
].map(([timeMs, text]) => ({ timeMs, text }))
const ART = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g"><stop offset="0" stop-color="#ff7a59"/><stop offset="1" stop-color="#6a4cff"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/></svg>`
const state = (vibe) => ({ type: 'state', now: Date.now(), trackId: 't1', title: 'Midnight Drive', artists: 'The Lyra Band', durationMs: 180000, hasArt: true, playing: true, positionMs: 11500, sampledAt: Date.now(), ...(vibe ? { vibe } : {}) })

const HOSTS = ["127.0.0.1", "127.0.0.2", "localhost"] // a browser allows ~6 open event streams per host, the sheet has 10
let PORT = 0
const sheet = (looks) => `<!doctype html><body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(2,640px);gap:6px;padding:6px">${looks
  .map((l) => `<div style="position:relative;width:640px;height:360px;background:linear-gradient(135deg,#1b3a5c,#c0602f 55%,#2b1745)"><div style="position:absolute;inset:0;background:radial-gradient(circle at 70% 30%,rgba(255,255,255,.25),transparent 40%)"></div><iframe src="http://${HOSTS[looks.indexOf(l) % 3]}:${PORT}/overlay?k=${TOKEN}&look=${l}&lines=3&size=${l === 'pixel' ? 56 : 70}" style="position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent" allowtransparency></iframe><span style="position:absolute;left:8px;top:6px;color:#fff;font:12px monospace;background:#0008;padding:2px 6px">${l}</span></div>`)
  .join('')}</body>`

let appVibe = 'neon'
const srv = createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  if (u.searchParams.get('k') !== TOKEN && u.pathname !== '/sheet') { res.writeHead(403); return res.end('no') }
  if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(VIEWER_HTML.replace(/__K__/g, TOKEN)) }
  if (u.pathname === '/overlay') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(OVERLAY_HTML) }
  if (u.pathname === '/sheet') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(sheet(['classic', 'neon', 'chrome', 'terminal', 'subtitle', 'chat', 'sticker', 'hand', 'pixel', 'glitch'])) }
  if (u.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write(`data: ${JSON.stringify(state(appVibe))}\n\n`)
    const t = setInterval(() => res.write(`data: ${JSON.stringify(state(appVibe))}\n\n`), 2000)
    req.on('close', () => clearInterval(t))
    return
  }
  if (u.pathname === '/lyrics') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ status: 'synced', lines: LINES })) }
  if (u.pathname === '/art') { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); return res.end(ART) }
  if (u.pathname === '/manifest.webmanifest') { res.writeHead(200, { 'Content-Type': 'application/manifest+json' }); return res.end(JSON.stringify(buildManifest({ token: TOKEN, iconSize: 512 }))) }
  if (u.pathname === '/icon.png') { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); return res.end(ART) }
  res.writeHead(404); res.end()
})
await new Promise((r) => srv.listen(0, "0.0.0.0", r))
PORT = srv.address().port
const BASE = `http://127.0.0.1:${PORT}`

const fails = []
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what) }
const browser = await chromium.launch()
try {
  // 1. contact sheet of all looks
  {
    const pg = await browser.newPage({ viewport: { width: 1300, height: 1860 } })
    await pg.goto(`${BASE}/sheet`)
    await pg.waitForTimeout(2500)
    await pg.screenshot({ path: join(OUT, 'looks.png') })
    const counts = await Promise.all(pg.frames().filter((f) => f !== pg.mainFrame()).map((f) => f.locator('.ln').count()))
    check(counts.length === 10 && counts.every((n) => n >= 1), `every look renders lines (${counts.join(',')})`)
    await pg.close()
  }
  // 2. transparency, chroma, vibe from the app, single-line mode, meta chip
  const ov = async (qs, w = 1280, h = 720) => {
    const pg = await browser.newPage({ viewport: { width: w, height: h } })
    await pg.goto(`${BASE}/overlay?k=${TOKEN}${qs}`)
    await pg.waitForSelector('.ln.on', { timeout: 6000 })
    return pg
  }
  {
    const pg = await ov('')
    check((await pg.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgba(0, 0, 0, 0)', 'overlay background is transparent by default')
    check((await pg.evaluate(() => document.body.dataset.look)) === 'neon', 'follows the app vibe (neon) when no vibe= is given')
    await pg.screenshot({ path: join(OUT, 'overlay-default.png'), omitBackground: true })
    await pg.close()
    const c = await ov('&chroma=00ff00&vibe=noir&lines=1&meta=1&art=1&progress=1')
    check((await c.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(0, 255, 0)', 'chroma=00ff00 paints the page green')
    check((await c.evaluate(() => document.body.dataset.look)) === 'subtitle', 'vibe=noir gives the subtitle look')
    check((await c.locator('.ln').count()) === 1, 'lines=1 shows a single line')
    check(await c.locator('#meta.show').isVisible(), 'meta=1 shows the now-playing chip')
    await c.screenshot({ path: join(OUT, 'overlay-chroma-subtitle.png') })
    await c.close()
    const big = await ov('&look=terminal&size=120&align=left&pos=middle&font=Consolas', 1920, 1080)
    const fs = await big.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.ln.on')).fontSize))
    check(Math.abs(fs - 120) < 1, `size=120 at 1080p gives 120px type (${fs}px)`)
    await big.screenshot({ path: join(OUT, 'overlay-terminal-1080.png') })
    await big.close()
    // lyrics advance with the clock: the page started at ~11.5 s, line 3 (9 s) is active, line 4 at 13 s arrives within ~2 s
    const adv = await ov('&lines=1')
    const first = await adv.locator('.ln.on').innerText()
    await adv.waitForFunction((t) => document.querySelector('.ln.on')?.textContent !== t, first, { timeout: 6000 })
    check(true, `the active line advances with the clock ("${first}" -> next)`)
    await adv.close()
  }
  // 3. browser viewer: desktop, phone, TV user-agent
  {
    for (const [name, opt, qs] of [
      ['desktop', { viewport: { width: 1280, height: 720 } }, ''],
      ['phone', { viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true }, ''],
      ['tv', { viewport: { width: 1920, height: 1080 }, userAgent: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 TV Safari/537.36' }, '']
    ]) {
      const ctx = await browser.newContext(opt)
      const pg = await ctx.newPage()
      await pg.goto(`${BASE}/?k=${TOKEN}${qs}`)
      await pg.waitForSelector('.ln.on', { timeout: 6000 })
      await pg.waitForTimeout(1200)
      const info = await pg.evaluate(() => ({ tv: document.body.classList.contains('tv'), manifest: document.querySelector('link[rel=manifest]')?.getAttribute('href'), fsBtn: !!document.getElementById('fs') && getComputedStyle(document.getElementById('fs')).display !== 'none' }))
      check(info.manifest === `/manifest.webmanifest?k=${TOKEN}`, `${name}: manifest link carries the key`)
      if (name === 'tv') check(info.tv && !info.fsBtn, 'tv: TV layout detected, small buttons hidden')
      else check(!info.tv && info.fsBtn, `${name}: normal layout with a full-screen button`)
      await pg.screenshot({ path: join(OUT, `viewer-${name}.png`) })
      await ctx.close()
    }
    const pg = await browser.newPage()
    const m = await (await pg.request.get(`${BASE}/manifest.webmanifest?k=${TOKEN}`)).json()
    check(m.start_url === `/?k=${TOKEN}` && m.display === 'standalone' && m.icons.length >= 1, 'manifest is served with start_url, display and an icon')
    // wake lock and fullscreen entry points exist (the real calls need HTTPS / a user gesture)
    await pg.goto(`${BASE}/?k=${TOKEN}`)
    await pg.keyboard.press('f')
    await pg.close()
  }
} finally {
  await browser.close()
  srv.close()
}
console.log(fails.length ? `\n${fails.length} check(s) failed` : '\nall overlay checks passed')
console.log('screenshots in', OUT)
process.exit(fails.length ? 1 : 0)
