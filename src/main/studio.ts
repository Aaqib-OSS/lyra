import { BrowserWindow, app, dialog, ipcMain, powerSaveBlocker, shell } from 'electron'
import { open, readdir, rm, statfs, writeFile, type FileHandle } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CH, EV } from '@shared/ipc'
import { windows } from './window'
import { isOwnOutput, outputSibling, sanitizeFileName } from './studioPaths'

/**
 * Lyric-video export (main side): picks the output file, appends the encoded MP4 as it is produced (a long video
 * is never held in memory) and lets the app window capture the PC's sound only while an export is running.
 */
const files = new Map<number, FileHandle>()
/** the path of every open output file (to remove a half-written one when the app quits mid-export) */
const openPaths = new Map<number, string>()
/** lower-case paths the save dialog gave out in this session: the only files the renderer may delete, reveal or write next to */
const created = new Set<string>()
let nextId = 1
let capturing = false
let blocker: number | null = null
let micOpen = false

/**
 * An export is running: keep the app window rendering at full speed even when it is covered or minimized (Chromium
 * would otherwise slow it right down, which shows up as freezes in the video) and keep Windows awake.
 */
function setExporting(on: boolean): void {
  capturing = on
  const w = windows.window
  if (w && !w.isDestroyed()) w.webContents.setBackgroundThrottling(!on)
  if (on && blocker === null) blocker = powerSaveBlocker.start('prevent-app-suspension')
  if (!on && blocker !== null) {
    powerSaveBlocker.stop(blocker)
    blocker = null
  }
}

export const studio = {
  /** The window may capture the PC's sound right now. */
  get capturing(): boolean {
    return capturing
  },
  /** the karaoke screen is open: the app window may use the microphone */
  get mic(): boolean {
    return micOpen
  }
}

/**
 * YouTube as a background: the video plays in a hidden, off-screen window (muted) and every painted frame is
 * sent to the app window as a JPEG, where the export draws it behind the lyrics. The window never shows up and
 * keeps working while Lyra is in the background.
 */
let stage: BrowserWindow | null = null

/**
 * "Smooth" export: while the song plays, the YouTube pictures are appended to a temporary file (with their times)
 * instead of being sent to the window. The video is drawn from that file afterwards, at exact times.
 */
interface FrameSink {
  path: string
  fh: FileHandle
  t0: number
  times: number[]
  offsets: number[]
  lengths: number[]
  tail: number
  queue: Promise<void>
  reader: FileHandle | null
}
let sink: FrameSink | null = null

async function frameCaptureStart(): Promise<boolean> {
  await frameCaptureClear()
  try {
    const path = join(tmpdir(), `lyra-frames-${Date.now()}.bin`)
    const fh = await open(path, 'w')
    sink = { path, fh, t0: Date.now(), times: [], offsets: [], lengths: [], tail: 0, queue: Promise.resolve(), reader: null }
    return true
  } catch {
    return false
  }
}

async function frameCaptureStop(): Promise<number[] | null> {
  const s = sink
  if (!s) return null
  await s.queue.catch(() => undefined)
  await s.fh.close().catch(() => undefined)
  s.reader = await open(s.path, 'r').catch(() => null)
  s.t0 = -1 // no more pictures are appended
  return s.times.length ? s.times : null
}

async function frameCaptureClear(): Promise<void> {
  const s = sink
  sink = null
  if (!s) return
  await s.queue.catch(() => undefined)
  await s.fh.close().catch(() => undefined)
  await s.reader?.close().catch(() => undefined)
  await rm(s.path, { force: true })
}

// everything the player draws on top of the picture: controls, captions, titles, end cards
const HIDE_PLAYER_UI = '.ytp-chrome-top,.ytp-chrome-bottom,.ytp-gradient-top,.ytp-gradient-bottom,.ytp-pause-overlay,.ytp-large-play-button,.ytp-spinner,.ytp-watermark,.ytp-ce-element,.ytp-cards-teaser,.ytp-caption-window-container,.caption-window,.ytp-player-content,.ytp-iv-video-content,.ytp-endscreen-content,.ytp-youtube-button,.ytp-paid-content-overlay,.ytp-popup,.ytp-contextmenu{display:none!important} #player-controls,#player-control-overlay,.ytPlayerControlsContainerHost,player-middle-controls,.player-controls-background,.new-controls,[class*=player-controls]{display:none!important} video{cursor:none!important} .html5-video-player > :not(.html5-video-container){display:none!important}'

