import { describe, expect, it } from 'vitest'
import { lineDuration, matchScene, splitLine, videoTimeFor, wordSpans } from './personalScene'
import type { PersonalScene, Track } from '@shared/types'

const scene = { anchors: [[10, 0], [20, 10], [30, 12]] as Array<[number, number]>, loopFrom: 2, loopTo: 12 }

describe('videoTimeFor', () => {
  it('runs through the anchors, faster or slower between two of them', () => {
    expect(videoTimeFor(10, scene)).toEqual({ v: 0, slope: 1 })
    expect(videoTimeFor(15, scene).v).toBeCloseTo(5)
    const slow = videoTimeFor(25, scene)
    expect(slow.v).toBeCloseTo(11)
    expect(slow.slope).toBeCloseTo(0.2)
  })
  it('loops the lively part before and after the part the video was cut for', () => {
    const before = videoTimeFor(3, scene)
    expect(before.v).toBeGreaterThanOrEqual(2)
    expect(before.v).toBeLessThan(12)
    const after = videoTimeFor(100, scene)
    expect(after.v).toBeGreaterThanOrEqual(2)
    expect(after.v).toBeLessThan(12)
  })
  it('copes with too few anchors', () => {
    expect(videoTimeFor(5, { anchors: [[1, 1]], loopFrom: 0, loopTo: 1 }).v).toBe(0)
  })
})

describe('lyric helpers', () => {
  it('splits a backing vocal from the line', () => {
    expect(splitLine('(Hold me close) Look me dead in my eyes')).toEqual({ bk: 'Hold me close', main: 'Look me dead in my eyes' })
    expect(splitLine('Just a line')).toEqual({ bk: '', main: 'Just a line' })
    expect(splitLine('(only a backing)')).toEqual({ bk: '', main: '(only a backing)' })
  })
  it('gives every word a share of the line that adds up to the whole', () => {
    const s = wordSpans(['a', 'longer', 'line'])
    expect(s[0]![0]).toBe(0)
    expect(s[2]![1]).toBeCloseTo(1)
    expect(s[1]![0]).toBeCloseTo(s[0]![1])
  })
  it('limits how long a line lasts', () => {
    const lines = [{ timeMs: 0, text: 'a' }, { timeMs: 100, text: 'b' }, { timeMs: 60_000, text: 'c' }]
    expect(lineDuration(lines, 0)).toBe(900)
    expect(lineDuration(lines, 1)).toBe(6000)
  })
})

describe('matchScene', () => {
  const s: PersonalScene = { id: 'x', match: { title: 'Her', artist: 'JVKE' }, anchors: [[0, 0], [1, 1]], loopFrom: 0, loopTo: 1, videoDurationSec: 1, videoNudgeSec: 0, lyricNudgeSec: 0, videoUrl: 'u', artUrl: null }
  const t = (title: string, artists: string[]): Track => ({ title, artists }) as Track
  it('matches the song ignoring case and brackets', () => {
    expect(matchScene([s], t('her', ['JVKE']))).toBe(s)
    expect(matchScene([s], t('Her (Remastered)', ['jvke']))).toBe(s)
    expect(matchScene([s], t('her', ['Someone', 'JVKE']))).toBe(s)
  })
  it('does not match another song or no song', () => {
    expect(matchScene([s], t('hers', ['JVKE']))).toBeNull()
    expect(matchScene([s], t('her', ['Someone else']))).toBeNull()
    expect(matchScene([s], null)).toBeNull()
    expect(matchScene([], t('her', ['JVKE']))).toBeNull()
  })
})
