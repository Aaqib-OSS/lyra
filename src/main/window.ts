import { BrowserWindow, app, powerMonitor, screen, shell, type Rectangle } from 'electron'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { EV } from '@shared/ipc'
import type { ModeEvent, Rect, Settings, ViewMode } from '@shared/types'
import { MINIMAL_RATIO, PEEK_MS, clampResize, clampToArea, clampToAreas, cornerPlacement, needsRecovery, pickArea, snapToEdges } from '@shared/windowGeometry'
import { createLogger } from './logger'
import { allowThrottling } from '@core/calm'
import { settings } from './settings'
import { appIcon } from './tray'

const log = createLogger('window')

const MARGIN = 24
const SNAP_MARGIN = 12 // resting gap when snapped to a screen edge
const SNAP_DISTANCE = 16
const SETTLE_FALLBACK_MS = 800
/** Added to the "launch at startup" entry; with the "start in the tray" setting on, such a launch does not open the widget. */
export const HIDDEN_ARG = '--hidden'
const UI_READY_TIMEOUT_MS = 6000
const UNLOAD_AFTER_MS = 60_000 // hidden in the tray this long -> free the page

function sizeFor(mode: Exclude<ViewMode, 'full'>, s: Settings, wa: Rectangle = screen.getPrimaryDisplay().workArea): { width: number; height: number } {
  switch (mode) {
    case 'minimal':
      return { width: Math.min(Math.round(s.compactWidth * MINIMAL_RATIO), wa.width), height: 64 }
    case 'compact':
      return { width: Math.min(s.compactWidth, wa.width), height: 140 }
    case 'mini': {
      // tall player, but never taller than the screen's usable area
      const maxH = wa.height - MARGIN * 2
      if (s.miniSize) return { width: Math.min(s.miniSize.width, wa.width), height: Math.min(s.miniSize.height, maxH) }
      return { width: Math.min(Math.max(s.compactWidth + 40, 420), wa.width), height: Math.min(700, maxH) }
    }
  }
}

const workAreas = (): Rectangle[] => screen.getAllDisplays().map((d) => d.workArea)
const sameRect = (a: Rectangle, b: Rectangle): boolean => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

const union = (a: Rectangle, b: Rectangle): Rectangle => {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y }
}
const rel = (r: Rectangle, origin: Rectangle): Rect => ({ x: r.x - origin.x, y: r.y - origin.y, width: r.width, height: r.height })

class WindowManager extends EventEmitter {
  private win: BrowserWindow | null = null
  private mode: ViewMode = 'compact'
  /** Top-left of the widget in windowed modes; where we return to after fullscreen. */
  private anchor: { x: number; y: number } | null = null
  /** Final window bounds waiting for the renderer to finish its shell transition. */
  private pendingFinal: Rectangle | null = null
  private settleTimer: NodeJS.Timeout | null = null
  private drag: { cx: number; cy: number; bounds: Rectangle } | null = null
  private resize: { cx: number; cy: number; bounds: Rectangle } | null = null
  private persistTimer: NodeJS.Timeout | null = null
  private sizeTimer: NodeJS.Timeout | null = null
  private topTimer: NodeJS.Timeout | null = null
  private fadeTimer: NodeJS.Timeout | null = null
  private outsideSince: number | null = null
  private faded = false
  private quitting = false
  private loginState: boolean | null = null
  /** True when this launch was a login start that stays in the tray. */
  startedHidden = false
  private locked = false
  private peekTimer: NodeJS.Timeout | null = null
  private recoverTimer: NodeJS.Timeout | null = null
  /** What the tray shows: the song and (while the widget is hidden) the line being sung. */
  private nowTrack = ''
  private nowLine = ''
  /** Hidden windows that show the lyrics screen for a lyric-video export (see studio.ts). They hear what the app window hears. */
  readonly captures = new Set<BrowserWindow>()

  /** Is this page the app window or one of its export capture windows? */
  isAppContents(c: Electron.WebContents): boolean {
    if (c === this.window?.webContents) return true
    for (const w of this.captures) if (!w.isDestroyed() && w.webContents === c) return true
    return false
  }

