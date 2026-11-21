/**
 * Pure logic of the TV remote: which key means what, and which control the D-pad moves to. Kept free of the DOM so it is
 * unit-tested (tvNav.test.ts); tv.ts wires it to the page.
 */

export type Dir = 'up' | 'down' | 'left' | 'right'
export type RemoteKey = Dir | 'select' | 'back' | 'menu' | 'playpause' | 'play' | 'pause' | 'next' | 'prev' | 'ffwd' | 'rew'

/** What a DOM KeyboardEvent from the TV WebView (or a desktop keyboard in the harness) means for the remote. */
export function remoteKey(e: { key: string }): RemoteKey | null {
  switch (e.key) {
    case 'ArrowUp': return 'up'
    case 'ArrowDown': return 'down'
    case 'ArrowLeft': return 'left'
    case 'ArrowRight': return 'right'
    case 'Enter': return 'select' // KEYCODE_DPAD_CENTER and KEYCODE_ENTER both arrive as Enter
    case 'Escape':
    case 'BrowserBack': return 'back'
    case 'ContextMenu':
    case 'm':
    case 'M': return 'menu'
    case 'MediaPlayPause': return 'playpause'
    case 'MediaPlay': return 'play'
    case 'MediaPause': return 'pause'
    case 'MediaTrackNext': return 'next'
    case 'MediaTrackPrevious': return 'prev'
    case 'MediaFastForward': return 'ffwd'
    case 'MediaRewind': return 'rew'
    default: return null
  }
}

/** Native media-key names (the activity forwards them as these strings) to the same vocabulary. */
export function nativeKey(name: string): RemoteKey | null {
  const map: Record<string, RemoteKey> = { playpause: 'playpause', play: 'play', pause: 'pause', next: 'next', prev: 'prev', ffwd: 'ffwd', rew: 'rew', menu: 'menu' }
  return map[name] ?? null
}

export type TvAction =
  | { type: 'toggle' }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; ms: number }
  | { type: 'track'; dir: 1 | -1 }
  | { type: 'look'; dir: 1 | -1 }
  | { type: 'move'; dir: Dir }
  | { type: 'setup' }
  | { type: 'pass' }

export const SEEK_MS = 10_000

/**
 * The remote has no pointer, so the screen has two states:
 *  - controls hidden (just the lyrics): OK pauses / resumes, Left / Right seek 10 s, Up / Down change the look, Menu opens setup
 *  - controls shown (any other key brought them up, they fade after a few seconds): the D-pad moves focus between them,
 *    OK presses the focused one
 * Media keys work in both states and never need the controls.
 */
export function decide(key: RemoteKey, controlsShown: boolean): TvAction {
  switch (key) {
    case 'playpause': return { type: 'toggle' }
    case 'play': return { type: 'play' }
    case 'pause': return { type: 'pause' }
    case 'next': return { type: 'track', dir: 1 }
    case 'prev': return { type: 'track', dir: -1 }
    case 'ffwd': return { type: 'seek', ms: SEEK_MS }
    case 'rew': return { type: 'seek', ms: -SEEK_MS }
    case 'menu': return { type: 'setup' }
    case 'back': return { type: 'pass' }
    case 'select': return controlsShown ? { type: 'pass' } : { type: 'toggle' }
    case 'left': return controlsShown ? { type: 'move', dir: 'left' } : { type: 'seek', ms: -SEEK_MS }
    case 'right': return controlsShown ? { type: 'move', dir: 'right' } : { type: 'seek', ms: SEEK_MS }
    case 'up': return controlsShown ? { type: 'move', dir: 'up' } : { type: 'look', dir: -1 }
    case 'down': return controlsShown ? { type: 'move', dir: 'down' } : { type: 'look', dir: 1 }
  }
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Spatial navigation: the control the D-pad should move to from `from` (null: nothing focused yet, take the first one in
 * reading order). A candidate must lie in that direction; closer wins, and a control far off to the side loses to one
 * straight ahead. Returns null at an edge (focus stays put).
 */
export function pickNext<T extends Box>(items: readonly T[], from: T | null, dir: Dir): T | null {
  if (items.length === 0) return null
  if (!from) return [...items].sort((a, b) => a.y - b.y || a.x - b.x)[0] ?? null
  const fcx = from.x + from.w / 2
  const fcy = from.y + from.h / 2
  let best: T | null = null
  let bestScore = Infinity
  for (const c of items) {
    if (c === from) continue
    const dx = c.x + c.w / 2 - fcx
    const dy = c.y + c.h / 2 - fcy
    const primary = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy
    if (primary <= 1) continue
    const side = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx)
    // overlapping rows (for left / right) or columns (for up / down) get a bonus: they are "in line"
    const overlap = dir === 'left' || dir === 'right' ? Math.min(from.y + from.h, c.y + c.h) - Math.max(from.y, c.y) : Math.min(from.x + from.w, c.x + c.w) - Math.max(from.x, c.x)
    const score = primary + side * 2.5 + (overlap > 0 ? 0 : 400)
    if (score < bestScore) {
      bestScore = score
      best = c
    }
  }
  return best
}
