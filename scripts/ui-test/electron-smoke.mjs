// Electron end-to-end smoke test: launches the BUILT app (out/main/index.js) with Playwright's Electron support and
// checks that it boots, shows a window, renders the player in demo mode, switches window modes, opens Settings and the
// Studio (export lyric video) dialog, and quits cleanly.
//
//   npm run build && npm run test:electron
//
// Needs the electron binary (node_modules/electron/dist). Without it the test SKIPS with exit 0 unless
// ELECTRON_SMOKE_REQUIRED=1 (set in CI, where a missing binary must fail). On Linux without a display run it under
// `xvfb-run -a` and set ELECTRON_NO_SANDBOX=1 (the CI job does both). The app runs against a throw-away
// --user-data-dir so it never touches the real settings, tokens or the single-instance lock of an installed Lyra.
import { _electron as electron } from 'playwright'
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(root, 'ui-test-out', 'electron')
const required = process.env.ELECTRON_SMOKE_REQUIRED === '1'

const skipOrFail = (why) => {
  console.log(`${required ? 'FAIL' : 'SKIP'}: ${why}`)
  process.exit(required ? 1 : 0)
}

let electronPath
try { electronPath = createRequire(join(root, 'package.json'))('electron') } catch { /* not installed */ }
if (typeof electronPath !== 'string' || !existsSync(electronPath)) skipOrFail('the electron binary is not installed (run `npm ci`, the postinstall downloads it)')
if (!existsSync(join(root, 'out', 'main', 'index.js'))) skipOrFail('the app is not built (run `npm run build` first)')

mkdirSync(OUT, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'lyra-smoke-'))
const steps = []
const step = async (name, fn) => {
  const t = Date.now()
  try { await fn(); steps.push({ name, ok: true, ms: Date.now() - t }); console.log(`  ok   ${name}`) }
  catch (e) { steps.push({ name, ok: false, ms: Date.now() - t, error: String(e?.message ?? e).slice(0, 400) }); console.log(`  FAIL ${name}\n       ${String(e?.message ?? e).split('\n').slice(0, 14).join('\n       ')}`); throw e }
}

const args = [root, `--user-data-dir=${userData}`]
if (process.env.ELECTRON_NO_SANDBOX === '1' || (process.platform === 'linux' && process.env.CI)) args.push('--no-sandbox')

