import { describe, expect, it } from 'vitest'
import { carIsNight, carLines, lengthClass, shouldOfferCarMode } from './car'

const L = (...t: string[]) => t.map((text) => ({ text }))

describe('carLines', () => {
  it('returns prev, current and next around the active line', () => {
    expect(carLines(L('a', 'b', 'c'), 1)).toEqual({ prev: 'a', current: 'b', next: 'c' })
  })
  it('has no prev on the first line and no next on the last', () => {
    expect(carLines(L('a', 'b'), 0)).toEqual({ prev: '', current: 'a', next: 'b' })
    expect(carLines(L('a', 'b'), 1)).toEqual({ prev: 'a', current: 'b', next: '' })
  })
  it('shows a note before the first line and for blank lines', () => {
    expect(carLines(L('a', 'b'), -1)).toEqual({ prev: '', current: '♪', next: 'a' })
    expect(carLines(L('a', '  ', 'c'), 1).current).toBe('♪')
  })
  it('is empty with no lyrics', () => {
    expect(carLines([], -1)).toEqual({ prev: '', current: '', next: '' })
  })
})

describe('lengthClass', () => {
  it('shrinks with length and counts code points', () => {
    expect(lengthClass('Hello')).toBe('xs')
    expect(lengthClass('x'.repeat(30))).toBe('s')
    expect(lengthClass('x'.repeat(60))).toBe('m')
    expect(lengthClass('x'.repeat(120))).toBe('l')
    expect(lengthClass('😀'.repeat(24))).toBe('xs')
  })
})

describe('car mode policy', () => {
  it('only offers car mode when docked and not already on', () => {
    expect(shouldOfferCarMode(true, false)).toBe(true)
    expect(shouldOfferCarMode(true, true)).toBe(false)
    expect(shouldOfferCarMode(false, false)).toBe(false)
  })
  it('night wins when unknown', () => {
    expect(carIsNight(null, false)).toBe(true)
    expect(carIsNight(undefined, true)).toBe(false)
    expect(carIsNight(false, false)).toBe(false)
    expect(carIsNight(true, true)).toBe(true)
  })
})