  /** Send an event to the app window and to any export capture window. */
  broadcast(channel: string, payload: unknown): void {
    this.window?.webContents.send(channel, payload)
    for (const w of this.captures) if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }

  get window(): BrowserWindow | null {
    return this.win && !this.win.isDestroyed() ? this.win : null
  }

  getMode(): ViewMode {
    return this.mode
  }

  create(): BrowserWindow {
    const s = settings.get()
    this.mode = s.defaultMode
    const size = sizeFor(this.mode as Exclude<ViewMode, 'full'>, s)
    const pos = this.initialPosition(size)
    this.anchor = pos

    const win = new BrowserWindow({
      ...size,
      ...pos,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      maximizable: false,
      minimizable: true,
      fullscreenable: false, // we emulate fullscreen with display bounds (reliable with transparency)
      hasShadow: false,
      skipTaskbar: false, // always in the taskbar so a minimized widget can be restored
      title: 'Lyra',
      icon: appIcon(),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        backgroundThrottling: true
      }
    })
    this.win = win

    win.setAlwaysOnTop(s.alwaysOnTop, 'screen-saver')
    win.setContentProtection(s.hideOnScreenShare)

    // Hard-lock navigation: the renderer is a single local page.
    win.webContents.setWindowOpenHandler(({ url }) => {
      // Only a short allow-list of https hosts may be opened in the user's browser.
      const allowed = /^https:\/\/(open\.spotify\.com|accounts\.spotify\.com|developer\.spotify\.com|lrclib\.net|musicbrainz\.org)(\/|$)|^https:\/\/github\.com\/DhruvHarani1(\/|$)/
      if (allowed.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    win.webContents.on('will-navigate', (e) => e.preventDefault())

    // Also keep out anything that would load a page we did not ship (redirects, embedded <webview>s).
    win.webContents.on('will-redirect', (e) => e.preventDefault())
    win.webContents.on('will-attach-webview', (e) => e.preventDefault())

    // Started by Windows at login with "start in the tray" on: stay hidden (the tray icon and shortcuts still work).
    this.startedHidden = s.startInTray && process.argv.includes(HIDDEN_ARG)
    win.once('ready-to-show', () => {
      if (this.startedHidden) this.armUnload()
      else win.showInactive()
      this.broadcastMode()
    })
    win.on('moved', () => this.onMoved())
    win.on('hide', () => this.armUnload())
    win.on('show', () => clearTimeout(this.unloadTimer))
    win.on('show', () => this.syncThrottle())
    win.on('hide', () => this.syncThrottle())
    win.on('minimize', () => this.syncThrottle())
    win.on('restore', () => this.syncThrottle())
    win.on('hide', () => this.emit('tip')) // the tray tooltip depends on visibility
    win.on('show', () => this.emit('tip'))
    // A display was unplugged / changed resolution / DPI, or the PC woke up or was unlocked: put the window back on a screen.
    screen.on('display-removed', () => this.scheduleRecover())
    screen.on('display-added', () => this.scheduleRecover())
    screen.on('display-metrics-changed', () => this.scheduleRecover())
    powerMonitor.on('resume', () => this.scheduleRecover())
    powerMonitor.on('unlock-screen', () => this.scheduleRecover())
    win.on('focus', () => this.cancelPeek())
    // The X buttons in the UI quit explicitly; a system "close" (Alt+F4, taskbar) just hides to the tray.
    win.on('close', (e) => {
      if (this.quitting) return
      e.preventDefault()
      win.hide()
    })
    app.on('before-quit', () => {
      this.quitting = true
    })
    // Windows silently drops TOPMOST when other topmost windows take focus; re-assert it.
    win.on('blur', () => this.reassertTop())
    win.on('show', () => this.reassertTop())
    this.topTimer = setInterval(() => this.reassertTop(), 2500)
    this.fadeTimer = setInterval(() => this.tickFade(), 250)
    win.on('closed', () => {
      if (this.topTimer) clearInterval(this.topTimer)
      if (this.fadeTimer) clearInterval(this.fadeTimer)
      this.win = null
    })

    this.loadApp(win)

    return win
  }

  private loadApp(win: BrowserWindow): Promise<void> {
    return process.env['ELECTRON_RENDERER_URL'] ? win.loadURL(process.env['ELECTRON_RENDERER_URL']) : win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // ---- throttling: music playing in a window that is on screen (even under another app) must keep the video and lyrics running ----

  private playing = false

  /** Told by the playback layer whenever the song starts or stops. */
  setPlaying(playing: boolean): void {
    if (playing === this.playing) return
    this.playing = playing
    this.syncThrottle()
  }

  private syncThrottle(): void {
    const w = this.window
    if (!w || w.isDestroyed()) return
    const throttle = allowThrottling({ playing: this.playing, visible: w.isVisible(), minimized: w.isMinimized() })
    w.webContents.setBackgroundThrottling(throttle)
  }

  // ---- memory: while the widget sits hidden in the tray, drop the page (video, blur layers, caches) and bring it back on demand ----

  private unloaded = false
  private unloadTimer: ReturnType<typeof setTimeout> | undefined
  private waking: Promise<void> | null = null

  private armUnload(): void {
    clearTimeout(this.unloadTimer)
    this.unloadTimer = setTimeout(() => {
      const w = this.window
      if (!w || w.isVisible() || this.quitting || this.unloaded) return
      this.unloaded = true
      void w.webContents.loadURL('about:blank')
    }, UNLOAD_AFTER_MS)
  }

  /** Make sure the page is loaded (resolves once the UI is up and listening). */
  private wake(): Promise<void> {
    const w = this.window
    if (!w || !this.unloaded) return Promise.resolve()
    this.waking ??= (async () => {
      try {
        await this.loadApp(w)
        await this.uiReady() // let the UI mount and subscribe before anything is sent to it
        this.unloaded = false
        this.broadcastMode()
      } finally {
        this.waking = null
      }
    })()
    return this.waking
  }

  /**
   * Resolves once the page has mounted the app (the `.root` element exists only after the UI subscribed to
   * everything), or after a timeout so a broken page can never hang a command forever.
   */
  uiReady(): Promise<void> {
    const started = Date.now()
    return new Promise((resolve) => {
      const poll = (): void => {
        const w = this.window
        if (!w || Date.now() - started > UI_READY_TIMEOUT_MS) return resolve()
        w.webContents
          .executeJavaScript("!!document.querySelector('.root')")
          .then((ok: boolean) => (ok ? resolve() : setTimeout(poll, 60)))
          .catch(() => setTimeout(poll, 60))
      }
      poll()
    })
  }

  /** Show a toast in the app (once its page is up); dropped while the page is unloaded in the tray. */
  notice(message: string, kind: 'info' | 'error' = 'info'): void {
    if (this.unloaded) return
    void this.uiReady().then(() => this.window?.webContents.send(EV.notice, { message, kind }))
  }

  /** Send a command (global shortcut / tray) to the UI, waking it first if it was unloaded. */
  sendCommand(cmd: string): void {
    void this.wake().then(() => {
      this.window?.webContents.send(EV.command, cmd)
      if (!this.window?.isVisible()) this.armUnload()
    })
  }

  private initialPosition(size: { width: number; height: number }): { x: number; y: number } {
    const saved = settings.get().position
    if (saved) return this.clampToDisplay({ ...saved, ...size })
    return cornerPlacement(size, screen.getPrimaryDisplay().workArea, MARGIN)
  }

  /** Keep a rectangle fully on the display it mostly overlaps (handles unplugged monitors). */
  private clampToDisplay(r: Rectangle): { x: number; y: number } {
    const { x, y } = clampToAreas(r, workAreas())
    return { x, y }
  }

  // ---- displays: unplugged monitor, resolution / DPI / taskbar change, wake from sleep ----

  private scheduleRecover(): void {
    if (this.recoverTimer) clearTimeout(this.recoverTimer)
    // Windows sends a burst of events when a monitor changes; act once the layout has settled.
    this.recoverTimer = setTimeout(() => {
      this.recoverTimer = null
      this.recoverPlacement()
      this.reassertTop(true)
    }, 500)
  }

  /**
   * Put the window back on a screen. Fullscreen follows its display's work area (a resolution or taskbar change);
   * a windowed mode is only moved when most of it is off every screen, so a widget the user parked half off the edge stays.
   * `force` (the tray's "Bring back to screen") always fits it.
   */
  recoverPlacement(force = false): void {
    const w = this.window
    if (!w || this.drag || this.resize || this.pendingFinal) return
    const b = w.getBounds()
    const areas = workAreas()
    if (this.mode === 'full') {
      const wa = pickArea(b, areas)
      if (!sameRect(b, wa)) w.setBounds(wa)
      return
    }
    if (!force && !needsRecovery(b, areas)) return
    const wa = pickArea(b, areas)
    const size = sizeFor(this.mode, settings.get(), wa)
    // `pickArea` falls back to the nearest display when the window is on none, so a lost window lands on a real one
    const fit = clampToArea({ x: b.x, y: b.y, ...size }, wa)
    if (!sameRect(b, fit)) {
      log.info('window brought back onto a screen', fit)
      w.setBounds(fit)
    }
    this.anchor = { x: fit.x, y: fit.y }
    settings.update({ position: this.anchor })
  }

  /**
   * "Fade when idle": decided here from the OS cursor position (reliable even when the window is not
   * focused) and pushed to the renderer, which only applies the dimming.
   */
  private tickFade(): void {
    const w = this.window
    if (!w) return
    const enabled = settings.get().autoHide && (this.mode === 'compact' || this.mode === 'minimal') && w.isVisible() && !this.drag && !this.resize
    if (!enabled && !this.faded) {
      this.outsideSince = null
      return
    }
    let fade = false
    if (enabled) {
      const c = screen.getCursorScreenPoint()
      const b = w.getBounds()
      const inside = c.x >= b.x && c.x < b.x + b.width && c.y >= b.y && c.y < b.y + b.height
      if (inside) this.outsideSince = null
      else {
        this.outsideSince ??= Date.now()
        fade = Date.now() - this.outsideSince >= 1200
      }
    } else this.outsideSince = null
    if (fade !== this.faded) {
      this.faded = fade
      w.webContents.send(EV.fade, fade)
    }
  }

  /** Put the widget back in the default corner at its current mode's size (used by Reset). */
  resetPlacement(): void {
    const w = this.window
    if (!w || this.mode === 'full') return
    const wa = screen.getPrimaryDisplay().workArea
    const size = sizeFor(this.mode, settings.get(), wa)
    const pos = cornerPlacement(size, wa, MARGIN)
    this.anchor = pos
    w.setBounds({ ...pos, ...size })
  }

  /** Keep the widget above other windows (no focus steal). `force` also after resume / unlock / display changes. */
  private reassertTop(force = false): void {
    const w = this.window
    if (!w || !w.isVisible() || w.isMinimized() || this.drag) return
    // Fullscreen is a normal window: Alt+Tab to another app must show that app.
    if (this.mode !== 'full' && settings.get().alwaysOnTop) {
      // Windows drops the TOPMOST flag quietly; only touch the style when it really is gone (no needless z-order churn).
      if (force || !w.isAlwaysOnTop()) w.setAlwaysOnTop(true, 'screen-saver')
      w.moveTop() // other topmost windows that took focus still sit above us even with the flag set
    }
  }

  private onMoved(): void {
    if (this.mode === 'full' || this.pendingFinal) return
    const w = this.window
    if (!w) return
    const b = w.getBounds()
    this.anchor = { x: b.x, y: b.y }
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => settings.update({ position: this.anchor }), 400)
  }

  // ---- modes ----

  setMode(next: ViewMode): void {
    const w = this.window
    if (!w || next === this.mode) return
    // a second request while the previous animation is still running: land that one first so the bounds are real
    if (this.pendingFinal) this.settle()
    const prev = this.mode
    const s = settings.get()
    this.mode = next
    if (next === 'full') this.setLocked(false) // click-through only makes sense for the small widgets

    if (prev !== 'full') {
      const b = w.getBounds()
      this.anchor = { x: b.x, y: b.y }
    }

    let target: Rectangle
    if (next === 'full') {
      // Work area (not full bounds): without topmost the taskbar would otherwise cover the bottom controls.
      target = screen.getDisplayMatching(w.getBounds()).workArea
      w.setSkipTaskbar(false)
      w.setAlwaysOnTop(false)
    } else {
      const size = sizeFor(next, s, pickArea(w.getBounds(), workAreas()))
      const a = this.anchor ?? this.initialPosition(size)
      // Collapsing from the taller mini player keeps the bottom edge stable for bottom-anchored widgets.
      const from = w.getBounds()
      const anchoredBottom = prev === 'mini' && next !== 'mini'
      const y = anchoredBottom ? from.y + from.height - size.height : a.y
      const x = prev === 'full' ? a.x : from.x
      const pos = this.clampToDisplay({ x, y: prev === 'full' ? a.y : y, ...size })
      target = { ...pos, ...size }
      w.setAlwaysOnTop(s.alwaysOnTop, 'screen-saver')
      if (prev === 'full') w.focus()
    }

    this.transitionTo(next, target)
    if (next === 'mini' || next === 'full') w.focus()
  }

  /**
   * Shell-driven transition: grow the window ONCE to cover both the old and new rectangles and let the
   * renderer animate its own shell between them (GPU-composited, no per-frame OS resize). The window is
   * shrunk to its final size in `settle()` once the animation finishes.
   */
  private transitionTo(mode: ViewMode, target: Rectangle): void {
    const w = this.window
    if (!w) return
    const from = w.getBounds()
    if (this.settleTimer) clearTimeout(this.settleTimer)

    // Reduced motion, or the page is unloaded / still loading (nobody to animate): jump straight to the final size.
    if (settings.get().reducedMotion === 'on' || this.unloaded || this.waking) {
      this.pendingFinal = null
      w.setBounds(target)
      this.sendMode({ mode })
      return
    }
    const big = union(from, target)
    this.pendingFinal = target
    if (big.x !== from.x || big.y !== from.y || big.width !== from.width || big.height !== from.height) w.setBounds(big)
    this.sendMode({ mode, from: rel(from, big), to: rel(target, big) })
    this.settleTimer = setTimeout(() => this.settle(), SETTLE_FALLBACK_MS)
  }

  /** Called by the renderer when its shell animation has finished. */
  settle(): void {
    if (this.settleTimer) clearTimeout(this.settleTimer)
    this.settleTimer = null
    const w = this.window
    const final = this.pendingFinal
    this.pendingFinal = null
    if (w && final) w.setBounds(final)
  }

  toggleExpand(): void {
    if (this.mode === 'full') this.setMode('mini')
    else if (this.mode === 'mini') this.setMode(settings.get().defaultMode)
    else this.setMode('mini')
  }

  toggleFullscreen(): void {
    this.setMode(this.mode === 'full' ? 'mini' : 'full')
  }

  private broadcastMode(): void {
    this.sendMode({ mode: this.mode })
  }

  private sendMode(e: ModeEvent): void {
    this.window?.webContents.send(EV.mode, e)
    this.emit('mode', e.mode)
  }

  // ---- dragging (cursor-driven; immune to DPI rounding drift) ----

  dragStart(): void {
    const w = this.window
    if (!w || this.mode === 'full') return
    const c = screen.getCursorScreenPoint()
    this.drag = { cx: c.x, cy: c.y, bounds: w.getBounds() }
  }

  dragMove(): void {
    const w = this.window
    if (!w || !this.drag) return
    const c = screen.getCursorScreenPoint()
    const { bounds } = this.drag
    const moved = { x: bounds.x + (c.x - this.drag.cx), y: bounds.y + (c.y - this.drag.cy), width: bounds.width, height: bounds.height }
    w.setBounds({ ...moved, ...this.snap(moved) })
  }

  /** Magnetic edges: snap to the work area border (with a small margin) when close. */
  private snap(r: Rectangle): { x: number; y: number } {
    return snapToEdges(r, screen.getDisplayMatching(r).workArea, SNAP_MARGIN, SNAP_DISTANCE)
  }

  dragEnd(): void {
    this.drag = null
    this.onMoved()
  }

  // ---- resizing (custom grip: the window itself is not user-resizable because it is transparent) ----

  resizeStart(): void {
    const w = this.window
    if (!w || this.mode === 'full' || this.pendingFinal) return
    const c = screen.getCursorScreenPoint()
    this.resize = { cx: c.x, cy: c.y, bounds: w.getBounds() }
  }

  resizeMove(): void {
    const w = this.window
    const r = this.resize
    if (!w || !r || this.mode === 'full') return
    const c = screen.getCursorScreenPoint()
    const wa = screen.getDisplayMatching(r.bounds).workArea
    // widgets are fixed-height; only the width is adjustable
    const size = clampResize(this.mode, { width: r.bounds.width + (c.x - r.cx), height: r.bounds.height + (c.y - r.cy) }, r.bounds, wa)
    w.setBounds({ x: r.bounds.x, y: r.bounds.y, ...size })
  }

  resizeEnd(): void {
    this.resize = null
    this.persistSize()
  }

  /** Keyboard resize from the grip (arrow keys): the same limits as dragging it. */
  resizeBy(dw: number, dh: number): void {
    const w = this.window
    if (!w || this.mode === 'full' || this.pendingFinal || this.resize) return
    if (!Number.isFinite(dw) || !Number.isFinite(dh)) return
    const b = w.getBounds()
    const size = clampResize(this.mode, { width: b.width + Math.max(-200, Math.min(200, dw)), height: b.height + Math.max(-200, Math.min(200, dh)) }, b, screen.getDisplayMatching(b).workArea)
    if (size.width === b.width && size.height === b.height) return
    w.setBounds({ x: b.x, y: b.y, ...size })
    if (this.sizeTimer) clearTimeout(this.sizeTimer)
    this.sizeTimer = setTimeout(() => this.persistSize(), 400)
  }

  private persistSize(): void {
    const w = this.window
    if (!w || this.mode === 'full') return
    const b = w.getBounds()
    if (this.mode === 'mini') settings.update({ miniSize: { width: b.width, height: b.height } })
    else settings.update({ compactWidth: Math.round(b.width / (this.mode === 'minimal' ? MINIMAL_RATIO : 1)) })
  }

  // ---- visibility / settings ----

  toggleVisible(): void {
    const w = this.window
    if (!w) return
    if (w.isVisible() && !w.isMinimized()) w.hide()
    else this.show()
  }

  show(): void {
    const w = this.window
    if (!w) return
    this.cancelPeek()
    void this.wake().then(() => {
      if (w.isDestroyed()) return
      this.setLocked(false) // an explicit "show me" always gives the mouse back
      if (w.isMinimized()) w.restore()
      w.show()
      w.focus()
    })
  }

  /** Show the window (waking it) and switch mode; used by the tray and the jump list. */
  showMode(mode: ViewMode): void {
    this.show()
    this.setMode(mode)
  }

  hide(): void {
    this.cancelPeek()
    this.window?.hide()
  }

  // ---- peek: look at the widget for a few seconds without taking focus ----

  /** Show the widget for PEEK_MS without stealing focus (hidden or minimized-to-tray), then hide it again. */
  peek(): void {
    const w = this.window
    if (!w || w.isMinimized()) return
    if (w.isVisible()) return // already on screen: nothing to do
    void this.wake().then(() => {
      if (w.isDestroyed()) return
      w.showInactive()
      this.cancelPeek()
      this.peekTimer = setTimeout(() => {
        this.peekTimer = null
        if (!w.isDestroyed() && !w.isFocused()) w.hide()
      }, PEEK_MS)
    })
  }

  private cancelPeek(): void {
    if (this.peekTimer) clearTimeout(this.peekTimer)
    this.peekTimer = null
  }

  // ---- click-through lock (widgets only; never saved, so a restart always gives the mouse back) ----

  isLocked(): boolean {
    return this.locked
  }

  setLocked(on: boolean): void {
    const w = this.window
    if (!w) return
    if (on && (this.mode === 'full' || !w.isVisible())) return
    if (on === this.locked) return
    this.locked = on
    w.setIgnoreMouseEvents(on, { forward: true })
    w.setOpacity(on ? 0.78 : 1) // the visible cue that clicks pass through
    this.emit('lock', on)
  }

  toggleLocked(): void {
    this.setLocked(!this.locked)
  }

  // ---- what the tray shows ----

  /** Called with the song title / artist whenever the track changes. */
  setNowPlaying(track: string): void {
    if (track === this.nowTrack) return
    this.nowTrack = track
    this.nowLine = ''
    this.emit('now')
  }

  /** The line being sung (sent by the page); only used for the tray tooltip while the widget is hidden. */
  setNowLine(line: string): void {
    const clean = String(line ?? '').replace(/\s+/g, ' ').trim().slice(0, 100)
    if (clean === this.nowLine) return
    this.nowLine = clean
    if (!this.window?.isVisible()) this.emit('tip')
  }

  /** Tooltip text (Windows shows at most 127 characters). */
  tooltip(): string {
    const w = this.window
    const lines = ['Lyra']
    if (this.locked) lines.push('Click-through is on: use the tray menu to unlock')
    else if (w && !w.isVisible() && this.nowLine) lines.push(this.nowLine)
    if (this.nowTrack) lines.push(this.nowTrack)
    return lines.join('\n').slice(0, 127)
  }

  get nowPlaying(): string {
    return this.nowTrack
  }

  minimize(): void {
    this.window?.minimize()
  }

  /**
   * "Launch at startup". Electron writes the HKCU Run entry itself; some security software silently blocks
   * an unsigned app from doing that, so if it didn't stick we write/remove it with reg.exe (Microsoft-signed).
   */
  private syncLoginItem(enable: boolean): void {
    if (!app.isPackaged) return
    // Only act on a change (and at startup when enabled, which also repairs a path that moved after an update).
    if (this.loginState === enable || (this.loginState === null && !enable)) {
      this.loginState = enable
      return
    }
    this.loginState = enable
    try {
      app.setLoginItemSettings({ openAtLogin: enable, name: 'Lyra', path: process.execPath, args: [HIDDEN_ARG] })
    } catch (e) {
      log.warn('setLoginItemSettings failed', (e as Error).message)
    }
    const key = String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
    // The login launch always carries --hidden; whether it matters is the "start in the tray" setting, read at launch.
    const args = enable ? ['add', key, '/v', 'Lyra', '/t', 'REG_SZ', '/d', `"${process.execPath}" ${HIDDEN_ARG}`, '/f'] : ['delete', key, '/v', 'Lyra', '/f']
    execFile('reg.exe', args, { windowsHide: true }, (err) => {
      if (err && enable) log.warn('could not register launch-at-startup', err.message)
    })
  }

  applySettings(s: Settings): void {
    const w = this.window
    if (!w) return
    if (this.mode !== 'full') w.setAlwaysOnTop(s.alwaysOnTop, 'screen-saver')
    w.setContentProtection(s.hideOnScreenShare)
    this.syncLoginItem(s.launchAtStartup)
    // Resize resting layouts when width changes
    if (!this.resize && !this.pendingFinal && (this.mode === 'minimal' || this.mode === 'compact' || this.mode === 'mini')) {
      const b = w.getBounds()
      const size = sizeFor(this.mode as Exclude<ViewMode, 'full'>, s, pickArea(b, workAreas()))
      if (b.width !== size.width || b.height !== size.height) {
        log.debug('resize for settings', size)
        w.setBounds({ ...this.clampToDisplay({ x: b.x, y: b.y, ...size }), ...size })
      }
    }
  }
}

export const windows = new WindowManager()
