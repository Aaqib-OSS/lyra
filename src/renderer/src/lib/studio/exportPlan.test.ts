import { describe, expect, it } from 'vitest'
import { PLATFORM_PRESETS, buildDiagnostics, clock, enoughSpace, estimateBytes, estimateDuration, formatBytes, friendlyError, linesInPart, lrcStamp, overLimit, platformOf, remainingSeconds, srtStamp, toLrc, toSrt } from './exportPlan'

describe('platform presets', () => {
  it('finds the preset that matches exactly', () => {
    expect(platformOf('9:16', '1080p', 30)).toBe('reels')
    expect(platformOf('9:16', '1080p', 60)).toBe('shorts')
    expect(platformOf('9:16', '720p', 30)).toBeNull()
  })
  it('warns only when the part is longer than the platform takes', () => {
    const shorts = PLATFORM_PRESETS.find((p) => p.id === 'shorts')
    expect(overLimit(shorts, 45)).toBe(0)
    expect(overLimit(shorts, 61)).toBe(60)
    expect(overLimit(PLATFORM_PRESETS.find((p) => p.id === 'youtube'), 3600)).toBe(0)
    expect(overLimit(undefined, 999)).toBe(0)
  })
})

describe('estimates', () => {
  it('sizes a video from its bitrate', () => {
    // 9 Mbit/s + 192 kbit/s for 30 s + 2.8 s card
    expect(estimateBytes(9_000_000, 30)).toBe(Math.round((9_192_000 * 32.8) / 8))
    expect(formatBytes(estimateBytes(9_000_000, 30))).toBe('36 MB')
    expect(formatBytes(2 * 1024 ** 3)).toBe('2.0 GB')
  })
  it('formats clocks', () => {
    expect(clock(0)).toBe('0:00')
    expect(clock(65.4)).toBe('1:05')
    expect(clock(3725)).toBe('1:02:05')
  })
  it('does not guess the time left too early', () => {
    expect(remainingSeconds(1, 0.5)).toBeNull()
    expect(remainingSeconds(10, 0.01)).toBeNull()
    expect(remainingSeconds(10, 1)).toBeNull()
    expect(remainingSeconds(10, 0.25)).toBeCloseTo(30)
  })
  it('estimates a total time in words', () => {
    expect(estimateDuration(10, 'file').text).toBe('under a minute')
    expect(estimateDuration(180, 'smooth').text).toBe('about 5 min')
  })
  it('checks the free space with a margin', () => {
    expect(enoughSpace(null, 1e12)).toBe(true)
    expect(enoughSpace(100 * 1024 ** 2, 80 * 1024 ** 2)).toBe(false)
    expect(enoughSpace(10 * 1024 ** 3, 80 * 1024 ** 2)).toBe(true)
  })
})

describe('subtitle files', () => {
  const lines = [
    { timeMs: 1000, text: 'before' },
    { timeMs: 12_000, text: 'first line' },
    { timeMs: 15_500, text: 'second line' },
    { timeMs: 60_000, text: 'after' }
  ]
  it('stamps times', () => {
    expect(lrcStamp(65_430)).toBe('01:05.43')
    expect(srtStamp(3_725_007)).toBe('01:02:05,007')
  })
  it('keeps only lines inside the part, counted from the start of the video', () => {
    const part = linesInPart(lines, 10_000, 20_000)
    expect(part.map((l) => l.text)).toEqual(['first line', 'second line'])
    expect(part[0]).toEqual({ start: 2000, end: 5500, text: 'first line' })
    // the last line of the part is cut at the end of the part
    expect(part[1]!.end).toBe(10_000)
  })
  it('writes .lrc and .srt', () => {
    expect(toLrc(lines, 10_000, 20_000)).toBe('[00:02.00]first line\n[00:05.50]second line\n')
    expect(toSrt(lines, 10_000, 20_000)).toBe('1\n00:00:02,000 --> 00:00:05,500\nfirst line\n\n2\n00:00:05,500 --> 00:00:10,000\nsecond line\n')
  })
  it('applies the lyric offset and skips empty lines', () => {
    expect(toLrc([{ timeMs: 1000, text: ' ' }, { timeMs: 2000, text: 'hi' }], 0, 10_000, 500)).toBe('[00:02.50]hi\n')
  })
})

describe('failure messages', () => {
  it('explains the common failures in plain words', () => {
    expect(friendlyError('ENOSPC: no space left on device').title).toMatch(/disk is full/)
    expect(friendlyError('EPERM: operation not permitted').title).toMatch(/can not write/)
    expect(friendlyError('No sound arrived from this PC.').title).toMatch(/No sound/)
    expect(friendlyError('something odd').title).toMatch(/could not be finished/)
  })
  it('builds diagnostics without file paths', () => {
    const t = buildDiagnostics({ error: 'open C:\\Users\\Someone\\Videos\\x.mp4 failed', options: { ratio: '9:16', fps: 30 }, platform: 'win32', cores: 8, version: '1.0.0', at: new Date('2026-01-02T03:04:05Z') })
    expect(t).toContain('2026-01-02T03:04:05.000Z')
    expect(t).toContain('ratio: 9:16')
    expect(t).not.toContain('Someone')
    expect(t).toContain('<path>')
  })
})
