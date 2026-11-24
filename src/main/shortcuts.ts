import { globalShortcut } from 'electron'
import { GLOBAL_SHORTCUTS, effectiveAccel } from '@shared/shortcuts'
import type { AppCommand } from '@shared/types'
import { createLogger } from './logger'
import { windows } from './window'

const log = createLogger('shortcuts')

function send(cmd: AppCommand): void {
  windows.sendCommand(cmd)
}

const ACTIONS: Record<(typeof GLOBAL_SHORTCUTS)[number]['id'], () => void> = {
  'toggle-play': () => send('toggle-play'),
  next: () => send('next'),
  previous: () => send('previous'),
  'toggle-expand': () => {
    windows.show()
    windows.toggleExpand()
  },
  'toggle-fullscreen': () => {
    windows.show()
    windows.toggleFullscreen()
  },
  'toggle-visible': () => windows.toggleVisible(),
  peek: () => windows.peek(),
  'toggle-lock': () => windows.toggleLocked()
}

let failed: string[] = []
let lastReported = ''

/** Ids of shortcuts that could not be registered (taken by another app). */
export function failedShortcuts(): string[] {
  return failed
}

export function applyShortcuts(enabled: boolean, overrides: Record<string, string> = {}): string[] {
  globalShortcut.unregisterAll()
  failed = []
  if (!enabled) return failed
  for (const s of GLOBAL_SHORTCUTS) {
    const accel = effectiveAccel(s.id, overrides)
    try {
      if (!globalShortcut.register(accel, ACTIONS[s.id])) {
        failed.push(s.id)
        log.warn(`could not register ${accel} (already taken?)`)
      }
    } catch (e) {
      failed.push(s.id)
      log.warn(`failed to register ${accel}`, e)
    }
  }
  reportFailures(failed)
  return failed
}

/** Tell the user (once per distinct set) which keys another app already owns; otherwise "nothing happens" is a mystery. */
function reportFailures(ids: string[]): void {
  const key = ids.join(',')
  if (key === lastReported) return
  lastReported = key
  if (ids.length === 0) return
  const names = ids.map((id) => GLOBAL_SHORTCUTS.find((s) => s.id === id)?.label ?? id)
  windows.notice(`${names.join(', ')}: another app already uses ${ids.length === 1 ? 'that key' : 'those keys'}. Change it in Settings, Startup & keys.`, 'error')
}

export function disposeShortcuts(): void {
  globalShortcut.unregisterAll()
}
