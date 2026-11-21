import { describe, expect, it } from 'vitest'
import { loudnessGainFromEnergies, loudnessGainOf } from './loudness'
import { PcmStore } from './pcmStore'

function song(frames: number): { i16: Int16Array; l: Float32Array; r: Float32Array } {
  const i16 = new Int16Array(frames * 2)
  const l = new Float32Array(frames)
  const r = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    i16[i * 2] = Math.round(Math.sin(i / 37) * 12000 + Math.sin(i / 5) * 3000)
    i16[i * 2 + 1] = Math.round(Math.cos(i / 41) * 9000)
    l[i] = i16[i * 2]! / 32768
    r[i] = i16[i * 2 + 1]! / 32768
  }
  return { i16, l, r }
}

describe('PcmStore', () => {
  it('round-trips across page boundaries', () => {
    const { i16, l, r } = song(120_000)
    const s = new PcmStore()
    s.appendInterleaved(i16.subarray(0, 2 * 70_001)) // odd split on purpose
    s.appendInterleaved(i16.subarray(2 * 70_001))
    expect(s.frames).toBe(120_000)
    const ol = new Float32Array(5000)
    const or = new Float32Array(5000)
    s.read(46_000, 5000, ol, or) // crosses the 48000-frame page edge
    for (let i = 0; i < 5000; i++) {
      expect(ol[i]).toBe(l[46_000 + i])
      expect(or[i]).toBe(r[46_000 + i])
    }
  })
  it('gives the same loudness gain as the float-array estimate', () => {
    const { i16, l, r } = song(48000 * 12)
    const s = new PcmStore()
    s.appendInterleaved(i16)
    const a = loudnessGainOf([l, r], 0, l.length)
    const b = loudnessGainFromEnergies(s.blockEnergies())
    expect(b).toBeCloseTo(a, 10)
  })
  it('stores silence and float input (clamped, mono spread to both ears)', () => {
    const s = new PcmStore()
    s.appendSilence(100_000)
    s.appendFloat(new Float32Array([0.5, 2, -2]), null)
    expect(s.frames).toBe(100_003)
    const l = new Float32Array(3)
    const r = new Float32Array(3)
    s.read(100_000, 3, l, r)
    expect(Array.from(l)).toEqual([0.5, 32767 / 32768, -1])
    expect(Array.from(r)).toEqual(Array.from(l))
  })
  it('uses 4 bytes a frame, in whole pages', () => {
    const s = new PcmStore()
    s.appendSilence(48000 * 60 * 4) // 4 minutes
    expect(s.bytes).toBe(48000 * 60 * 4 * 4)
    s.clear()
    expect(s.bytes).toBe(0)
  })
})
