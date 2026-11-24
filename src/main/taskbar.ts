import { app } from 'electron'
import { JUMP_LIST_TASKS, parseLaunchCommand } from '@shared/launchArgs'
import { createLogger } from './logger'
import { windows } from './window'

const log = createLogger('taskbar')

/** The Windows taskbar jump list: right-click the icon for Play / pause, Next track, Fullscreen lyrics. Installed builds only. */
export function setupTaskbar(): void {
  if (process.platform !== 'win32' || !app.isPackaged) return
  try {
    app.setUserTasks(
      JUMP_LIST_TASKS.map((t) => ({
        program: process.execPath,
        arguments: `--cmd=${t.cmd}`,
        iconPath: process.execPath,
        iconIndex: 0,
        title: t.title,
        description: t.description
      }))
    )
  } catch (e) {
    log.warn('could not set the jump list', (e as Error).message)
  }
}

/**
 * Act on `--cmd=...` from this launch or from a second launch (which hands its arguments to the running app).
 * With no command it just brings the window forward, which is what "open Lyra again" should do.
 */
export function handleLaunch(argv: readonly string[]): void {
  switch (parseLaunchCommand(argv)) {
    case 'toggle-play':
    case 'next':
    case 'previous': {
      const cmd = parseLaunchCommand(argv)!
      windows.sendCommand(cmd)
      return
    }
    case 'fullscreen':
      windows.showMode('full')
      return
    default:
      windows.show()
  }
}
