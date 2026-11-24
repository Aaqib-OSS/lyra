/**
 * Command-line actions Lyra accepts when it is started (or started again: the second launch hands them to the
 * running one). Used by the taskbar jump list. Only this short list is ever honoured; anything else is ignored.
 */
export const LAUNCH_COMMANDS = ['toggle-play', 'next', 'previous', 'fullscreen', 'show'] as const
export type LaunchCommand = (typeof LAUNCH_COMMANDS)[number]

/** The action asked for by `--cmd=<name>` in an argument list, or null. */
export function parseLaunchCommand(argv: readonly string[]): LaunchCommand | null {
  for (const a of argv) {
    const m = /^--cmd=([a-z-]{1,20})$/.exec(a)
    if (m && (LAUNCH_COMMANDS as readonly string[]).includes(m[1]!)) return m[1] as LaunchCommand
  }
  return null
}

/** Jump list entries (title, argument). The icon is the app's own. */
export const JUMP_LIST_TASKS: ReadonlyArray<{ title: string; description: string; cmd: LaunchCommand }> = [
  { title: 'Play / pause', description: 'Play or pause the music', cmd: 'toggle-play' },
  { title: 'Next track', description: 'Skip to the next song', cmd: 'next' },
  { title: 'Fullscreen lyrics', description: 'Open the lyrics full screen', cmd: 'fullscreen' }
]