/** One painted picture of the hidden window: appended to the temporary file (smooth export) or sent to the app window. */
function handOver(image: Electron.NativeImage, height: number): void {
  const target = windows.window
  if (!target || target.isDestroyed()) return
  const jpeg = image.toJPEG(height >= 1200 ? 84 : 88)
  const s = sink
  if (s) {
    if (s.t0 < 0) return
    const at = s.tail
    s.tail += jpeg.byteLength
    s.times.push(Date.now() - s.t0)
    s.offsets.push(at)
    s.lengths.push(jpeg.byteLength)
    s.queue = s.queue.then(() => s.fh.write(jpeg, 0, jpeg.byteLength, at).then(() => undefined))
    return
  }
  target.webContents.send(EV.studioFrame, jpeg)
}

function stopStage(): void {
  if (stage && !stage.isDestroyed()) {
    windows.captures.delete(stage)
    stage.destroy()
  }
  stage = null
}

/** The page's width in CSS pixels that the lyrics screen is laid out for: the shorter side of the picture is this many. */
const UI_SHORT_CSS = 720

/**
 * The lyrics screen as a video background: the app itself (same look, same cover colours, same moving background and
 * lyrics) runs in a hidden off-screen window of the export's size, zoomed so it is laid out like a normal player
 * window, and every painted frame goes the same way a YouTube picture does. It follows the song that is playing.
 */
