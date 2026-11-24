import { describe, expect, it } from 'vitest'
import type { SavedMoment } from './types'
import { MOMENTS_MAX, addMoment, momentCaption, momentsToMarkdown, normalizeMoments, sanitizeMoment, searchMoments } from './moments'

const base = { trackId: 't1', title: 'Song', artist: 'Band', artworkUrl: null, text: 'Hello there', timeMs: 1000 }
const m = (over: Partial<SavedMoment> = {}): SavedMoment => ({ ...base, id: 'a', savedAt: 1, ...over })

describe('moments', () => {
  it('drops junk and caps long text', () => {
    expect(sanitizeMoment(null)).toBeNull()
    expect(sanitizeMoment({ trackId: 't', text: '   ' })).toBeNull()
    expect(sanitizeMoment({ ...base, text: 'x'.repeat(5000) })!.text).toHaveLength(600)
    expect(sanitizeMoment({ ...base, artworkUrl: 'javascript:alert(1)' })!.artworkUrl).toBeNull()
  })
  it('normalises a corrupt list: non-array, junk, duplicates, cap', () => {
    expect(normalizeMoments({ nope: 1 })).toEqual([])
    expect(normalizeMoments([m(), m({ id: 'b' }), 5, null])).toHaveLength(1)
    const many = Array.from({ length: MOMENTS_MAX + 20 }, (_, i) => m({ id: `i${i}`, text: `line ${i}` }))
    expect(normalizeMoments(many)).toHaveLength(MOMENTS_MAX)
  })
  it('dedupes ignoring case and spacing, newest first', () => {
    const one = addMoment([], base, 'x', 5)
    expect(addMoment(one, { ...base, text: 'hello   THERE' }, 'y', 6)).toBe(one)
    const two = addMoment(one, { ...base, text: 'Another' }, 'z', 7)
    expect(two.map((x) => x.id)).toEqual(['z', 'x'])
  })
  it('searches words in any order, without accents or case', () => {
    const items = [m({ text: 'Café at midnight' }), m({ id: 'b', text: 'Other', title: 'Midnight Sun' })]
    expect(searchMoments(items, 'CAFE midnight')).toHaveLength(1)
    expect(searchMoments(items, 'midnight')).toHaveLength(2)
    expect(searchMoments(items, '  ')).toBe(items)
  })
  it('makes a link-free caption and markdown grouped by song', () => {
    expect(momentCaption('Hi', 'S', 'A')).toBe('“Hi” — S, A')
    const md = momentsToMarkdown([m(), m({ id: 'b', text: 'Two' }), m({ id: 'c', title: 'Else', text: 'Three' })])
    expect(md.match(/^## /gm)).toHaveLength(2)
    expect(md).toContain('> Two')
    expect(md).not.toMatch(/https?:/)
  })
})
