// Checks the stream overlay (/overlay) and the browser viewer (/) in a real browser, without Electron, against the REAL
// Lyra Connect host (src/main/connect/hub.ts) on loopback:
//   node --experimental-transform-types scripts/ui-test/overlay-check.mjs [--out=ui-test-out/overlay]
// It starts the hub with an in-memory device registry, creates an overlay link the way the Devices panel does, pushes a song
// with synced lyrics, and drives Chromium (Playwright) through:
//   * every overlay look (screenshots over a photo-like gradient, which is what OBS composites), transparency, chroma key,
//     size / lines / meta options, following the app's vibe, the lyric line advancing with the shared clock
//   * auth: a good link works, a wrong token and a revoked link are refused, revoking a LIVE overlay is noticed, and the
//     overlay's own CSP raises no violation
//   * the viewer in desktop, phone and TV modes, its manifest and icon, idle hide, and that it still pairs from a QR link
// Exits non-zero when an assertion fails.
import { register } from 'node:module'
import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

register('./ts-alias-hooks.mjs', import.meta.url)
const src = (f) => import(pathToFileURL(resolve('src', f)).href)
const { ConnectHub } = await src('main/connect/hub.ts')
const { OVERLAY_HTML } = await src('main/connect/overlayPage.ts')
const { VIEWER_HTML } = await src('main/connect/viewerHtml.ts')
const { Pairing } = await src('core/connect/pairing.ts')

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true] }))
const OUT = resolve(String(args.out ?? 'ui-test-out/overlay'))
mkdirSync(OUT, { recursive: true })

const LINES = [
  [1000, 'Neon lights are falling on the avenue'], [5000, 'I keep counting every star in the rain'], [9000, 'Hold me close until the morning comes'],
  [13000, 'Tell me that you feel it too'], [17000, 'We were made for midnight drives'], [21000, 'Take me anywhere tonight']
].map(([t, x]) => ({ t, x }))
// a 2x2 PNG (orange / violet) as the cover
const ART = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8Dwn4EIwESMolGFxCkEAMHhAhHkVU6UAAAAAElFTkSuQmCC'
const ICON = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

const pairing = new Pairing({ now: Date.now, randomHex: (n) => randomBytes(n).toString('hex'), randomBytes: (n) => new Uint8Array(randomBytes(n)) })
const hub = new ConnectHub({
  pairing, viewerHtml: VIEWER_HTML, overlayHtml: OVERLAY_HTML, icon: () => ({ png: ICON, size: 512 }),
  lanIp: () => '127.0.0.1', port: 0, hostName: () => 'Test PC', vibes: ['none', 'neon', 'crt', 'noir'], onCommand: () => undefined,
  randomHex: (n) => randomBytes(n).toString('hex')
})
if (!(await hub.start())) throw new Error('hub did not start')
const BASE = hub.status().url.replace(/\/$/, '')
hub.setNow({ id: 't1', key: 'k', title: 'Midnight Drive', artists: ['The Lyra Band'], durationMs: 180000 })
hub.setView({ vibe: 'neon', video: { id: null } })
hub.setLyrics('t1', 'synced', true, LINES)
hub.setArt('t1', ART)
const anchor = () => hub.setPlay({ playing: true, positionMs: 11500, at: Date.now() })
anchor()

const overlayLink = hub.createOverlay('OBS overlay').url // http://127.0.0.1:PORT/overlay#d=..&t=..
const link = (qs = '') => overlayLink.replace('/overlay#', `/overlay${qs ? '?' + qs.replace(/^[?&]/, '') : ''}#`)

