import { describe, expect, it } from 'vitest'
import type { YoutubeVideo } from '@shared/types'
import type { Store } from '../platform'
import { avoidFailed, FAILS_VERSION, FailedVideos, type FailBook } from './failedVideos'

function make(startAt = 1_000) {
  let data: FailBook = { v: FAILS_VERSION, songs: {} }
  let now = startAt
  const store: Store<FailBook> = { get: () => data, set: (v) => void (data = v) }
  return { f: new FailedVideos(() => store, () => now), read: () => data, advance: (ms: number) => void (now += ms) }
}

const A = 'aaaaaaaaaaa'
const B = 'bbbbbbbbbbb'

describe('FailedVideos', () => {
  it('remembers a failed video per song and survives a new instance on the same store', () => {
    const { f } = make()
    f.remember('a|b', A)
    expect(f.failed('a|b')).toEqual(new Set([A]))
    expect(f.failed('other|song').size).toBe(0)
  })

  it('ignores malformed ids and empty keys', () => {
    const { f, read } = make()
    f.remember('a|b', 'nope')
    f.remember('', A)
    expect(read().songs).toEqual({})
  })

  it('forgets one video or the whole song (a hand pick gets another chance)', () => {
    const { f } = make()
    f.remember('a|b', A)
    f.remember('a|b', B)
    f.forget('a|b', A)
    expect(f.failed('a|b')).toEqual(new Set([B]))
    f.forget('a|b')
    expect(f.failed('a|b').size).toBe(0)
  })

  it('expires old entries and caps ids per song', () => {
    const { f, advance } = make()
    f.remember('a|b', A)
    advance(61 * 24 * 3600_000)
    expect(f.failed('a|b').size).toBe(0)
    for (let i = 0; i < 12; i++) f.remember('c|d', `video${String(i).padStart(6, '0')}`)
    expect(f.failed('c|d').size).toBe(8)
  })

  it('does not touch a file from a newer schema', () => {
    let data: FailBook = { v: 99, songs: {} }
    const f = new FailedVideos(() => ({ get: () => data, set: (v) => void (data = v) }))
    f.remember('a|b', A)
    expect(data.v).toBe(99)
    expect(f.failed('a|b').size).toBe(0)
  })
})

describe('avoidFailed', () => {
  const vid = (id: string, extra: Partial<YoutubeVideo> = {}): YoutubeVideo => ({ videoId: id, title: id, channel: 'c', durationSec: 200, ...extra })
  it('keeps the pick when it did not fail', () => {
    const a = vid(A)
    expect(avoidFailed(a, [a, vid(B)], new Set(), 200)).toBe(a)
  })
  it('moves to the next acceptable video when the pick failed', () => {
    const a = vid(A, { acceptable: true })
    const b = vid(B, { acceptable: true })
    expect(avoidFailed(a, [a, vid('ccccccccccc', { acceptable: false }), b], new Set([A]), 200)).toBe(b)
  })
  it('without ranker flags, requires about the right length', () => {
    const a = vid(A)
    expect(avoidFailed(a, [a, vid(B, { durationSec: 400 })], new Set([A]), 200)).toBeNull()
    expect(avoidFailed(a, [a, vid(B, { durationSec: 210 })], new Set([A]), 200)?.videoId).toBe(B)
  })
  it('returns null when everything failed or nothing was picked', () => {
    const a = vid(A, { acceptable: true })
    expect(avoidFailed(a, [a], new Set([A]), 200)).toBeNull()
    expect(avoidFailed(null, [a], new Set(), 200)).toBeNull()
  })
})
