import { describe, expect, it } from 'vitest'
import { lyricsWhy, videoWhy } from './whyText'

describe('whyText', () => {
  it('lists good reasons first and caps the count', () => {
    expect(videoWhy(['variant', 'hd', 'own-channel', 'length-match'])).toEqual(['from the artist’s channel', 'same length as the song', 'HD'])
    expect(videoWhy(['variant', 'hd', 'own-channel', 'length-match'], 1)).toEqual(['from the artist’s channel'])
  })
  it('ignores unknown codes and missing input', () => {
    expect(videoWhy(['nope'])).toEqual([])
    expect(lyricsWhy(undefined)).toEqual([])
  })
  it('explains lyrics rows', () => {
    expect(lyricsWhy(['length-off', 'synced', 'right-song'])).toEqual(['same song', 'synced to the music', 'different length'])
  })
})
