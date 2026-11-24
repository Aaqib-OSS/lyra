import { describe, expect, it } from 'vitest'
import { clampResize, clampToArea, clampToAreas, cornerPlacement, intersectArea, needsRecovery, pickArea, sanitizePoint, snapToEdges, visibleFraction } from './windowGeometry'

// two monitors side by side: a 1920x1040 work area (taskbar 40px) and a 1280x1024 one to its right
const A = { x: 0, y: 0, width: 1920, height: 1040 }
const B = { x: 1920, y: 0, width: 1280, height: 1024 }

describe('sanitizePoint', () => {
  it('keeps a real point (rounded) and drops junk', () => {
    expect(sanitizePoint({ x: 10.4, y: -20.6 })).toEqual({ x: 10, y: -21 })
    expect(sanitizePoint(null)).toBeNull()
    expect(sanitizePoint({ x: 'a', y: 1 })).toBeNull()
    expect(sanitizePoint({ x: NaN, y: 1 })).toBeNull()
    expect(sanitizePoint({ x: Infinity, y: 1 })).toBeNull()
    expect(sanitizePoint({ x: 1e9, y: 0 })).toBeNull()
    expect(sanitizePoint({ x: -3000, y: 5 })).toEqual({ x: -3000, y: 5 }) // a monitor left of the primary is legal
  })
})

describe('pickArea', () => {
  it('picks the display with the biggest overlap', () => {
    expect(pickArea({ x: 1800, y: 100, width: 400, height: 300 }, [A, B])).toBe(B)
    expect(pickArea({ x: 1000, y: 100, width: 400, height: 300 }, [A, B])).toBe(A)
  })
  it('falls back to the nearest display when the window is nowhere (monitor unplugged)', () => {
    expect(pickArea({ x: 5000, y: 100, width: 400, height: 300 }, [A, B])).toBe(B)
    expect(pickArea({ x: -4000, y: 100, width: 400, height: 300 }, [A, B])).toBe(A)
  })
  it('throws with no displays', () => {
    expect(() => pickArea({ x: 0, y: 0, width: 1, height: 1 }, [])).toThrow()
  })
})

describe('clampToArea', () => {
  it('moves a box back inside', () => {
    expect(clampToArea({ x: 1800, y: 1000, width: 400, height: 140 }, A)).toEqual({ x: 1520, y: 900, width: 400, height: 140 })
    expect(clampToArea({ x: -50, y: -50, width: 400, height: 140 }, A)).toEqual({ x: 0, y: 0, width: 400, height: 140 })
  })
  it('shrinks a box that is bigger than the display, but not below the minimum', () => {
    const small = { x: 0, y: 0, width: 300, height: 300 }
    expect(clampToArea({ x: 0, y: 0, width: 700, height: 900 }, small)).toEqual({ x: 0, y: 0, width: 300, height: 300 })
    expect(clampToArea({ x: 0, y: 0, width: 700, height: 900 }, small, { width: 360, height: 480 })).toEqual({ x: 0, y: 0, width: 300, height: 300 }) // area smaller than min: area wins
    expect(clampToArea({ x: 0, y: 0, width: 700, height: 900 }, A, { width: 360, height: 480 })).toEqual({ x: 0, y: 0, width: 700, height: 900 })
  })
  it('leaves a box that already fits alone', () => {
    const r = { x: 100, y: 100, width: 380, height: 140 }
    expect(clampToArea(r, A)).toEqual(r)
  })
})

describe('clampToAreas', () => {
  it('rescues a window that was on a monitor that is gone', () => {
    const out = clampToAreas({ x: 4000, y: 200, width: 400, height: 300 }, [A])
    expect(out.x).toBe(1520)
    expect(out.y).toBe(200)
  })
})

describe('visibleFraction / needsRecovery', () => {
  it('counts the part on every display', () => {
    expect(visibleFraction({ x: 1820, y: 0, width: 200, height: 100 }, [A, B])).toBe(1)
    expect(visibleFraction({ x: 1820, y: 0, width: 200, height: 100 }, [A])).toBe(0.5)
    expect(visibleFraction({ x: 9000, y: 0, width: 200, height: 100 }, [A, B])).toBe(0)
    expect(visibleFraction({ x: 0, y: 0, width: 0, height: 0 }, [A])).toBe(0)
  })
  it('asks for recovery once most of the window is off screen', () => {
    expect(needsRecovery({ x: 100, y: 100, width: 400, height: 300 }, [A])).toBe(false)
    expect(needsRecovery({ x: 1600, y: 100, width: 400, height: 300 }, [A])).toBe(false) // 80% visible
    expect(needsRecovery({ x: 1800, y: 100, width: 400, height: 300 }, [A])).toBe(true)
    expect(needsRecovery({ x: 5000, y: 100, width: 400, height: 300 }, [A])).toBe(true)
  })
})

describe('intersectArea', () => {
  it('is zero for touching boxes', () => {
    expect(intersectArea(A, B)).toBe(0)
  })
})

describe('snapToEdges', () => {
  const r = { x: 0, y: 0, width: 380, height: 140 }
  it('snaps to a nearby edge with the resting gap', () => {
    expect(snapToEdges({ ...r, x: 20, y: 18 }, A, 12, 16)).toEqual({ x: 12, y: 12 })
    expect(snapToEdges({ ...r, x: 1920 - 380 - 20, y: 1040 - 140 - 10 }, A, 12, 16)).toEqual({ x: 1920 - 380 - 12, y: 1040 - 140 - 12 })
  })
  it('leaves a window in the middle alone', () => {
    expect(snapToEdges({ ...r, x: 600, y: 400 }, A, 12, 16)).toEqual({ x: 600, y: 400 })
  })
})

describe('cornerPlacement', () => {
  it('is the bottom-right corner on any display', () => {
    expect(cornerPlacement({ width: 380, height: 140 }, B, 24)).toEqual({ x: 1920 + 1280 - 380 - 24, y: 1024 - 140 - 24 })
  })
})

describe('clampResize', () => {
  const cur = { x: 100, y: 100, height: 140 }
  it('widgets change width only', () => {
    expect(clampResize('compact', { width: 9999, height: 9999 }, cur, A)).toEqual({ width: 520, height: 140 })
    expect(clampResize('compact', { width: 10, height: 10 }, cur, A)).toEqual({ width: 320, height: 140 })
  })
  it('minimal is 78% of the compact range', () => {
    expect(clampResize('minimal', { width: 10, height: 64 }, { ...cur, height: 64 }, A)).toEqual({ width: 250, height: 64 })
    expect(clampResize('minimal', { width: 9999, height: 64 }, { ...cur, height: 64 }, A)).toEqual({ width: 405, height: 64 })
  })
  it('mini stays within its limits and the display edge', () => {
    expect(clampResize('mini', { width: 10, height: 10 }, cur, A)).toEqual({ width: 360, height: 480 })
    expect(clampResize('mini', { width: 9999, height: 9999 }, cur, A)).toEqual({ width: 700, height: 940 }) // bottom edge at 1040
  })
  it('a window near the edge cannot be pulled past it', () => {
    expect(clampResize('compact', { width: 520, height: 140 }, { x: 1700, y: 0, height: 140 }, A)).toEqual({ width: 300, height: 140 })
  })
})
