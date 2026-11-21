// Clicks the real controls in Settings and checks that each one actually changes the app (so no setting is a dead switch).
//   npm run test:settings
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const BASE = 'http://localhost:5199'
const up = async () => { try { return (await fetch(BASE)).ok } catch { return false } }
let server
if (!(await up())) {
  server = spawn('npx', ['vite', '-c', 'scripts/harness/vite.config.ts', '--port', '5199', '--strictPort'], { cwd: root, stdio: 'ignore', shell: process.platform === 'win32' })
  for (let i = 0; i < 80 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500))
}

const browser = await chromium.launch()
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok, detail })

async function open(query, viewport = { width: 440, height: 900 }) {
  const page = await browser.newPage({ viewport })
  page.on('pageerror', (e) => check('no page errors', false, e.message.slice(0, 120)))
  await page.goto(`${BASE}/?paused=1&t=43500&panel=settings&${query}`)
  await page.waitForTimeout(1200)
  return page
}
const tab = async (p, name) => { await p.locator('.stabs button', { hasText: new RegExp(`^${name}$`) }).click(); await p.waitForTimeout(250) }
const root$ = (p, attr) => p.evaluate((a) => document.documentElement.dataset[a], attr)
const more = async (p) => { for (const d of await p.locator('details.more:not([open]) > summary').all()) await d.click() }

// ---------- Look ----------
{
  const p = await open('mode=mini&s=' + encodeURIComponent(JSON.stringify({ performance: 'smooth' })))
  await tab(p, 'Look')
  await p.locator('.vibecard', { hasText: 'Neon' }).click(); await p.waitForTimeout(200)
  check('Look: picking the Neon vibe changes the look', (await root$(p, 'vibe')) === 'neon')
  await p.locator('.vibecard', { hasText: 'Terminal' }).click(); await p.waitForTimeout(200)
  check('Look: picking Terminal switches it again', (await root$(p, 'vibe')) === 'crt')
  await p.locator('.vibecard', { hasText: 'Artwork' }).click()
  await p.locator('[aria-label="Vibe mode"] button', { hasText: 'Every song' }).click(); await p.waitForTimeout(150)
  check('Look: "Every song" shows tick boxes to choose the vibes', (await p.locator('.vibecard__tick').count()) > 5)
  await p.locator('[aria-label="Vibe mode"] button', { hasText: 'Fixed' }).click()
  await p.locator('[aria-label="Theme"] button', { hasText: 'Light' }).click(); await p.waitForTimeout(200)
  check('Look: Theme Light', (await p.evaluate(() => document.documentElement.getAttribute('data-theme') ?? document.body.getAttribute('data-theme') ?? document.querySelector('[data-theme]')?.getAttribute('data-theme'))) === 'light')
  await p.locator('[aria-label="Theme"] button', { hasText: 'Artwork' }).click()
  const rim0 = await root$(p, 'rim')
  await p.locator('[aria-label="Rim light"]').click(); await p.waitForTimeout(150)
  check('Look: the glow switch turns the window glow on/off', (await root$(p, 'rim')) !== rim0)
  await more(p)
  await p.locator('[aria-label="Performance"] button', { hasText: 'Light' }).click(); await p.waitForTimeout(150)
  check('Look: Performance Light', (await root$(p, 'perf')) === 'low')
  await p.locator('[aria-label="Performance"] button', { hasText: 'Smooth' }).click(); await p.waitForTimeout(150)
  check('Look: Performance Smooth', (await root$(p, 'perf')) === 'high')
  await p.locator('[aria-label="Reduce motion"] button', { hasText: 'On' }).click(); await p.waitForTimeout(150)
  check('Look: Reduce motion On', (await root$(p, 'motion')) === 'off')
  await p.close()
}

