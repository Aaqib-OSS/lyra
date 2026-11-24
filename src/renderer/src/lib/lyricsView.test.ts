import { describe, expect, it } from 'vitest'
import { findActiveLine } from '@shared/lrc'
import type { LyricLine } from '@shared/types'
import { OFFSET_MAX_MS, clampOffset, describeOffset, linesToText, nudgeMessage, scrollMode, scrollTarget, textDirection, windowedDist } from './lyricsView'

const L = (timeMs: number, text = 'x'): LyricLine => ({ timeMs, text })

describe('findActiveLine', () => {
  const lines = [L(1000), L(2000), L(2000), L(5000)]
  it('is -1 before the first line and on an empty list', () => {
    expect(findActiveLine(lines, 999)).toBe(-1)
    expect(findActiveLine([], 5000)).toBe(-1)
  })
  it('picks the last line that has started', () => {
    expect(findActiveLine(lines, 1000)).toBe(0)
    expect(findActiveLine(lines, 1999)).toBe(0)
    expect(findActiveLine(lines, 2000)).toBe(2)
    expect(findActiveLine(lines, 999_999)).toBe(3)
  })
  it('handles a negative position (offset pushed before zero)', () => {
    expect(findActiveLine(lines, -500)).toBe(-1)
  })
})

describe('offset helpers', () => {
  it('clamps and rounds', () => {
    expect(clampOffset(50_000)).toBe(OFFSET_MAX_MS)
    expect(clampOffset(-50_000)).toBe(-OFFSET_MAX_MS)
    expect(clampOffset(249.6)).toBe(250)
    expect(clampOffset(NaN)).toBe(0)
  })
  it('describes the offset', () => {
    expect(describeOffset(0)).toBe('sync')
    expect(describeOffset(250)).toBe('+0.25s')
    expect(describeOffset(-1500)).toBe('-1.50s')
  })
  it('words the nudge toast', () => {
    expect(nudgeMessage(250, 500)).toBe('Lyrics 0.25s earlier (+0.50s)')
    expect(nudgeMessage(-250, 0)).toBe('Lyrics 0.25s later (sync)')
  })
})

describe('scrolling maths', () => {
  it('centres a row at the anchor and never goes negative', () => {
    expect(scrollTarget(1000, 60, 500, 0.36)).toBe(1000 - 180 + 30)
    expect(scrollTarget(10, 60, 500, 0.36)).toBe(0)
  })
  it('glides near, jumps far, always jumps when motion is reduced', () => {
    expect(scrollMode(0, 300, 500, false)).toBe('smooth')
    expect(scrollMode(0, 5000, 500, false)).toBe('auto')
    expect(scrollMode(5000, 0, 500, false)).toBe('auto')
    expect(scrollMode(0, 100, 500, true)).toBe('auto')
  })
  it('windows the distance so far rows stay identical', () => {
    expect(windowedDist(40)).toBe(windowedDist(12))
    expect(windowedDist(-40)).toBe(windowedDist(-12))
    expect(windowedDist(2)).toBe(2)
    expect(windowedDist(0)).toBe(0)
  })
})

describe('textDirection', () => {
  it('follows the first strong letter', () => {
    expect(textDirection('Hello')).toBe('ltr')
    expect(textDirection('مرحبا بالعالم')).toBe('rtl')
    expect(textDirection('שלום')).toBe('rtl')
    expect(textDirection('  ... 123 مرحبا')).toBe('rtl')
    expect(textDirection('मेरा दिल')).toBe('ltr')
    expect(textDirection('ਸਤ ਸ੍ਰੀ ਅਕਾਲ')).toBe('ltr')
    expect(textDirection('♪ ♪')).toBe('ltr')
    expect(textDirection('')).toBe('ltr')
  })
})

describe('linesToText', () => {
  it('joins lines, turns gaps into one blank line, trims the ends', () => {
    expect(linesToText([L(0, ''), L(1, 'a'), L(2, 'b'), L(3, ''), L(4, ''), L(5, 'c 😀'), L(6, '')])).toBe('a\nb\n\nc 😀')
    expect(linesToText([])).toBe('')
  })
})
