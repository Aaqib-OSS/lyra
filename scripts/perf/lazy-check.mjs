// Opens the lazily loaded screens (Karaoke, Studio export, Settings) in the harness and reports whether they rendered.
//   node scripts/perf/lazy-check.mjs
import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1366, height: 768 } })
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
await p.goto(`http://localhost:${process.env.PERF_PORT ?? 5217}/?mode=full`)
await p.waitForTimeout(2500)
const out = []
out.push(`More buttons: ${await p.getByRole('button', { name: 'More' }).count()}`)
const open = async (label, sel) => {
  await p.evaluate(() => document.querySelector('.full__tools .menu button').click())
  await p.waitForTimeout(400)
  out.push(`menu html: ${(await p.evaluate(() => document.querySelector('.menu')?.outerHTML ?? 'none')).slice(0, 300)}`)
  await p.evaluate((l) => [...document.querySelectorAll('.menu__pop button')].find((b) => b.textContent.includes(l)).click(), label)
  await p.waitForTimeout(1500)
  out.push(`${label}: ${await p.locator(sel).count()} element(s)`)
  await p.keyboard.press('Escape')
  await p.waitForTimeout(400)
}
try {
  await open('Karaoke', '.k, [class^=k]')
  await open('Export lyric video', '[class*=studio]')
  await p.getByRole('button', { name: /settings/i }).first().click({ timeout: 4000, force: true })
  await p.waitForTimeout(1500)
  out.push(`settings: ${await p.locator('.pill, .hint').count()} element(s)`)
} catch (e) {
  out.push(`FAILED ${String(e).slice(0, 200)}`)
}
out.push(`errors: ${JSON.stringify(errs)}`)
console.log(out.join('\n'))
await b.close()