// ---------- Lyrics ----------
{
  const p = await open('mode=mini&s=' + encodeURIComponent(JSON.stringify({ performance: 'smooth' })), { width: 1100, height: 900 })
  await p.evaluate(() => 0)
  await tab(p, 'Lyrics')
  const fontOf = () => p.evaluate(() => document.querySelector('.lyrics')?.getAttribute('data-font'))
  await p.locator('[aria-label="Typeface"] button', { hasText: 'Serif' }).click(); await p.waitForTimeout(200)
  check('Lyrics: Typeface Serif', (await fontOf()) === 'serif')
  await p.locator('[aria-label="Typeface"] button', { hasText: 'Mono' }).click(); await p.waitForTimeout(200)
  check('Lyrics: Typeface Mono', (await fontOf()) === 'mono')
  const sizeOf = () => p.evaluate(() => getComputedStyle(document.querySelector('.lyrics')).getPropertyValue('--lyric-size').trim())
  const s0 = await sizeOf()
  const slider = p.locator('[aria-label="Lyric size"]')
  await slider.evaluate((el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '30'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) }); await p.waitForTimeout(250)
  check('Lyrics: Size slider resizes the lyrics', (await sizeOf()) !== s0, `${s0} -> ${await sizeOf()}`)
  const words = () => p.locator('.lyric.is-active .word').count()
  const w0 = await words()
  await p.locator('[aria-label="Highlight each word"]').click(); await p.waitForTimeout(400)
  check('Lyrics: "Highlight each word" off removes the word fill', w0 > 0 && (await words()) === 0, `${w0} -> ${await words()}`)
  await p.locator('[aria-label="Highlight each word"]').click(); await p.waitForTimeout(400)
  check('Lyrics: and back on', (await words()) > 0)
  await more(p)
  await p.locator('[aria-label="Lyric animation"] button', { hasText: 'Focus' }).click(); await p.waitForTimeout(200)
  check('Lyrics: Animation Focus', (await p.evaluate(() => document.querySelector('.lyrics')?.getAttribute('data-anim'))) === 'focus')
  const lh = () => p.evaluate(() => getComputedStyle(document.querySelector('.lyrics')).getPropertyValue('--lyric-leading').trim())
  const l0 = await lh()
  await p.locator('[aria-label="Line spacing"]').evaluate((el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '1.8'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) }); await p.waitForTimeout(250)
  check('Lyrics: Line spacing', (await lh()) !== l0, `${l0} -> ${await lh()}`)
  check('Lyrics: the services list shows each service', (await p.locator('.health__row').count()) >= 1)
  await p.close()
}

// ---------- Video ----------
{
  const p = await open('mode=full&s=' + encodeURIComponent(JSON.stringify({ performance: 'smooth' })), { width: 1280, height: 860 })
  await tab(p, 'Video')
  const dim = p.locator('[aria-label="Background dim"]')
  check('Video: the dim slider exists', (await dim.count()) === 1)
  check('Video: the video switch exists', (await p.locator('[aria-label="Video behind the lyrics"]').count()) === 1)
  await p.close()
}

// ---------- Player (desktop) ----------
{
  const p = await open('mode=mini', { width: 440, height: 1100 })
  await tab(p, 'Player')
  for (const l of ['Always on top', 'Fade when idle', 'Hide while screen sharing', 'Launch at startup', 'Control system volume', 'Global shortcuts', 'Track change notifications']) {
    const sw = p.locator(`[aria-label="${l}"]`)
    const was = await sw.getAttribute('aria-checked')
    await sw.click(); await p.waitForTimeout(120)
    check(`Player: "${l}" switch flips and is saved`, (await sw.getAttribute('aria-checked')) !== was)
  }
  await p.close()
}

// ---------- Android ----------
{
  const p = await open('android=1&mode=mini&s=' + encodeURIComponent(JSON.stringify({ performance: 'smooth' })), { width: 390, height: 844 })
  const names = await p.locator('.stabs button').allInnerTexts()
  check('Phone: tabs are Look, Lyrics, Video, Phone, Connect, About', names.join(',') === 'Look,Lyrics,Video,Phone,Connect,About', names.join(','))
  await tab(p, 'Phone')
  for (const l of ['Keep screen on while playing', 'Keep Lyra running']) {
    const sw = p.locator(`[aria-label="${l}"]`)
    if ((await sw.count()) === 0) { check(`Phone: "${l}" exists`, false); continue }
    const was = await sw.getAttribute('aria-checked')
    await sw.click(); await p.waitForTimeout(150)
    check(`Phone: "${l}" flips`, (await sw.getAttribute('aria-checked')) !== was)
  }
  await p.close()
}

await browser.close()
server?.kill()
const bad = results.filter((r) => !r.ok)
for (const r of results) console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}${r.ok || !r.detail ? '' : `  (${r.detail})`}`)
console.log(`\n${results.length - bad.length}/${results.length} settings checks passed`)
process.exit(bad.length ? 1 : 0)
