import { describe, expect, it } from 'vitest'
import { ALL_VIBES, pickVibe, stepVibe } from './vibes'

const base = { title: 'T', artists: ['A'], lines: [] as string[] }

describe('stepVibe', () => {
  it('walks the pool and wraps around', () => {
    expect(stepVibe('neon', ['neon', 'dream', 'crt'], 1)).toBe('dream')
    expect(stepVibe('crt', ['neon', 'dream', 'crt'], 1)).toBe('neon')
    expect(stepVibe('neon', ['neon', 'dream', 'crt'], -1)).toBe('crt')
  })
  it('starts at the first vibe when the current one is not in the pool', () => {
    expect(stepVibe('chat', ['neon', 'dream'], 1)).toBe('neon')
    expect(stepVibe('chat', ['neon', 'dream'], -1)).toBe('dream')
  })
  it('treats an empty pool as every vibe', () => {
    expect(stepVibe('none', [], 1)).toBe(ALL_VIBES[1])
  })
})

describe('pickVibe', () => {
  it('picks Neon for night-city lyrics on a bold dark cover', () => {
    const r = pickVibe({ ...base, lines: ['midnight lights in the city', 'we drive through the neon night'], hue: 300, sat: 0.7, light: 0.3 })
    expect(r.vibe).toBe('neon')
  })
  it('picks Dream for a slow song about stars and sleep', () => {
    const r = pickVibe({ ...base, lines: ['floating under the moon', 'dream of the stars and the sky'], durationMs: 240000, hue: 300, sat: 0.4, light: 0.75 })
    expect(r.vibe).toBe('dream')
  })
  it('picks Cinema for a black-and-white cover', () => {
    const r = pickVibe({ ...base, lines: ['alone in the dark'], hue: 0, sat: 0.03, light: 0.4 })
    expect(r.vibe).toBe('noir')
  })
  it('picks Chrome for an old song with shiny words', () => {
    const r = pickVibe({ ...base, year: 1999, lines: ['shine like silver', 'baby you are a diamond'] })
    expect(r.vibe).toBe('chrome')
  })
  it('only returns vibes from the pool', () => {
    const r = pickVibe({ ...base, lines: ['midnight neon city'] }, ['dream', 'paper'])
    expect(['dream', 'paper']).toContain(r.vibe)
  })
  it('is deterministic', () => {
    const a = pickVibe({ ...base, title: 'Same song', lines: [] })
    const b = pickVibe({ ...base, title: 'Same song', lines: [] })
    expect(a).toEqual(b)
  })
  it('spreads songs with no information across vibes', () => {
    const picks = new Set(Array.from({ length: 30 }, (_, i) => pickVibe({ ...base, title: `Song ${i}` }).vibe))
    expect(picks.size).toBeGreaterThan(3)
  })
})
