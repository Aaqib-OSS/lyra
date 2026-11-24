import { describe, expect, it } from 'vitest'
import type { LyricsResult } from '@shared/types'
import { matchLooksOff, providerLabel } from './lyricsSource'

const track = { title: 'Tum Hi Ho', artists: ['Arijit Singh'], durationMs: 262_000 }
const res = (m: LyricsResult['matched'], extra: Partial<LyricsResult> = {}): LyricsResult => ({ trackId: 't', status: 'synced', provider: 'lrclib', lines: [], matched: m, ...extra })

describe('lyrics source helpers', () => {
  it('names providers for people', () => {
    expect(providerLabel('public-domain')).toBe('Public-domain lyrics')
    expect(providerLabel('lrclib')).toBe('LRCLIB')
  })
  it('does not warn for a good match', () => {
    expect(matchLooksOff(track, res({ title: 'Tum Hi Ho', artist: 'Arijit Singh', durationMs: 261_000 }))).toBe(false)
  })
  it('warns for another song or a very different length', () => {
    expect(matchLooksOff(track, res({ title: 'Kesariya', artist: 'Arijit Singh', durationMs: 262_000 }))).toBe(true)
    expect(matchLooksOff(track, res({ title: 'Tum Hi Ho', artist: 'Arijit Singh', durationMs: 420_000 }))).toBe(true)
  })
  it('never warns about the user\'s own choice or when nothing is known', () => {
    expect(matchLooksOff(track, res({ title: 'Kesariya', artist: 'x', durationMs: 1 }, { pinned: true }))).toBe(false)
    expect(matchLooksOff(track, res(undefined))).toBe(false)
    expect(matchLooksOff(null, res({ title: 'a', artist: 'b', durationMs: 1 }))).toBe(false)
  })
})
