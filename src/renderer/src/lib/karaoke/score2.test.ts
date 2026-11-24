import { describe, expect, it } from 'vitest'
import { classifyMicError } from './mic'
import { isScorable, REACTION_MS, scoreLine, scoreLines, summarize, type Frame, type KLine } from './score'

const sing = (fromMs: number, toMs: number, cents: number | null = 5): Frame[] => {
  const out: Frame[] = []
  for (let t = fromMs; t < toMs; t += 50) out.push({ tMs: t, voiced: true, cents })
  return out
}
const lines: KLine[] = [
  { startMs: 0, endMs: 2000, text: 'hello world' },
  { startMs: 2500, endMs: 3500, text: '♪' },
  { startMs: 4000, endMs: 6000, text: 'again now' }
]

describe('karaoke scoring extras', () => {
  it('ignores instrumental and empty lines', () => {
    expect(isScorable('♪')).toBe(false)
    expect(isScorable('  ')).toBe(false)
    expect(isScorable('...')).toBe(false)
    expect(isScorable('hello')).toBe(true)
    expect(isScorable('नमस्ते')).toBe(true)
    expect(scoreLines(lines, [], 0, 3).map((r) => r.index)).toEqual([0, 2])
  })
  it('a prompt singer, heard a moment after the cue, is not late', () => {
    const late = sing(0 + REACTION_MS, 2000 + REACTION_MS)
    expect(scoreLine(0, lines[0]!, late).points).toBeGreaterThan(85)
    expect(scoreLine(0, lines[0]!, late, 0).points).toBeLessThan(scoreLine(0, lines[0]!, late).points + 1)
  })
  it('does not score lines that start after the microphone was lost', () => {
    const r = scoreLines(lines, sing(0, 2000), 0, 3, 3000)
    expect(r.map((x) => x.index)).toEqual([0])
  })
  it('flags a take where nothing was heard, and not a quiet but real one', () => {
    const quiet: Frame[] = Array.from({ length: 200 }, (_, i) => ({ tMs: i * 50, voiced: false, cents: null }))
    expect(summarize(scoreLines(lines, quiet), quiet).silent).toBe(true)
    const real = [...quiet.slice(0, 100), ...sing(5000, 6000)]
    expect(summarize(scoreLines(lines, real), real).silent).toBe(false)
  })
  it('reports timing, steadiness and the grade counts', () => {
    const f = sing(0, 2000, 2).concat(sing(4000, 6000, 2))
    const s = summarize(scoreLines(lines, f), f)
    expect(s.grades.perfect + s.grades.great + s.grades.ok + s.grades.miss).toBe(2)
    expect(s.timing).toBeGreaterThan(0.9)
    expect(s.steadiness).toBeGreaterThan(0.9)
  })
  it('names the microphone problems', () => {
    expect(classifyMicError({ name: 'NotAllowedError' })).toBe('denied')
    expect(classifyMicError({ name: 'NotFoundError' })).toBe('missing')
    expect(classifyMicError({ name: 'NotReadableError' })).toBe('busy')
    expect(classifyMicError({ name: 'TypeError' })).toBe('unsupported')
    expect(classifyMicError(null)).toBe('other')
  })
})
