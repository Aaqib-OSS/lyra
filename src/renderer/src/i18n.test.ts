import { afterEach, describe, expect, it } from 'vitest'
import { formatDuration, setLanguage, translate as t, translatePlural as tp } from './i18n'
import { gu } from './locales/gu'
import { hi } from './locales/hi'

afterEach(() => setLanguage('en'))

describe('translate', () => {
  it('returns the English key when the language has no entry', () => {
    setLanguage('gu')
    expect(t('A sentence nobody translated')).toBe('A sentence nobody translated')
  })
  it('fills {values} in English and in other languages', () => {
    expect(t('Cleared {n} saved lookups', { n: 3 })).toBe('Cleared 3 saved lookups')
    setLanguage('hi')
    expect(t('Cleared {n} saved lookups', { n: 3 })).toContain('3')
  })
  it('picks plural forms by the language rule', () => {
    expect(tp('{n} line', '{n} lines', 1)).toBe('1 line')
    expect(tp('{n} line', '{n} lines', 2)).toBe('2 lines')
  })
})

describe('formatDuration', () => {
  it('uses m:ss and h:mm:ss', () => {
    expect(formatDuration(187_000)).toBe('3:07')
    expect(formatDuration(3_725_000)).toBe('1:02:05')
  })
})

describe('locale files', () => {
  const holes = (d: Record<string, string>): string[] => Object.entries(d).filter(([, v]) => !v.trim()).map(([k]) => k)
  const tokens = (s: string): string => (s.match(/\{\w+\}/g) ?? []).sort().join()
  for (const [name, dict] of [['hi', hi], ['gu', gu]] as const) {
    it(`${name} has no empty values and keeps every {placeholder}`, () => {
      expect(holes(dict)).toEqual([])
      for (const [k, v] of Object.entries(dict)) expect(tokens(v), k).toBe(tokens(k))
    })
  }
  it('Gujarati covers every key Hindi has', () => {
    expect(Object.keys(hi).filter((k) => !(k in gu))).toEqual([])
  })
})
