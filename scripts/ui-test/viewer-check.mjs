// Checks the browser viewer's connection behaviour against the REAL Lyra Connect host on loopback:
//   node --experimental-transform-types scripts/ui-test/viewer-check.mjs
//   * a wrong code shows the message and is NOT re-sent in a loop (it used to burn the host's failure budget)
//   * the pairing screen is accessible (labelled input, alert for errors, Enter submits)
//   * when the host goes away the page says how to fix it instead of showing a frozen screen, and it recovers on its own
// Exits non-zero when an assertion fails.
import { register } from 'node:module'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

register('./ts-alias-hooks.mjs', import.meta.url)
const src = (f) => import(pathToFileURL(resolve('src', f)).href)
const { ConnectHub } = await src('main/connect/hub.ts')
const { VIEWER_HTML } = await src('main/connect/viewerHtml.ts')
const { Pairing } = await src('core/connect/pairing.ts')

const pairing = new Pairing({ now: Date.now, randomHex: (n) => randomBytes(n).toString('hex'), randomBytes: (n) => new Uint8Array(randomBytes(n)) })
let redeems = 0
const redeem = pairing.redeem.bind(pairing)
pairing.redeem = (...a) => { redeems++; return redeem(...a) }
const mk = (port) => new ConnectHub({
  pairing, viewerHtml: VIEWER_HTML, lanIp: () => '127.0.0.1', port, hostName: () => 'Test PC', vibes: ['none'], onCommand: () => undefined,
  randomHex: (n) => randomBytes(n).toString('hex')
})
let hub = mk(0)
await hub.start()
const port = hub.status().port

const fails = []
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what) }
const browser = await chromium.launch()
try {
  const pg = await browser.newPage({ viewport: { width: 390, height: 780 } })
  await pg.goto(`http://127.0.0.1:${port}/`)
  await pg.waitForSelector('#pair.on')
  check((await pg.locator('label[for=pcode]').count()) === 1, 'the code input has a label')
  check((await pg.getAttribute('#pmsg', 'role')) === 'alert', 'errors are announced')
  await pg.fill('#pcode', 'ZZZZ-ZZZZ')
  await pg.press('#pcode', 'Enter')
  await pg.waitForFunction(() => /not right/.test(document.getElementById('pmsg').textContent))
  check(true, 'Enter submits and a wrong code shows the host message')
  const before = redeems
  await pg.waitForTimeout(3500) // several backoff rounds would have happened by now
  check(redeems === before && before === 1, `the wrong code is tried once, not in a loop (${before} tries, ${redeems - before} after)`)

  // a right code pairs
  const code = hub.newCode('viewer').code
  await pg.fill('#pcode', code)
  await pg.click('#pgo')
  await pg.waitForFunction(() => !document.getElementById('pair').classList.contains('on'), null, { timeout: 5000 })
  check(true, 'the right code pairs and hides the pairing screen')

  // the host goes away: the page explains, then recovers when it is back
  hub.stop()
  await pg.waitForFunction(() => /Cannot reach Lyra/.test(document.getElementById('empty').textContent), null, { timeout: 15000 })
  check(true, 'with the host gone the page says how to fix it')
  hub = mk(port)
  await hub.start()
  await pg.waitForFunction(() => document.getElementById('chip').className === 'ok', null, { timeout: 20000 })
  check(true, 'it reconnects by itself when the host is back')
  check(!/Cannot reach/.test(await pg.textContent('#empty')), 'and the hint is gone')
} finally {
  await browser.close()
  hub.stop()
}
if (fails.length) {
  console.error(`\n${fails.length} check(s) failed`)
  process.exit(1)
}
console.log('\nall viewer checks passed')