const fails = []
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what) }
const browser = await chromium.launch()
const BACKDROP = 'linear-gradient(135deg,#1b3a5c,#c0602f 55%,#2b1745)'
try {
  const ov = async (qs, w = 1280, h = 720, backdrop = false) => {
    const pg = await browser.newPage({ viewport: { width: w, height: h } })
    pg.cspErrors = []
    pg.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) pg.cspErrors.push(m.text()) })
    anchor()
    await pg.goto(link(qs))
    if (backdrop) await pg.evaluate((b) => { document.documentElement.style.background = b }, BACKDROP)
    await pg.waitForSelector('.ln.on', { timeout: 6000 })
    return pg
  }

  // 1. every look
  const LOOKS = ['classic', 'neon', 'chrome', 'terminal', 'subtitle', 'chat', 'sticker', 'hand', 'pixel', 'glitch']
  const shots = []
  for (const l of LOOKS) {
    const pg = await ov(`look=${l}&lines=3&size=${l === 'pixel' ? 56 : 70}`, 640, 360, true)
    const n = await pg.locator('.ln').count()
    check(n >= 1 && (await pg.evaluate(() => document.body.dataset.look)) === l, `look ${l} renders ${n} line(s)`)
    check(pg.cspErrors.length === 0, `look ${l}: no CSP violation`)
    shots.push(`data:image/png;base64,${(await pg.screenshot()).toString('base64')}`)
    await pg.close()
  }
  {
    const sheet = await browser.newPage({ viewport: { width: 1300, height: 1860 } })
    await sheet.setContent(`<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(2,640px);gap:6px;padding:6px">${shots.map((s) => `<img src="${s}" width="640" height="360">`).join('')}</body>`)
    await sheet.screenshot({ path: join(OUT, 'looks.png') })
    await sheet.close()
  }

  // 2. options
  {
    const pg = await ov('')
    check((await pg.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgba(0, 0, 0, 0)', 'overlay background is transparent by default')
    check((await pg.evaluate(() => document.body.dataset.look)) === 'neon', 'follows the app vibe (neon) when no vibe= is given')
    check(pg.cspErrors.length === 0, 'no CSP violation on the overlay (inline script/style, same-origin socket)')
    await pg.screenshot({ path: join(OUT, 'overlay-default.png'), omitBackground: true })
    hub.setView({ vibe: 'crt', video: { id: null } })
    await pg.waitForFunction(() => document.body.dataset.look === 'terminal', null, { timeout: 4000 })
    check(true, 'a vibe change in the app re-styles the overlay live (crt -> terminal)')
    hub.setView({ vibe: 'neon', video: { id: null } })
    await pg.close()
    const c = await ov('chroma=00ff00&vibe=noir&lines=1&meta=1&art=1&progress=1')
    check((await c.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(0, 255, 0)', 'chroma=00ff00 paints the page green')
    check((await c.evaluate(() => document.body.dataset.look)) === 'subtitle', 'vibe=noir gives the subtitle look')
    check((await c.locator('.ln').count()) === 1, 'lines=1 shows a single line')
    check(await c.locator('#meta.show').isVisible(), 'meta=1 shows the now-playing chip')
    await c.waitForFunction(() => document.querySelector('#mi')?.classList.contains('show'), null, { timeout: 4000 })
    check(true, 'art=1 shows the cover that came over the socket as an inline image')
    await c.screenshot({ path: join(OUT, 'overlay-chroma-subtitle.png') })
    await c.close()
    // options after the credentials in the fragment work too
    const fragOpts = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    anchor()
    await fragOpts.goto(overlayLink + '&look=glitch&lines=1')
    await fragOpts.waitForSelector('.ln.on', { timeout: 6000 })
    check((await fragOpts.evaluate(() => document.body.dataset.look)) === 'glitch' && (await fragOpts.locator('.ln').count()) === 1, 'options placed after the credentials in the fragment are honoured')
    await fragOpts.close()
    const big = await ov('look=terminal&size=120&align=left&pos=middle&font=Consolas', 1920, 1080)
    const fs = await big.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.ln.on')).fontSize))
    check(Math.abs(fs - 120) < 1, `size=120 at 1080p gives 120px type (${fs}px)`)
    await big.screenshot({ path: join(OUT, 'overlay-terminal-1080.png') })
    await big.close()
    // lyrics advance with the shared clock: start at 11.5 s (line 3, 9 s), line 4 (13 s) arrives within ~2 s
    const adv = await ov('lines=1')
    const first = await adv.locator('.ln.on').innerText()
    await adv.waitForFunction((t) => document.querySelector('.ln.on')?.textContent !== t, first, { timeout: 6000 })
    check(true, `the active line advances with the clock ("${first}" -> next)`)
    // a pause freezes it, and the page does not move on
    hub.setPlay({ playing: false, positionMs: 21500, at: Date.now() })
    await adv.waitForFunction(() => /anywhere/i.test(document.querySelector('.ln.on')?.textContent || ''), null, { timeout: 4000 })
    const frozen = await adv.locator('.ln.on').innerText()
    await adv.waitForTimeout(1200)
    check((await adv.locator('.ln.on').innerText()) === frozen, 'a pause freezes the overlay on the same line')
    await adv.close()
    anchor()
  }

  // 3. auth: a wrong token, a revoked link, revoking a live one
  {
    const bad = await browser.newPage()
    await bad.goto(overlayLink.replace(/t=[0-9a-f]{64}$/, 't=' + '0'.repeat(64)))
    await bad.waitForFunction(() => /revoked|not recognised/i.test(document.getElementById('dbg').textContent), null, { timeout: 5000 })
    check((await bad.locator('.ln').count()) === 0, 'a wrong token is refused and shows no lyrics')
    await bad.close()
    const none = await browser.newPage()
    await none.goto(overlayLink.split('#')[0])
    await none.waitForFunction(() => /no credential/i.test(document.getElementById('dbg').textContent), null, { timeout: 3000 })
    check(true, 'a link without a credential says so instead of connecting')
    await none.close()
    const second = hub.createOverlay('Second source')
    const live = await browser.newPage()
    anchor()
    await live.goto(second.url)
    await live.waitForSelector('.ln.on', { timeout: 6000 })
    const dev = hub.devices().find((d) => d.id === second.id)
    check(dev && dev.online && dev.role === 'overlay', 'the live overlay shows as an online overlay-role device')
    hub.revoke(second.id)
    await live.waitForFunction(() => /removed|revoked/i.test(document.getElementById('dbg').textContent), null, { timeout: 5000 })
    check(true, 'revoking a live overlay is noticed by the page, which stops retrying')
    await live.close()
    const stale = await browser.newPage()
    await stale.goto(second.url)
    await stale.waitForFunction(() => /revoked|not recognised/i.test(document.getElementById('dbg').textContent), null, { timeout: 5000 })
    check(true, 'the revoked link no longer works')
    await stale.close()
  }

  // 4. browser viewer: desktop, phone, TV, manifest, idle hide, and QR pairing still works
  {
    for (const [name, opt, qs] of [
      ['desktop', { viewport: { width: 1280, height: 720 } }, ''],
      ['phone', { viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true }, ''],
      ['tv', { viewport: { width: 1920, height: 1080 }, userAgent: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 TV Safari/537.36' }, ''],
      ['tv-flag', { viewport: { width: 1280, height: 720 } }, '?tv=1']
    ]) {
      const ctx = await browser.newContext(opt)
      const pg = await ctx.newPage()
      anchor()
      await pg.goto(`${BASE}/${qs}#p=${hub.newCode('viewer').code}`)
      await pg.waitForSelector('.l.on', { timeout: 6000 })
      await pg.waitForTimeout(800)
      const info = await pg.evaluate(() => ({ tv: document.body.classList.contains('tv'), manifest: document.querySelector('link[rel=manifest]')?.getAttribute('href'), touch: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href'), fsBtn: !!document.getElementById('fs') && getComputedStyle(document.getElementById('fs')).display !== 'none', hash: location.hash }))
      check(info.manifest === '/manifest.webmanifest' && info.touch === '/icon.png', `${name}: manifest and touch icon linked`)
      check(info.hash === '', `${name}: pairing code wiped from the address bar after pairing`)
      if (name.startsWith('tv')) check(info.tv && !info.fsBtn, `${name}: TV layout detected, small button hidden`)
      else check(!info.tv && info.fsBtn, `${name}: normal layout with a full-screen button`)
      await pg.screenshot({ path: join(OUT, `viewer-${name}.png`) })
      if (name === 'desktop') {
        await pg.waitForTimeout(4300)
        check(await pg.evaluate(() => document.body.classList.contains('calm')), 'desktop: cursor and chrome fade after 4 s idle')
        await pg.mouse.move(50, 50)
        check(!(await pg.evaluate(() => document.body.classList.contains('calm'))), 'desktop: moving the mouse brings them back')
        // pairing persisted: a plain reload reconnects by proof, without the code
        await pg.goto(`${BASE}/`)
        await pg.waitForSelector('.l.on', { timeout: 6000 })
        check(true, 'desktop: a reload reconnects with the stored credential (no code needed)')
      }
      await ctx.close()
    }
    const pg = await browser.newPage()
    const mr = await pg.request.get(`${BASE}/manifest.webmanifest`)
    const m = await mr.json()
    check(mr.ok() && m.start_url === '/' && m.display === 'standalone' && m.icons.length >= 1, 'manifest is served with start_url, display and an icon')
    check((await pg.request.get(`${BASE}/icon.png`)).ok(), 'icon is served')
    await pg.goto(`${BASE}/`)
    check(await pg.locator('#pair.on').isVisible(), 'an unpaired viewer shows the pairing screen (and no data)')
    await pg.close()
  }
} finally {
  await browser.close()
  hub.stop()
}
console.log(fails.length ? `\n${fails.length} check(s) failed` : '\nall overlay checks passed')
console.log('screenshots in', OUT)
process.exit(fails.length ? 1 : 0)