let app, page, failed = false
const pageErrors = []
try {
  await step('the app boots and opens a window', async () => {
    app = await electron.launch({ executablePath: electronPath, args, env: { ...process.env, NODE_ENV: 'production', ELECTRON_ENABLE_LOGGING: '0' }, timeout: 60000 })
    page = await app.firstWindow({ timeout: 60000 })
    page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 200)))
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('#root > *', { timeout: 30000 })
    const wins = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
    if (wins < 1) throw new Error('no BrowserWindow')
  })

  // The first-run welcome card (a fresh user-data-dir always shows it) covers the app until dismissed.
  const dismissWelcome = async () => {
    const go = page.getByRole('button', { name: 'Get started' })
    await go.waitFor({ timeout: 15000 }) // a fresh profile must show it: that is the first-run path under test
    await go.click()
    await go.waitFor({ state: 'detached', timeout: 15000 })
  }
  // first-run hint cards ("Want a music video here?") float over the header and swallow clicks
  // the header also fades out when the mouse has been idle for a few seconds (with a scene behind it) and its controls
  // stop taking clicks until the pointer moves again, so wake it like a user would
  const dismissHints = async () => {
    await page.mouse.move(200, 200)
    await page.mouse.move(210, 220)
    await page.waitForTimeout(400)
    for (let i = 0; i < 5; i++) {
      const x = page.locator('.vstat__card').getByRole('button', { name: 'Dismiss' })
      if (!(await x.count())) break
      await x.first().click().catch(() => {})
      await page.waitForTimeout(300)
    }
  }

  await step('demo mode starts and the player screen renders', async () => {
    await dismissWelcome() // closing it collapses the window to the default (compact) widget
    await page.evaluate(() => window.lyra.spotify.startDemo())
    // the demo track (title + artist) is on screen once the demo source is live
    await page.waitForFunction(() => /Glass Hours/.test(document.body.innerText) && /Meridian Hall/.test(document.body.innerText), null, { timeout: 30000 })
  })

  await step('window modes switch (compact -> mini -> full -> compact -> mini)', async () => {
    // the real click path first: the widget expands when its "Expand player" button is pressed
    const expand = page.getByRole('button', { name: 'Expand player' })
    if (await expand.count()) { await expand.first().click(); await page.waitForFunction(() => document.documentElement.dataset.mode === 'mini', null, { timeout: 15000 }) }
    const modeOf = () => page.evaluate(() => document.documentElement.dataset.mode)
    for (const m of ['mini', 'full', 'compact', 'mini']) {
      await page.evaluate((mode) => window.lyra.window.setMode(mode), m)
      await page.waitForFunction((mode) => document.documentElement.dataset.mode === mode, m, { timeout: 15000 })
      if ((await modeOf()) !== m) throw new Error(`mode did not become ${m}`)
      // let the shell animation finish and the window shrink to its final size before the next switch (switching
      // mid-transition is not a case this test is about)
      await page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime ?? Infinity)), null, { timeout: 15000 })
      await page.waitForTimeout(800)
      const main = await page.evaluate(() => window.lyra.window.getMode())
      if (main !== m) throw new Error(`the main process says ${main}, expected ${m}`)
    }
    await page.screenshot({ path: join(OUT, 'mini.png') })
  })

  await step('Settings opens', async () => {
    await dismissHints()
    await page.getByRole('button', { name: 'Settings', exact: true }).first().click()
    await page.waitForSelector('.stabs', { timeout: 15000 })
    await page.screenshot({ path: join(OUT, 'settings.png') })
    await page.getByRole('button', { name: 'Close panel' }).click() // closes again
    await page.waitForSelector('.stabs', { state: 'detached', timeout: 15000 })
  })

  await step('the Studio (export lyric video) dialog opens and closes', async () => {
    await dismissHints()
    await page.getByRole('button', { name: 'More', exact: true }).first().click()
    await page.getByText('Export lyric video', { exact: true }).first().click()
    const dlg = page.getByRole('dialog', { name: 'Export a lyric video' })
    await dlg.waitFor({ timeout: 15000 })
    await page.screenshot({ path: join(OUT, 'studio.png') })
    await page.keyboard.press('Escape')
    if (await dlg.count()) await dlg.getByRole('button', { name: /close|cancel/i }).first().click()
    await dlg.waitFor({ state: 'detached', timeout: 15000 })
  })

  await step('no uncaught page errors', async () => {
    if (pageErrors.length) throw new Error(pageErrors.slice(0, 3).join(' | '))
  })

  await step('the app exits cleanly', async () => {
    const proc = app.process()
    const exited = new Promise((res) => proc.once('exit', (code, signal) => res({ code, signal })))
    await app.evaluate(({ app: a }) => a.quit())
    const r = await Promise.race([exited, new Promise((res) => setTimeout(() => res('timeout'), 20000))])
    if (r === 'timeout') throw new Error('the app did not exit within 20 s of app.quit()')
    if (r.code !== 0 && r.code !== null) throw new Error(`exit code ${r.code}`)
    app = null
  })
} catch {
  failed = true
  try { await page?.screenshot({ path: join(OUT, 'FAIL.png') }) } catch { /* window may be gone */ }
} finally {
  try { await app?.close() } catch { /* already gone */ }
  try { rmSync(userData, { recursive: true, force: true }) } catch { /* locked on Windows for a moment: harmless in tmp */ }
  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ steps, pageErrors }, null, 2))
}
console.log(failed ? '\nElectron smoke test FAILED' : '\nElectron smoke test passed')
process.exit(failed ? 1 : 0)
