// Shared plumbing of the browser UI tests (run.mjs, settings.mjs, video-sync.mjs): the harness server, the pinned
// browser settings that make Windows and Linux render the same way, and the flaky-retry bookkeeping.
import { spawn, spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * Chromium switches that remove the biggest platform differences between a Windows laptop and a Linux CI runner:
 *  - `--font-render-hinting=none`: Linux hints glyphs (changes advance widths by up to a pixel), Windows does not.
 *  - `--disable-lcd-text`: no sub-pixel (ClearType) colour fringes, which would shift the contrast measure.
 *  - `--force-color-profile=srgb`: the same colour maths on a wide-gamut monitor and on a headless runner.
 *  - `--disable-font-subpixel-positioning`'s opposite is NOT set: sub-pixel positioning stays on so text does not
 *    snap to whole pixels differently per platform.
 *  - `--autoplay-policy=no-user-gesture-required`: the harness fake player must be able to start a video.
 */
export const BROWSER_ARGS = ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb', '--autoplay-policy=no-user-gesture-required']

/** Context options every page uses: one scale factor, language, zone, colour scheme and motion preference everywhere. */
export const CONTEXT_OPTIONS = { deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC', colorScheme: 'light', reducedMotion: 'no-preference' }

export const isCI = !!process.env.CI

/** `--key=value` / `--flag` arguments as an object. */
export const parseArgs = (argv = process.argv.slice(2)) => Object.fromEntries(argv.map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]))

/** Port for a script: UI_PORT / LYRA_UI_PORT, else the script's own default. Two runs on one port kill each other. */
export const portFor = (fallback) => Number(process.env.UI_PORT ?? process.env.LYRA_UI_PORT ?? process.env.LYRA_HARNESS_PORT ?? fallback)

/**
 * Makes sure a harness answers on `port`; starts one when none does. Returns `stop()`.
 *  - default: the Vite dev server (no build step, always current).
 *  - UI_HARNESS_DIST=1: `vite preview` of a harness built beforehand (`npx vite build -c scripts/harness/vite.config.ts`),
 *    which is what CI uses so the shards do not each re-transform the whole app.
 */
export async function ensureHarness(port) {
  const base = `http://localhost:${port}`
  const up = () => fetch(base).then((r) => r.ok).catch(() => false)
  if (await up()) return () => {}
  const cmd = process.env.UI_HARNESS_DIST === '1' ? 'preview' : undefined
  const server = spawn('npx', ['vite', ...(cmd ? [cmd] : []), '-c', 'scripts/harness/vite.config.ts', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: 'ignore',
    shell: process.platform === 'win32',
    detached: process.platform !== 'win32'
  })
  for (let i = 0; i < 120 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500))
  // kill the whole tree: `npx` is only the wrapper of the vite process that holds the port (taskkill /T on Windows, the process group elsewhere)
  const stop = () => {
    try {
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
      else process.kill(-server.pid)
    } catch { /* already gone */ }
  }
  if (!(await up())) { stop(); throw new Error(`the harness server did not start on ${port}`) }
  return stop
}

/** Waits until every web font that the page asked for is loaded (and one more frame has drawn with it). */
export const fontsReady = (page) => page.evaluate(async () => { await document.fonts.ready; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))) })

/** Splits `jobs` for shard "i/n" (1-based), round-robin so every shard gets the same mix of looks and sizes. */
export function shardOf(jobs, spec) {
  if (!spec || spec === true) return jobs
  const m = /^(\d+)\/(\d+)$/.exec(String(spec))
  if (!m || +m[1] < 1 || +m[1] > +m[2]) throw new Error(`--shard must look like 1/3, got ${spec}`)
  const [i, n] = [+m[1] - 1, +m[2]]
  return jobs.filter((_, k) => k % n === i)
}
