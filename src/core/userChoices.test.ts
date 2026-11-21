import { describe, expect, it } from 'vitest'
import type { Store } from './platform'
import { CHOICES_VERSION, MAX_CHOICES, UserChoices, type ChoicesFile } from './userChoices'

function make(initial?: ChoicesFile, startAt = 1) {
  let data: ChoicesFile = initial ?? { v: CHOICES_VERSION, songs: {} }
  let t = startAt
  const store: Store<ChoicesFile> = { get: () => data, set: (v) => void (data = v) }
  return { c: new UserChoices(() => store, () => t++), read: () => data }
}

const VID = 'dQw4w9WgXcQ'

describe('UserChoices', () => {
  it('returns null for unknown songs', () => {
    expect(make().c.getChoice('a|b')).toBeNull()
  })

  it('stores and merges video, lyrics and offset', () => {
    const { c } = make()
    c.setChoice('a|b', { video: { videoId: VID } })
    c.setChoice('a|b', { lyrics: { provider: 'lrclib', id: '42' } })
    c.setChoice('a|b', { offsetMs: 250 })
    expect(c.getChoice('a|b')).toMatchObject({ video: { videoId: VID }, lyrics: { provider: 'lrclib', id: '42' }, offsetMs: 250 })
  })

  it('clears one field or the whole song', () => {
    const { c } = make()
    c.setChoice('a|b', { video: { videoId: VID }, offsetMs: 500 })
    c.clearChoice('a|b', 'video')
    expect(c.getChoice('a|b')).toMatchObject({ offsetMs: 500 })
    expect(c.getChoice('a|b')?.video).toBeUndefined()
    c.clearChoice('a|b', 'offsetMs')
    expect(c.getChoice('a|b')).toBeNull() // empty entries disappear
    c.setChoice('a|b', { video: { videoId: VID } })
    c.clearChoice('a|b')
    expect(c.getChoice('a|b')).toBeNull()
  })

  it('an offset of 0 or null resets it; large offsets are clamped', () => {
    const { c } = make()
    c.setChoice('k', { offsetMs: 99_999 })
    expect(c.getChoice('k')?.offsetMs).toBe(10_000)
    c.setChoice('k', { offsetMs: -99_999 })
    expect(c.getChoice('k')?.offsetMs).toBe(-10_000)
    c.setChoice('k', { offsetMs: 0 })
    expect(c.getChoice('k')).toBeNull()
  })

  it('rejects malformed values', () => {
    const { c } = make()
    expect(c.setChoice('k', { video: { videoId: 'bad id' } })).toBeNull()
    expect(c.setChoice('k', { lyrics: { provider: '', id: 'x' } })).toBeNull()
    expect(c.getChoice('k')).toBeNull()
  })

  it('ignores junk already in the file', () => {
    const { c } = make({ v: CHOICES_VERSION, songs: { x: 'nope' as never, y: { at: 1, video: { videoId: 'short' } } } })
    expect(c.getChoice('x')).toBeNull()
    expect(c.getChoice('y')).toBeNull()
  })

  it('never reads or overwrites a newer schema', () => {
    const future = { v: CHOICES_VERSION + 1, songs: { k: { at: 1, offsetMs: 5 } } }
    const { c, read } = make(future)
    expect(c.getChoice('k')).toBeNull()
    c.setChoice('k', { offsetMs: 9 })
    c.clearChoice('k')
    expect(read()).toBe(future)
  })

  it('caps size by dropping the least recently touched', () => {
    const songs: ChoicesFile['songs'] = {}
    for (let i = 0; i < MAX_CHOICES; i++) songs[`s${i}`] = { at: 10 + i, offsetMs: 1 }
    const { c, read } = make({ v: CHOICES_VERSION, songs }, 100_000)
    c.setChoice('new', { offsetMs: 2 })
    const keys = Object.keys(read().songs)
    expect(keys.length).toBe(MAX_CHOICES)
    expect(keys).toContain('new')
    expect(keys).not.toContain('s0')
    expect(keys).toContain('s1')
  })

  it('writes the versioned shape', () => {
    const { c, read } = make()
    c.setChoice('k', { offsetMs: 1 })
    expect(read().v).toBe(CHOICES_VERSION)
  })
})