async function startUi(o: { width: number; height: number; fps: number; vibe: string }): Promise<{ ok: boolean; reason?: string }> {
  stopStage()
  const width = Math.max(320, Math.min(2560, Math.round(o.width)))
  const height = Math.max(320, Math.min(2560, Math.round(o.height)))
  const fps = Math.max(2, Math.min(30, Math.round(o.fps)))
  const win = new BrowserWindow({
    show: false,
    width,
    height,
    useContentSize: true,
    frame: false,
    backgroundColor: '#000000',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), offscreen: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required', sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  stage = win
  windows.captures.add(win)
  win.webContents.setAudioMuted(true)
  win.webContents.setFrameRate(fps)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.on('paint', (_e, _dirty, image) => handOver(image, height))
  let crashed = ''
  win.webContents.on('render-process-gone', (_e, d) => {
    crashed = `the lyrics screen stopped (${d.reason})`
  })
  win.on('closed', () => {
    windows.captures.delete(win)
    if (stage === win) stage = null
  })
  try {
    const dev = process.env['ELECTRON_RENDERER_URL']
    const vibe = /^[a-z0-9-]{2,30}$/.test(String(o.vibe)) ? String(o.vibe) : ''
    if (dev) await win.loadURL(`${dev}${dev.includes('?') ? '&' : '?'}capture=1&vibe=${vibe}`)
    else await win.loadFile(join(__dirname, '../renderer/index.html'), { query: { capture: '1', vibe } })
    // Chromium keeps one zoom per page address, so every window showing the app's page can follow this one. If the app
    // window did move, put it back (its picture must never change because an export started) and lay the capture page
    // out with a CSS zoom instead.
    const mainWc = windows.window?.webContents
    const mainZoom = mainWc && !mainWc.isDestroyed() ? mainWc.getZoomFactor() : 1
    const wantZoom = Math.max(0.5, Math.min(3, Math.min(width, height) / UI_SHORT_CSS))
    win.webContents.setZoomFactor(wantZoom)
    if (mainWc && !mainWc.isDestroyed() && Math.abs(mainWc.getZoomFactor() - mainZoom) > 0.001) {
      mainWc.setZoomFactor(mainZoom)
      win.webContents.setZoomFactor(1)
      await win.webContents.executeJavaScript(`window.__lyraCaptureZoom = ${wantZoom}; window.dispatchEvent(new Event('resize'))`).catch(() => undefined)
    }
    // wait until the screen has drawn the song
    for (let i = 0; i < 80; i++) {
      if (win.isDestroyed()) return { ok: false, reason: 'cancelled' }
      if (crashed) return { ok: false, reason: crashed }
      const ready = await win.webContents.executeJavaScript("document.documentElement.dataset.captureReady === '1'").catch(() => false)
      if (ready) return { ok: true }
      await new Promise((r) => setTimeout(r, 250))
    }
    return { ok: false, reason: 'The lyrics screen did not start in time.' }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

async function startStage(o: { videoId: string; width: number; height: number; fps: number; startSec: number }): Promise<{ ok: boolean; reason?: string; quality?: string; bestHeight?: number }> {
  stopStage()
  if (!/^[A-Za-z0-9_-]{11}$/.test(String(o.videoId))) return { ok: false, reason: 'Bad video id' }
  // up to 1440p: the sharpest picture that the hidden window can hand over at 30 pictures a second without choking the PC
  const width = Math.max(320, Math.min(2560, Math.round(o.width)))
  const height = Math.max(180, Math.min(1440, Math.round(o.height)))
  const fps = Math.max(2, Math.min(30, Math.round(o.fps)))
  const win = new BrowserWindow({
    show: false,
    width,
    height,
    useContentSize: true,
    frame: false,
    backgroundColor: '#000000',
    webPreferences: { offscreen: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required', sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  stage = win
  win.webContents.setAudioMuted(true)
  win.webContents.setFrameRate(fps)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.on('paint', (_e, _dirty, image) => handOver(image, height))
  const start = Math.max(0, Math.floor(o.startSec))
  const url =
    `https://www.youtube-nocookie.com/embed/${o.videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${o.videoId}&start=${start}` +
    '&modestbranding=1&playsinline=1&disablekb=1&rel=0&fs=0&iv_load_policy=3&cc_load_policy=0&vq=' + (height >= 1300 ? 'hd1440' : height >= 1000 ? 'hd1080' : 'hd720')
  win.webContents.on('dom-ready', () => void win.webContents.insertCSS(HIDE_PLAYER_UI).catch(() => undefined))
  try {
    await win.loadURL(url)
    await win.webContents.insertCSS(HIDE_PLAYER_UI)
    // wait until a picture is actually playing (or the player says it can not)
    for (let i = 0; i < 60; i++) {
      if (win.isDestroyed()) return { ok: false, reason: 'cancelled' }
      const state = (await win.webContents.executeJavaScript(
        "(() => { const v = document.querySelector('video'); const err = document.querySelector('.ytp-error-content-wrap-reason, .ytp-error'); return err ? 'error:' + (err.textContent || '').trim().slice(0, 120) : v && v.readyState >= 3 && !v.paused ? 'ok' : v && v.paused && v.readyState >= 3 ? 'paused' : 'wait' })()"
      )) as string
      if (state === 'ok') {
        const q = await settleQuality(win, height)
        return { ok: true, quality: q.res, bestHeight: q.best }
      }
      if (state === 'paused') await win.webContents.executeJavaScript("document.querySelector('video')?.play()")
      if (state.startsWith('error:')) return { ok: false, reason: state.slice(6) || 'This video can not be played here.' }
      await new Promise((r) => setTimeout(r, 500))
    }
    return { ok: false, reason: 'The video did not start in time.' }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

/**
 * YouTube starts a video in low resolution and works its way up. Ask the player for the best stream that is not
 * bigger than the picture we will hand over, then wait (up to 12 s) until it really arrives, so the first seconds
 * of the export are not blurry. Returns what we got, e.g. "2560x1440".
 */
async function settleQuality(win: BrowserWindow, height: number): Promise<{ res: string; best: number }> {
  const order = [['hd2160', 2160], ['hd1440', 1440], ['hd1080', 1080], ['hd720', 720], ['large', 480], ['medium', 360]] as const
  let seen = ''
  let best = 0
  for (let i = 0; i < 24; i++) {
    if (win.isDestroyed()) return { res: seen.split('|')[0] ?? '', best }
    seen = (await win.webContents
      .executeJavaScript(
        `(() => { const p = document.getElementById('movie_player'); const v = document.querySelector('video');
          const cap = ${height}; const order = ${JSON.stringify(order)};
          const have = p && p.getAvailableQualityLevels ? p.getAvailableQualityLevels() : [];
          const pick = order.find(([l, h]) => h <= cap && have.includes(l)) || order.find(([l]) => have.includes(l)) || order[2];
          if (p && p.setPlaybackQualityRange) { p.setPlaybackQualityRange(pick[0], pick[0]); p.setPlaybackQuality && p.setPlaybackQuality(pick[0]); }
          const top = order.find(([l]) => have.includes(l));
          return (v ? v.videoWidth + 'x' + v.videoHeight : '') + '|' + pick[1] + '|' + (top ? top[1] : 0) })()`
      )
      .catch(() => '')) as string
    const [res, want, top] = seen.split('|')
    best = Number(top ?? 0)
    const vh = Number((res ?? '').split('x')[1] ?? 0)
    if (vh && vh >= Math.min(Number(want), best || Number(want)) * 0.95) return { res: res ?? '', best }
    await new Promise((r) => setTimeout(r, 500))
  }
  return { res: seen.split('|')[0] ?? '', best }
}

/** Captures only the Spotify app's sound with resources/lyra-audio.exe and forwards the PCM to the app window. */
let audio: ChildProcessWithoutNullStreams | null = null

function stopAudio(): void {
  audio?.kill()
  audio = null
}

function spotifyRootPid(): Promise<number | null> {
  return new Promise((resolve) => {
    // Spotify runs many processes; the one without a --type flag is the parent, and capturing it includes its children
    const ps = "(Get-CimInstance Win32_Process -Filter \"Name='Spotify.exe'\" | Where-Object { $_.CommandLine -notmatch '--type=' } | Select-Object -First 1).ProcessId"
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 8000 }, (err, out) => {
      const n = Number(String(out).trim())
      resolve(!err && Number.isFinite(n) && n > 0 ? n : null)
    })
  })
}

async function startAudio(): Promise<{ ok: boolean; reason?: string }> {
  stopAudio()
  const exe = [join(process.resourcesPath ?? '', 'lyra-audio.exe'), join(app.getAppPath(), 'resources', 'lyra-audio.exe')].find((p) => existsSync(p))
  if (!exe) return { ok: false, reason: 'helper missing' }
  const pid = await spotifyRootPid()
  if (!pid) return { ok: false, reason: 'Spotify is not running' }
  return new Promise((resolve) => {
    const p = spawn(exe, ['--pid', String(pid)], { windowsHide: true })
    audio = p
    let settled = false
    const done = (r: { ok: boolean; reason?: string }): void => {
      if (settled) return
      settled = true
      resolve(r)
    }
    let err = ''
    p.stderr.on('data', (d: Buffer) => {
      err += d.toString()
      if (/ready/.test(err)) done({ ok: true })
    })
    p.stdout.on('data', (d: Buffer) => {
      const w = windows.window
      if (w && !w.isDestroyed()) w.webContents.send(EV.studioAudio, d)
    })
    p.on('error', (e) => done({ ok: false, reason: e.message }))
    p.on('exit', () => done({ ok: false, reason: err.trim().slice(0, 200) || 'the helper stopped' }))
    setTimeout(() => done({ ok: false, reason: 'timed out' }), 10_000)
  })
}

/** An open output file is closed and removed: a half-written MP4 has no index and can not be played. */
function dropOpenFiles(): void {
  for (const [id, fh] of files) {
    void fh.close().catch(() => undefined)
    const p = openPaths.get(id)
    if (p) rmSync(p, { force: true })
  }
  files.clear()
  openPaths.clear()
}

/** Temporary picture files left behind by a crash or a power cut. */
async function sweepTemp(): Promise<void> {
  try {
    for (const n of await readdir(tmpdir())) if (/^lyra-frames-\d+\.bin$/.test(n)) await rm(join(tmpdir(), n), { force: true })
  } catch {
    /* nothing to clean */
  }
}

/** Only the app's own window (and its export capture window) may use the studio: same rule as the other channels. */
function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>): void {
  ipcMain.handle(channel, (e, ...args) => {
    if (!windows.isAppContents(e.sender)) throw new Error('Blocked IPC from unknown sender')
    return fn(...(args as A))
  })
}

export function registerStudioIpc(): void {
  void sweepTemp()
  app.on('before-quit', () => {
    stopAudio()
    stopStage()
    dropOpenFiles()
    const s = sink
    if (s) rmSync(s.path, { force: true })
  })
  handle(CH.studioAudioStart, () => startAudio())
  handle(CH.studioAudioStop, () => stopAudio())
  handle(CH.studioMic, (on: boolean) => {
    micOpen = !!on
  })
  handle(CH.studioFrameCaptureStart, () => frameCaptureStart())
  handle(CH.studioFrameCaptureStop, () => frameCaptureStop())
  handle(CH.studioFrameRead, async (index: number) => {
    const s = sink
    if (!s?.reader || !Number.isInteger(index) || index < 0 || index >= s.times.length) return null
    const buf = Buffer.allocUnsafe(s.lengths[index]!)
    await s.reader.read(buf, 0, buf.length, s.offsets[index]!)
    return buf
  })
  handle(CH.studioFrameCaptureClear, () => frameCaptureClear())
  handle(CH.studioStageStart, (o: Parameters<typeof startStage>[0]) => startStage(o))
  handle(CH.studioUiStart, (o: Parameters<typeof startUi>[0]) => startUi(o))
  handle(CH.studioStageSeek, async (sec: number) => {
    if (stage && !stage.isDestroyed() && Number.isFinite(sec)) await stage.webContents.executeJavaScript(`(() => { const v = document.querySelector('video'); if (v) { v.currentTime = ${Math.max(0, sec)}; v.play() } })()`)
  })
  handle(CH.studioStageSync, async (sec: number) => {
    if (!stage || stage.isDestroyed() || !Number.isFinite(sec)) return
    await stage.webContents.executeJavaScript(`(() => { const v = document.querySelector('video'); if (v && Math.abs(v.currentTime - ${sec}) > 0.7) v.currentTime = ${Math.max(0, sec)} })()`)
  })
  handle(CH.studioStageStop, () => stopStage())
  handle(CH.studioOpen, async (suggested: string) => {
    const name = sanitizeFileName(suggested)
    const win = windows.window
    const opts = { title: 'Save lyric video', defaultPath: name, filters: [{ name: 'MP4 video', extensions: ['mp4'] }] }
    // development only: skip the dialog so the export can be tested without clicking
    const test = !app.isPackaged ? process.env['LYRA_TEST_SAVE'] : undefined
    const r = test ? { canceled: false, filePath: test } : win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (r.canceled || !r.filePath) return null
    const fh = await open(r.filePath, 'w')
    const id = nextId++
    files.set(id, fh)
    openPaths.set(id, r.filePath)
    created.add(r.filePath.toLowerCase())
    setExporting(true)
    // free space on that drive, so the dialog can warn before a long export runs out of room
    const freeBytes = await statfs(dirname(r.filePath)).then((s) => Number(s.bavail) * Number(s.bsize)).catch(() => null)
    return { id, path: r.filePath, freeBytes }
  })
  handle(CH.studioWrite, async (id: number, position: number, chunk: Uint8Array) => {
    const fh = files.get(id)
    if (!fh || !Number.isFinite(position) || position < 0) return
    await fh.write(chunk, 0, chunk.byteLength, position)
  })
  handle(CH.studioClose, async (id: number) => {
    const fh = files.get(id)
    files.delete(id)
    openPaths.delete(id)
    await fh?.close()
  })
  handle(CH.studioDiscard, async (path: string) => {
    if (isOwnOutput(created, path)) await rm(path, { force: true })
  })
  handle(CH.studioEnd, () => {
    setExporting(false)
    void frameCaptureClear()
  })
  handle(CH.studioSaveImage, async (videoPath: string, jpeg: Uint8Array) => {
    if (!isOwnOutput(created, videoPath) || !(jpeg instanceof Uint8Array) || jpeg.byteLength > 20 * 1024 * 1024) return null
    const out = outputSibling(videoPath, ' (cover)', 'jpg')
    if (!out) return null
    await writeFile(out, jpeg)
    return out
  })
  handle(CH.studioSaveText, async (videoPath: string, ext: string, text: string) => {
    if (!isOwnOutput(created, videoPath) || typeof text !== 'string' || text.length > 2_000_000) return null
    if (ext !== 'lrc' && ext !== 'srt') return null
    const out = outputSibling(videoPath, '', ext)
    if (!out) return null
    await writeFile(out, text, 'utf8')
    return out
  })
  handle(CH.studioReveal, (path: string) => {
    if (isOwnOutput(created, path)) shell.showItemInFolder(path)
  })
}
