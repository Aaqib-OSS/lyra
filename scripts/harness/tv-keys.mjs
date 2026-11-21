// Remote-control behaviour of the TV page in the browser harness (arrow keys + Enter stand in for the D-pad and OK).
//   node scripts/harness/tv-keys.mjs --port=5611 [--out=tmp/tv]
// Checks: controls hidden -> OK toggles, Left/Right seek, Up/Down change the look; controls shown -> arrows move focus between
// controls with a visible ring and OK presses; Menu opens the setup screen and Back closes it; the page never needs a pointer.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split(/=(.*)/s)).map(([k, v]) => [k, v ?? true]))
const OUT = join(root, String(args.out ?? 'tmp/tv'))
mkdirSync(OUT, { recursive: true })
const PORT = Number(args.port ?? 5611)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
const logs = []
page.on('console', (m) => m.type() === 'log' && logs.push(m.text()))
const s = encodeURIComponent(JSON.stringify({ vibe: 'neon', vibeMode: 'fixed' }))
await page.goto(`http://localhost:${PORT}/?tv=1&s=${s}`)
let fails = 0
const check = (name, ok, detail = '') => {
  if (!ok) fails++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`)
}
const hud = () => page.evaluate(() => document.querySelector('.tvhud__say')?.textContent ?? '')
const idle = () => page.evaluate(() => !!document.querySelector('.full.is-idle'))
const focusLabel = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.className ?? '')

await page.waitForTimeout(5400) // controls fade away
check('controls are hidden after a few idle seconds', await idle())

await page.keyboard.press('ArrowRight')
await page.waitForTimeout(150)
check('Right (controls hidden) seeks forward', (await hud()) === '+10 s', await hud())
check('seeking does not bring the controls up', await idle())

await page.keyboard.press('ArrowLeft')
await page.waitForTimeout(150)
check('Left (controls hidden) seeks back', (await hud()).endsWith('10 s') && (await hud()).startsWith('−'), await hud())

const vibe0 = await page.evaluate(() => document.documentElement.dataset.vibe)
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(300)
const vibe1 = await page.evaluate(() => document.documentElement.dataset.vibe)
check('Down changes the look', vibe1 !== vibe0, `${vibe0} -> ${vibe1}`)

await page.keyboard.press('Enter')
await page.waitForTimeout(300)
check('OK (controls hidden) pauses and shows the controls', ['Paused', 'Playing'].includes(await hud()) && !(await idle()), await hud())

await page.keyboard.press('ArrowRight')
await page.waitForTimeout(150)
const f1 = await focusLabel()
check('first D-pad press with controls up lands on play / pause', /play|pause/i.test(f1), f1)
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(150)
const f2 = await focusLabel()
check('Right moves focus to the next control', /next/i.test(f2), f2)
await page.keyboard.press('ArrowLeft')
await page.keyboard.press('ArrowLeft')
await page.waitForTimeout(150)
check('Left twice moves back past play to Previous', /previous/i.test(await focusLabel()), await focusLabel())
const ring = await page.evaluate(() => {
  const e = document.activeElement
  const cs = getComputedStyle(e)
  return { outline: cs.outlineStyle + ' ' + cs.outlineWidth, shadow: cs.boxShadow !== 'none' }
})
check('the focused control has a strong ring', ring.outline.startsWith('solid') && parseFloat(ring.outline.split(' ')[1]) >= 3.5 && ring.shadow, JSON.stringify(ring))
await page.screenshot({ path: join(OUT, 'focus-ring-hd.png') })

await page.keyboard.press('m')
await page.waitForTimeout(500)
check('Menu opens the setup screen', await page.evaluate(() => !!document.querySelector('.tvsetup')))
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(150)
check('inside setup the D-pad moves between buttons', /Use the music|Done|Exit/.test(await page.evaluate(() => document.activeElement?.textContent ?? '')), await page.evaluate(() => document.activeElement?.textContent ?? ''))
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
check('Back closes setup (state is ready)', await page.evaluate(() => !document.querySelector('.tvsetup')))

const noPointer = await page.evaluate(() => getComputedStyle(document.body).cursor)
check('no mouse cursor on a TV', noPointer === 'none', noPointer)

await browser.close()
console.log(fails ? `${fails} check(s) failed` : 'all checks passed')
process.exit(fails ? 1 : 0)
