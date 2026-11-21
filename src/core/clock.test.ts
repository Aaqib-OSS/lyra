import { describe, expect, it } from 'vitest'
import { DriftController, estimatePositionMs, isTimelineSyncable, videoTargetSec, YT_DRIFT } from './clock'

const anchor = { positionMs: 10_000, sampledAt: 1_000, isPlaying: true, durationMs: 120_000 }

describe('estimatePositionMs', () => {
  it('interpolates while playing', () => expect(estimatePositionMs(anchor, 3_500)).toBe(12_500))
  it('is frozen while paused', () => expect(estimatePositionMs({ ...anchor, isPlaying: false }, 9_000)).toBe(10_000))
  it('is frozen during an ad break', () => expect(estimatePositionMs({ ...anchor, isAdOrUnknown: true }, 9_000)).toBe(10_000))
  it('clamps to the song length and to zero', () => {
    expect(estimatePositionMs(anchor, 999_999)).toBe(120_000)
    expect(estimatePositionMs({ ...anchor, positionMs: 0 }, 500)).toBe(0) // sample in the future: no negative elapsed
  })
  it('handles no snapshot', () => expect(estimatePositionMs(null)).toBe(0))
})

describe('video mapping', () => {
  it('a late video joins at the song position, not at 0', () => {
    expect(videoTargetSec(estimatePositionMs(anchor, 1_000 + 4_000), 125)).toBe(14)
  })
  it('only same-length videos are timeline-synced', () => {
    expect(isTimelineSyncable(125, 120_000)).toBe(true)
    expect(isTimelineSyncable(240, 120_000)).toBe(false)
    expect(isTimelineSyncable(null, 120_000)).toBe(false)
  })
  it('clamps inside the clip', () => expect(videoTargetSec(500_000, 100)).toBe(99.5))
})

describe('DriftController', () => {
  const s = (o: Partial<Parameters<DriftController['update']>[0]>) => ({ nowMs: 0, videoSec: 0, targetSec: 0, playing: true, buffering: false, rate: 1, ...o })

  it('seeks on join when the video starts at 0 but the song is 10 s in', () => {
    const d = new DriftController()
    const a = d.update(s({ videoSec: 0, targetSec: 10 }))
    expect(a.seekToSec).toBeCloseTo(10 + YT_DRIFT.seekLeadSec)
  })
  it('does nothing when already in sync', () => {
    const d = new DriftController()
    expect(d.update(s({ videoSec: 10.1, targetSec: 10 }))).toEqual({})
    expect(d.update(s({ nowMs: 500, videoSec: 10.7, targetSec: 10.55 }))).toEqual({})
  })
  it('ignores paused and buffering samples, then re-joins', () => {
    const d = new DriftController()
    d.update(s({ videoSec: 10, targetSec: 10 }))
    expect(d.update(s({ nowMs: 100, videoSec: 0, targetSec: 50, buffering: true }))).toEqual({})
    expect(d.update(s({ nowMs: 200, videoSec: 0, targetSec: 50, playing: false }))).toEqual({})
    expect(d.update(s({ nowMs: 300, videoSec: 0, targetSec: 50 })).seekToSec).toBeDefined()
  })
  it('nudges speed for small drift and releases when caught up', () => {
    const d = new DriftController()
    d.update(s({ videoSec: 10, targetSec: 10 }))
    expect(d.update(s({ nowMs: 1000, videoSec: 9.5, targetSec: 10 }))).toEqual({ rate: 1.25 })
    expect(d.update(s({ nowMs: 1500, videoSec: 9.8, targetSec: 10, rate: 1.25 }))).toEqual({})
    expect(d.update(s({ nowMs: 2000, videoSec: 9.95, targetSec: 10.0, rate: 1.25 }))).toEqual({ rate: 1 })
  })
  it('does not spam seeks after a seek', () => {
    const d = new DriftController()
    d.update(s({ videoSec: 0, targetSec: 10 })) // join seek
    for (let t = 100; t < 2900; t += 400) expect(d.update(s({ nowMs: t, videoSec: 0, targetSec: 10 + t / 1000 }))).toEqual({})
    expect(d.update(s({ nowMs: 3200, videoSec: 0, targetSec: 13.2 })).seekToSec).toBeDefined()
  })
  it('seeks for a big mid-song jump (user seek) and resets any nudge', () => {
    const d = new DriftController()
    d.update(s({ videoSec: 10, targetSec: 10 }))
    d.update(s({ nowMs: 1000, videoSec: 9.5, targetSec: 10 })) // nudging
    const a = d.update(s({ nowMs: 5000, videoSec: 12, targetSec: 60, rate: 1.25 }))
    expect(a.seekToSec).toBeCloseTo(60.2)
    expect(a.rate).toBe(1)
  })
  it('falls back to seeking at a lower threshold when the embed ignores playbackRate', () => {
    const d = new DriftController()
    d.update(s({ videoSec: 10, targetSec: 10 }))
    expect(d.update(s({ nowMs: 1000, videoSec: 9.5, targetSec: 10 }))).toEqual({ rate: 1.25 })
    for (let t = 1500; t <= 2500; t += 500) d.update(s({ nowMs: t, videoSec: 9.5, targetSec: 10, rate: 1 }))
    expect(d.rateSupported).toBe(false)
    expect(d.update(s({ nowMs: 6000, videoSec: 8.5, targetSec: 10 })).seekToSec).toBeDefined() // 1.5 s: seek, no nudge
  })
})
