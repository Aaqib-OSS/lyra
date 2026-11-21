import { describe, expect, it } from 'vitest'
import { MAX_HOLD_MS, decideStartGate, type GateInput } from './startGate'

const base: GateInput = {
  enabled: true,
  canControl: true,
  isPlaying: true,
  positionMs: 400,
  userTouched: false,
  alreadyGated: false,
  lyricsLoading: true,
  videoWanted: true,
  videoLoading: true,
  firstLineMs: 12000
}
const decide = (over: Partial<GateInput> = {}) => decideStartGate({ ...base, ...over })

describe('start gate', () => {
  it('holds briefly when a fresh song has neither lyrics nor video and the first line is far away', () => {
    const d = decide()
    expect(d.hold).toBe(true)
    if (d.hold) expect(d.holdMs).toBe(MAX_HOLD_MS)
  })

  it('is off by default (the switch decides)', () => {
    expect(decide({ enabled: false }).hold).toBe(false)
  })

  it('never holds longer than 1.5 s', () => {
    const d = decide({ firstLineMs: 120_000 })
    expect(d.hold && d.holdMs).toBeLessThanOrEqual(1500)
  })

  it('the hold always ends at least 1 s before the first line, even at the edge of the rules', () => {
    // earliest allowed first line (5 s) and the latest allowed position (2.5 s): 1.5 s of room remain
    const d = decide({ firstLineMs: 5000, positionMs: 2500 })
    expect(d.hold).toBe(true)
    if (d.hold) expect(2500 + d.holdMs).toBeLessThanOrEqual(5000 - 1000)
  })

  it('does not hold when the first lyric line is within 5 s (it would be missed)', () => {
    expect(decide({ firstLineMs: 4900 }).hold).toBe(false)
  })

  it('does not hold when the first line is unknown', () => {
    expect(decide({ firstLineMs: null }).hold).toBe(false)
  })

  it('does not hold when lyrics are ready, even if the video is not', () => {
    expect(decide({ lyricsLoading: false }).hold).toBe(false)
  })

  it('does not hold when the video is ready, even if the lyrics are not', () => {
    expect(decide({ videoLoading: false }).hold).toBe(false)
  })

  it('holds for lyrics alone when no video is wanted', () => {
    expect(decide({ videoWanted: false, videoLoading: false }).hold).toBe(true)
  })

  it('never gates a song the user paused or sought in, or one already gated', () => {
    expect(decide({ userTouched: true }).hold).toBe(false)
    expect(decide({ alreadyGated: true }).hold).toBe(false)
  })

  it('only gates the first moments of a song', () => {
    expect(decide({ positionMs: 3000 }).hold).toBe(false)
  })

  it('does nothing for players Lyra cannot pause, or when nothing plays', () => {
    expect(decide({ canControl: false }).hold).toBe(false)
    expect(decide({ isPlaying: false }).hold).toBe(false)
  })
})
