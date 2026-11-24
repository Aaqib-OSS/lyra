import { describe, expect, it } from 'vitest'
import { JUMP_LIST_TASKS, LAUNCH_COMMANDS, parseLaunchCommand } from './launchArgs'

describe('parseLaunchCommand', () => {
  it('reads a known command', () => {
    expect(parseLaunchCommand(['C:\\Lyra.exe', '--cmd=next'])).toBe('next')
    expect(parseLaunchCommand(['--hidden', '--cmd=fullscreen'])).toBe('fullscreen')
  })
  it('ignores anything that is not on the list', () => {
    expect(parseLaunchCommand([])).toBeNull()
    expect(parseLaunchCommand(['--cmd=quit'])).toBeNull()
    expect(parseLaunchCommand(['--cmd=next && calc'])).toBeNull()
    expect(parseLaunchCommand(['--cmd='])).toBeNull()
    expect(parseLaunchCommand(['cmd=next'])).toBeNull()
  })
  it('every jump list entry maps to a command Lyra honours', () => {
    for (const t of JUMP_LIST_TASKS) expect(LAUNCH_COMMANDS).toContain(t.cmd)
  })
})
