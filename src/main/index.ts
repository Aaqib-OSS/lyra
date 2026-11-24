import { app, desktopCapturer, powerMonitor, session } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from './logger'
import { disposePlayback, registerIpc, setBackground, startPlayback, wakePlayback } from './ipc'
import { connectService } from './connect/service'
import { studio } from './studio'
import { favorites } from './favorites'
import { moments } from './moments'
import { settings } from './settings'
import { applyShortcuts, disposeShortcuts } from './shortcuts'
import { installElectronPlatform } from './platform'
import { BG_SCHEME, background, registerBackgroundScheme } from './background/service'
import { productionCsp } from '@shared/csp'
import { createTray } from './tray'
import { handleLaunch, setupTaskbar } from './taskbar'
import { updater } from './updater'
import { windows } from './window'
import { attachWindowGuard, installCrashGuard, isSafeMode } from './crashGuard'

// the shared core reaches the OS only through this (fetch, storage, secrets, logging)
installElectronPlatform()
installCrashGuard() // before ready: safe mode, GPU fallback, process-level error handlers

const log = createLogger('main')

/** Minimal .env loader for development (packaged builds use settings.json instead). */
function loadDotEnv(): void {
  if (app.isPackaged) return // an installed Lyra never reads a .env that happens to sit next to it
  for (const dir of [process.cwd(), app.getAppPath()]) {
    const file = join(dir, '.env')
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
      if (m && !line.trimStart().startsWith('#') && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '')
    }
    return
  }
}

registerBackgroundScheme()

// Windows: Chromium marks a window "hidden" once another app covers it, which pauses the video and lyric timers.
// Music is playing and the widget is meant to sit beside other apps, so a covered window stays "visible".
// (A minimized or tray-hidden window is still hidden for real.) Must be set before the app is ready.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

function installCsp(): void {
  const dev = !app.isPackaged
  const media = `${BG_SCHEME}:`
  const embed = 'https://www.youtube-nocookie.com'
  const csp = dev
    ? `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: ${media}; media-src 'self' ${media} https://*.itunes.apple.com; frame-src ${embed}; font-src 'self' data:; connect-src 'self' ws: http://localhost:* https://0.peerjs.com wss://0.peerjs.com`
    : productionCsp(BG_SCHEME)
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    // Only OUR pages get our policy. Third-party documents (the YouTube player) keep their own headers,
    // otherwise our "default-src 'self'" would block their scripts.
    const ours = details.url.startsWith('file://') || details.url.startsWith('http://localhost') || details.url.startsWith(`${media}//`)
    cb(ours ? { responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } } : {})
  })
  // YouTube's embedded player refuses to run without a Referer; our pages are file:// so supply an https one.
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*'] }, (details, cb) => {
    cb({ requestHeaders: { ...details.requestHeaders, Referer: 'https://github.com/DhruvHarani1/lyra' } })
  })
  // The app window may capture the PC's own sound (loopback) only while the studio is recording.
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, cb) => {
      if (!studio.capturing) return cb({})
      void desktopCapturer.getSources({ types: ['screen'] }).then((sources) => cb(sources[0] ? { video: sources[0], audio: 'loopback' } : {}))
    },
    { useSystemPicker: false }
  )
  // The renderer never needs device permissions.
  // The only exception: our own window may capture sound while the studio is recording.
  // getDisplayMedia asks for 'media' (and sometimes 'display-capture'); nothing else is ever allowed
  const isCapture = (perm: string): boolean => perm === 'display-capture' || perm === 'media'
  const ownPage = (url: string): boolean => url.startsWith('file://') || url.startsWith('http://localhost')
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(isCapture(perm) && (studio.capturing || studio.mic) && ownPage(wc.getURL())))
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin) => isCapture(perm) && (studio.capturing || studio.mic) && ownPage(wc?.getURL() ?? origin))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // A second launch (double-click, jump list task) hands its arguments to this one and exits.
  app.on('second-instance', (_e, argv) => handleLaunch(argv))

  app.whenReady().then(() => {
    app.setAppUserModelId('dev.lyra.companion')
    loadDotEnv()
    installCsp()
    background.registerProtocol()
    background.collectGarbage()
    registerIpc()
    const win = windows.create()
    attachWindowGuard(win)
    createTray()
    applyShortcuts(settings.get().globalShortcuts, settings.get().shortcuts)
    windows.applySettings(settings.get())
    startPlayback()
    // safe mode (two unfinished starts in a row): skip the optional network services
    if (settings.get().connectEnabled && !isSafeMode()) void connectService.start()
    if (!isSafeMode()) updater.start()
    setupTaskbar()
    if (process.argv.some((a) => a.startsWith('--cmd='))) void windows.uiReady().then(() => handleLaunch(process.argv))
    if (windows.startedHidden) setBackground(true) // started in the tray: no hide event fires, so slow the polling here

    // Slow polling while the widget isn't visible.
    win.on('hide', () => setBackground(true))
    win.on('minimize', () => setBackground(true))
    win.on('show', () => setBackground(false))
    win.on('restore', () => setBackground(false))
    // back from sleep / unlocked: refresh the music source now instead of waiting out a stale timer
    powerMonitor.on('resume', wakePlayback)
    powerMonitor.on('unlock-screen', wakePlayback)

    let shortcutKey = JSON.stringify([settings.get().globalShortcuts, settings.get().shortcuts])
    settings.on('change', (s) => {
      const key = JSON.stringify([s.globalShortcuts, s.shortcuts])
      if (key !== shortcutKey) {
        shortcutKey = key
        applyShortcuts(s.globalShortcuts, s.shortcuts)
      }
    })
    log.info(`started v${app.getVersion()}`)
  })

  // Widget lives in the tray; closing the window never quits.
  app.on('window-all-closed', () => {
    /* keep running */
  })
  app.on('before-quit', () => {
    disposeShortcuts()
    disposePlayback()
    connectService.stop()
    settings.flush()
    moments.flush()
    favorites.flush()
    updater.dispose()
  })
}
