/**
 * Pure window geometry (no Electron): where a window may sit, how big it may be, how it snaps.
 * The main process feeds it the displays' work areas; tests feed it made-up monitors.
 */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** The three sizes a windowed mode can have; see `src/main/window.ts` `sizeFor`. */
export type WindowedMode = 'minimal' | 'compact' | 'mini'

export const MINIMAL_RATIO = 0.78
export const WIDGET_MIN_W = 320
export const WIDGET_MAX_W = 520
export const MINI_MIN = { width: 360, height: 480 } as const
export const MINI_MAX = { width: 700, height: 1200 } as const
/** A persisted coordinate beyond this is junk (a 16-monitor wall is still well inside it). */
const COORD_LIMIT = 100_000

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

export function intersectArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** A saved point from settings.json: finite, rounded, sane. Anything else is "no saved position". */
export function sanitizePoint(p: unknown): { x: number; y: number } | null {
  if (!p || typeof p !== 'object') return null
  const { x, y } = p as { x?: unknown; y?: unknown }
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null
  if (Math.abs(x) > COORD_LIMIT || Math.abs(y) > COORD_LIMIT) return null
  return { x: Math.round(x), y: Math.round(y) }
}

/** The work area a box mostly sits on; with no overlap at all, the nearest one (by centre). Throws on an empty list. */
export function pickArea(r: Box, areas: readonly Box[]): Box {
  if (areas.length === 0) throw new Error('pickArea: no displays')
  let best = areas[0]!
  let bestOverlap = -1
  for (const a of areas) {
    const o = intersectArea(r, a)
    if (o > bestOverlap) {
      best = a
      bestOverlap = o
    }
  }
  if (bestOverlap > 0) return best
  const cx = r.x + r.width / 2
  const cy = r.y + r.height / 2
  const dist = (a: Box): number => Math.hypot(clamp(cx, a.x, a.x + a.width) - cx, clamp(cy, a.y, a.y + a.height) - cy)
  return areas.reduce((m, a) => (dist(a) < dist(m) ? a : m))
}

/** Keep a box inside one work area. A box larger than the area shrinks to it (never below `min`). */
export function clampToArea(r: Box, wa: Box, min: { width: number; height: number } = { width: 0, height: 0 }): Box {
  const width = Math.max(Math.min(min.width, wa.width), Math.min(r.width, wa.width))
  const height = Math.max(Math.min(min.height, wa.height), Math.min(r.height, wa.height))
  return {
    x: clamp(r.x, wa.x, wa.x + wa.width - width),
    y: clamp(r.y, wa.y, wa.y + wa.height - height),
    width,
    height
  }
}

/** Keep a box fully on the display it mostly overlaps (an unplugged monitor falls back to the nearest one). */
export function clampToAreas(r: Box, areas: readonly Box[], min?: { width: number; height: number }): Box {
  return clampToArea(r, pickArea(r, areas), min)
}

/** How much of the box can be seen, 0..1, over all displays (work areas do not overlap each other). */
export function visibleFraction(r: Box, areas: readonly Box[]): number {
  const total = r.width * r.height
  if (total <= 0) return 0
  let seen = 0
  for (const a of areas) seen += intersectArea(r, a)
  return Math.min(1, seen / total)
}

/** Is the window so far off every screen that the user could not drag it back? */
export function needsRecovery(r: Box, areas: readonly Box[]): boolean {
  return visibleFraction(r, areas) < 0.6
}

/** Magnetic edges: snap to the work-area border (with a small resting gap) when within `distance`. */
export function snapToEdges(r: Box, wa: Box, margin: number, distance: number): { x: number; y: number } {
  const left = wa.x + margin
  const right = wa.x + wa.width - margin - r.width
  const top = wa.y + margin
  const bottom = wa.y + wa.height - margin - r.height
  const near = (v: number, target: number): boolean => Math.abs(v - target) <= distance
  return {
    x: near(r.x, left) ? left : near(r.x, right) ? right : r.x,
    y: near(r.y, top) ? top : near(r.y, bottom) ? bottom : r.y
  }
}

/** The default resting place: bottom-right corner of a work area. */
export function cornerPlacement(size: { width: number; height: number }, wa: Box, margin: number): { x: number; y: number } {
  return { x: wa.x + wa.width - size.width - margin, y: wa.y + wa.height - size.height - margin }
}

/**
 * The size a user-resize (or a keyboard resize) may produce. `wa` is the work area of the display the window is on,
 * `x`/`y` its top-left; the window may never grow past the work area's right / bottom edge.
 * Widgets are fixed-height: only their width changes.
 */
export function clampResize(
  mode: WindowedMode,
  want: { width: number; height: number },
  current: { x: number; y: number; height: number },
  wa: Box
): { width: number; height: number } {
  const maxW = Math.max(300, wa.x + wa.width - current.x)
  const maxH = Math.max(300, wa.y + wa.height - current.y)
  if (mode === 'mini') {
    return {
      width: clamp(want.width, MINI_MIN.width, Math.min(MINI_MAX.width, maxW)),
      height: clamp(want.height, MINI_MIN.height, Math.min(MINI_MAX.height, maxH))
    }
  }
  const k = mode === 'minimal' ? MINIMAL_RATIO : 1
  return { width: clamp(want.width, Math.ceil(WIDGET_MIN_W * k), Math.min(Math.floor(WIDGET_MAX_W * k), maxW)), height: current.height }
}

/** The "peek" window: how long a peeked widget stays before it hides again. */
export const PEEK_MS = 5000
