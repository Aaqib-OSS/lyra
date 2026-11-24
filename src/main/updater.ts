import { app, net } from 'electron'
import { autoUpdater } from 'electron-updater'
import { EventEmitter } from 'node:events'
import { accessSync, constants, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { UpdateState } from '@shared/types'
import { createLogger } from './logger'
import { friendlyUpdateError, isTransient, releaseNotesToText, retryDelayMs } from './updateHelpers'

const log = createLogger('updater')

const FIRST_CHECK_MS = 25_000
const EVERY_MS = 6 * 3600_000

/**
 * Self-updates from GitHub releases. electron-updater downloads only the changed blocks (blockmap),
 * keeps the downloaded installer in its cache and verifies its sha512 against latest.yml before it is ever run,
 * so nothing is downloaded twice and a corrupted file is never installed; the update installs when the app quits
 * (or immediately via `install()`).
 *
 * Reliability: a failed check because of the network is retried after 5 min, 15 min and 1 h (then the normal 6 h
 * cadence continues); no scheduled check is started while the PC is offline; a finished update's installer is removed
 * from the cache once the app is up to date.
 */
class Updater extends EventEmitter {
  private current: UpdateState = { state: 'idle' }
  private timer: NodeJS.Timeout | null = null
  private retryTimer: NodeJS.Timeout | null = null
  private started = false
  private failures = 0
  /** the 'error' event and the rejected promise report the same failure; count it once per check */
  private errorSeen = false
  private notes: string | undefined
  private cacheDir: string | null = null

  get state(): UpdateState {
    return this.current
  }

  private set(s: UpdateState): void {
    this.current = s
    this.emit('state', s)
  }

  start(): void {
    if (this.started) return
    this.started = true
    if (!app.isPackaged) {
      this.set({ state: 'disabled', reason: 'Updates are only available in the installed app.' })
      return
    }
    this.useInstallFolderForDownloads()
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowPrerelease = false
    autoUpdater.logger = {
      info: (m: unknown) => log.info(String(m)),
      warn: (m: unknown) => log.warn(String(m)),
      error: (m: unknown) => log.error(String(m)),
      debug: () => undefined
    }

    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking' }))
    autoUpdater.on('update-not-available', () => {
      this.failures = 0
      this.set({ state: 'none', checkedAt: Date.now() })
      this.pruneStaleDownloads()
    })
    autoUpdater.on('update-available', (i) => {
      this.failures = 0
      this.notes = releaseNotesToText(i.releaseNotes)
      this.set({ state: 'downloading', version: i.version, percent: 0, notes: this.notes })
    })
    autoUpdater.on('download-progress', (p) => {
      const v = this.current.state === 'downloading' ? this.current.version : ''
      this.set({ state: 'downloading', version: v, percent: Math.round(p.percent), notes: this.notes })
    })
    autoUpdater.on('update-downloaded', (i) =>
      this.set({ state: 'ready', version: i.version, notes: this.notes ?? releaseNotesToText(i.releaseNotes) })
    )
    autoUpdater.on('error', (e) => this.fail(e?.message ?? String(e)))

    setTimeout(() => void this.check(true), FIRST_CHECK_MS)
    this.timer = setInterval(() => void this.check(true), EVERY_MS)
  }

  /** One place for failures: friendly message, and a sooner retry when the cause is probably temporary. */
  private fail(raw: string): void {
    this.errorSeen = true
    log.warn('update error', raw)
    this.failures++
    const delay = isTransient(raw) ? retryDelayMs(this.failures) : null
    this.set({ state: 'error', message: friendlyUpdateError(raw), willRetry: delay !== null })
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = delay === null ? null : setTimeout(() => void this.check(true), delay)
  }

  /**
   * Keep downloaded updates next to the app (the folder the user chose in the installer) instead of
   * %LOCALAPPDATA% on the system drive. Falls back to electron-updater's default if it isn't writable.
   */
  private useInstallFolderForDownloads(): void {
    try {
      // A SIBLING of the install folder (same drive): the downloaded installer must not live inside the folder
      // the old uninstaller deletes during an update, or that delete fails on the running installer.
      const dir = `${dirname(process.execPath)}-updates`
      mkdirSync(dir, { recursive: true })
      accessSync(dir, constants.W_OK)
      const adapter = (autoUpdater as unknown as { app: object }).app
      Object.defineProperty(adapter, 'baseCachePath', { get: () => dir, configurable: true })
      this.cacheDir = dir
      log.info('update downloads go to', dir)
      // an earlier build cached inside the install folder; drop it so it can never block an uninstall
      rmSync(join(dirname(process.execPath), 'updates'), { recursive: true, force: true })
      // remove the old default cache once, so an earlier download doesn't linger on the system drive
      const legacy = join(process.env['LOCALAPPDATA'] ?? '', 'lyra-updater')
      if (process.env['LOCALAPPDATA']) rmSync(legacy, { recursive: true, force: true })
    } catch (e) {
      log.warn('could not use the install folder for updates; using the default cache', (e as Error).message)
    }
  }

  /** The app is up to date, so a cached installer of an older release is dead weight (tens of MB). Never runs during a download. */
  private pruneStaleDownloads(): void {
    if (!this.cacheDir) return
    try {
      rmSync(join(this.cacheDir, 'lyra-updater', 'pending'), { recursive: true, force: true })
    } catch (e) {
      log.warn('could not clean the update cache', (e as Error).message)
    }
  }

  /** @param scheduled true for the timers (skipped silently while offline); a click on "Check now" always tries. */
  async check(scheduled = false): Promise<void> {
    if (!app.isPackaged) return
    // don't interrupt a finished or in-flight download
    if (this.current.state === 'downloading' || this.current.state === 'ready' || this.current.state === 'checking') return
    if (scheduled && !net.isOnline()) {
      log.info('offline, skipping the scheduled update check')
      return
    }
    this.errorSeen = false
    try {
      await autoUpdater.checkForUpdates()
    } catch (e) {
      if (!this.errorSeen) this.fail((e as Error).message ?? String(e))
    }
  }

  install(): void {
    if (this.current.state === 'ready') autoUpdater.quitAndInstall(true, true) // silent install, relaunch afterwards
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer)
    if (this.retryTimer) clearTimeout(this.retryTimer)
  }
}

export const updater = new Updater()
