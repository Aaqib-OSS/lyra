import { app, type BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { canAutoReload, crashNotice, decideSafeMode, nextCrashState, type StartupMarker } from '../core/reliability'
import { createLogger } from './logger'

const log = createLogger('crash')

const HEALTHY_AFTER_MS = 20_000
let safe = false
let startup: StartupMarker = { crashes: 0, ok: false }
let gpuFallback = false
const reloads: number[] = []

const userFile = (name: string): string => join(app.getPath('userData'), name)

function readJson<T>(name: string): T | null {
  try {
    const p = userFile(name)
    return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : null
  } catch {
    return null
  }
}

function writeJson(name: string, value: unknown): void {
  try {
    const p = userFile(name)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, JSON.stringify(value))
  } catch (e) {
    log.warn(`could not write ${name}`, (e as Error).message)
  }
}

export const isSafeMode = (): boolean => safe
export const usingSoftwareRendering = (): boolean => gpuFallback
export const startupState = (): StartupMarker => ({ ...startup })

/**
 * Call once, at the very top of the main process, BEFORE app is ready: it decides safe mode, applies a remembered
 * GPU fallback (which must happen before ready) and installs the process-level handlers.
 */
export function installCrashGuard(): void {
  startup = nextCrashState(readJson<StartupMarker>('startup.json'))
  safe = decideSafeMode(startup, process.argv.includes('--safe-mode'))
  writeJson('startup.json', startup)

  // a remembered "this GPU crashed" only holds for the version that crashed: a new version gets another try
  const gpu = readJson<{ version?: string }>('gpu-fallback.json')
  gpuFallback = safe || gpu?.version === app.getVersion()
  if (gpuFallback) app.disableHardwareAcceleration()

  process.on('uncaughtException', (e) => log.error('uncaughtException', e))
  process.on('unhandledRejection', (e) => log.error('unhandledRejection', e instanceof Error ? e : String(e)))

  app.on('child-process-gone', (_e, d) => {
    log.error(`child process gone: ${d.type} ${d.reason} (code ${d.exitCode})${d.name ? ` ${d.name}` : ''}`)
    const bad = d.reason === 'crashed' || d.reason === 'abnormal-exit' || d.reason === 'launch-failed' || d.reason === 'integrity-failure'
    if (d.type === 'GPU' && bad && !gpuFallback) {
      // GPU crashed: from the next start on use software rendering (until the next app version)
      writeJson('gpu-fallback.json', { version: app.getVersion(), at: new Date().toISOString() })
      log.warn('GPU process crashed; software rendering will be used from the next start')
    }
  })

  if (safe) log.warn(`starting in SAFE MODE (${startup.crashes} unfinished start(s) in a row, or --safe-mode)`)
}

/** Reload the page after a crash, but never in a loop, and tell the user in the app. */
function recover(win: BrowserWindow, reason: string): void {
  const now = Date.now()
  if (win.isDestroyed()) return
  if (!canAutoReload(reloads, now)) return log.error(`not reloading again (too many reloads in a minute) after: ${reason}`)
  reloads.push(now)
  win.webContents.once('did-finish-load', () => {
    const msg = JSON.stringify(crashNotice(reason))
    void win.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('lyra:notice',{detail:{message:${msg},kind:'error'}}))`).catch(() => undefined)
  })
  try {
    win.webContents.reload()
  } catch (e) {
    log.error('reload failed', e)
  }
}

/** Hook one app window: renderer crashes, hangs, failed loads and renderer warnings/errors into the log. */
export function attachWindowGuard(win: BrowserWindow): void {
  const wc = win.webContents
  wc.on('render-process-gone', (_e, d) => {
    log.error(`renderer gone: ${d.reason} (code ${d.exitCode})`)
    if (d.reason !== 'clean-exit') recover(win, d.reason)
  })
  wc.on('unresponsive', () => {
    log.warn('window unresponsive')
    // give it a moment: a long synchronous task is not a hang
    setTimeout(() => {
      if (!win.isDestroyed() && (wc as unknown as { isHung?: () => boolean }).isHung?.() === true) recover(win, 'unresponsive')
    }, 15_000)
  })
  wc.on('responsive', () => log.info('window responsive again'))
  wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* aborted */) return
    log.error(`page failed to load (${code} ${desc}) ${url.split('?')[0]}`)
  })
  // renderer console.warn / console.error land in the main log too (scrubbed there)
  wc.on('console-message', (e) => {
    const lvl = (e as unknown as { level?: string }).level
    if (lvl === 'warning') log.warn('[renderer]', (e as unknown as { message?: string }).message ?? '')
    else if (lvl === 'error') log.error('[renderer]', (e as unknown as { message?: string }).message ?? '')
  })
  // the start counts as healthy once the window has loaded and stayed up for a while
  wc.once('did-finish-load', () => {
    setTimeout(() => {
      startup = { crashes: 0, ok: true }
      writeJson('startup.json', startup)
    }, HEALTHY_AFTER_MS).unref()
  })
}
