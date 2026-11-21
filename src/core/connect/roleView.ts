import type { HostMsg, Role } from './protocol'

/**
 * What a device of a given role may be told. Viewers and controllers get everything; the overlay role (an OBS browser
 * source) gets the song, clock, lyrics, art and vibe only: no video choice, no per-song picks, no list of other devices.
 * Returns null when the message must not reach that role at all. Pure.
 */
export function messageForRole(role: Role, m: HostMsg): HostMsg | null {
  if (role !== 'overlay') return m
  switch (m.t) {
    case 'now':
      return { t: 'now', now: m.now }
    case 'view':
      return { t: 'view', view: { vibe: m.view.vibe, ...(m.view.mode ? { mode: m.view.mode } : {}), video: { id: null }, ...(typeof m.view.offsetMs === 'number' ? { offsetMs: m.view.offsetMs } : {}) } }
    case 'ready':
      return { ...m, party: false }
    case 'devices':
      return null
    default:
      return m
  }
}
