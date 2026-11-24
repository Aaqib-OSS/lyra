import { describe, expect, it } from 'vitest'
import { needsReanchor, positionDrift, type DeltaSnap } from './snapshotDelta'

const s = (o: Partial<DeltaSnap> = {}): DeltaSnap => ({ positionMs: 10_000, sampledAt: 1_000, isPlaying: true, isAdOrUnknown: false, ...o })

describe('needsReanchor', () => {
  it('always anchors the first reading', () => expect(needsReanchor(null, s())).toBe(true))
  it('ignores normal progress', () => expect(needsReanchor(s(), s({ positionMs: 13_100, sampledAt: 4_000 }))).toBe(false))
  it('detects a seek', () => expect(needsReanchor(s(), s({ positionMs: 60_000, sampledAt: 4_000 }))).toBe(true))
  it('detects a stall (position did not advance)', () => expect(needsReanchor(s(), s({ positionMs: 10_000, sampledAt: 4_000 }))).toBe(true))
  it('detects play/pause and ads', () => {
    expect(needsReanchor(s(), s({ isPlaying: false }))).toBe(true)
    expect(needsReanchor(s(), s({ isAdOrUnknown: true }))).toBe(true)
  })
  it('does not advance the prediction while paused', () => {
    expect(positionDrift(s({ isPlaying: false }), s({ isPlaying: false, positionMs: 10_000, sampledAt: 9_000 }))).toBe(0)
  })
})
