// The background video must follow the music: pausing the song freezes the picture, resuming moves it again.
// Plays a small generated clip through the harness, toggles the fake player live and samples the <video> currentTime.
//
//   npm run test:video        (needs ffmpeg for the clip; the clip is generated once and is git-ignored)
//
// Pass: after pause the video is frozen within 300 ms, after resume it is moving within 300 ms.
import { chromium } from 'playwright'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BROWSER_ARGS, ensureHarness, portFor } from './lib.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PORT = portFor(5198)
const BASE = `http://localhost:${PORT}`
const LIMIT_MS = 300
const clip = join(root, 'scripts/harness/public/synctest.mp4')

if (!existsSync(clip)) {
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=s=320x180:rate=30', '-t', '20', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '35', clip])
  if (r.status !== 0) {
    console.error('ffmpeg is needed to make the test clip (scripts/harness/public/synctest.mp4)')
    process.exit(2)
  }
}

const stop = await ensureHarness(PORT)

const browser = await chromium.launch({ args: BROWSER_ARGS })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto(`${BASE}/?mode=full&t=2000&video=synctest&s=${encodeURIComponent(JSON.stringify({ performance: 'smooth' }))}`)

const time = () =>
  page.evaluate(() => {
    const vids = [...document.querySelectorAll('video.backdrop__media')]
    // the front one of the cross-fading pair is the visible one
    const v = vids.find((x) => getComputedStyle(x).opacity !== '0') ?? vids[0]
    return v ? v.currentTime : -1
  })

/** polls every 25 ms; resolves with how long until cond(previous, now) held, or Infinity */
async function until(cond, maxMs) {
  const t0 = Date.now()
  let prev = await time()
  while (Date.now() - t0 < maxMs) {
    await page.waitForTimeout(25)
    const now = await time()
    if (cond(prev, now)) return Date.now() - t0
    prev = now
  }
  return Infinity
}

const failures = []
const check = (name, ok, detail) => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name} ${detail}`)
  if (!ok) failures.push(name)
}

const started = await until((a, b) => b > a + 0.05, 8000)
check('the video plays while the song plays', started !== Infinity, `(moving after ${started} ms)`)

await page.evaluate(() => window.__setPlaying(false))
// frozen = three consecutive samples (75 ms) with no movement; the time it first held is the freeze latency
const t0 = Date.now()
let still = 0
let frozenAfter = Infinity
let last = await time()
while (Date.now() - t0 < 2000) {
  await page.waitForTimeout(25)
  const now = await time()
  still = Math.abs(now - last) < 0.001 ? still + 1 : 0
  last = now
  if (still >= 3) {
    frozenAfter = Math.max(0, Date.now() - t0 - 75)
    break
  }
}
check(`pausing the song freezes the video within ${LIMIT_MS} ms`, frozenAfter <= LIMIT_MS, `(${Number.isFinite(frozenAfter) ? frozenAfter + ' ms' : 'never froze'})`)
await page.waitForTimeout(600)
const held = await time()
await page.waitForTimeout(600)
check('and it stays frozen while paused', Math.abs((await time()) - held) < 0.001, '')

await page.evaluate(() => window.__setPlaying(true))
const movedAfter = await until((a, b) => b > a + 0.001, 2000)
check(`resuming the song moves the video within ${LIMIT_MS} ms`, movedAfter <= LIMIT_MS, `(${Number.isFinite(movedAfter) ? movedAfter + ' ms' : 'never moved'})`)

await browser.close()
stop()
if (failures.length) {
  console.error(`\n${failures.length} video sync check(s) failed`)
  process.exit(1)
}
console.log('\nvideo sync: all checks passed')
