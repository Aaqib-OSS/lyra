import { describe, expect, it } from 'vitest'
import { addTake, capRecords, migrateBest, sanitizeRecords, setCapped, MAX_RECENT, type Records } from './records'

describe('karaoke records', () => {
  it('first take is a new best, a lower one is not, and the history is capped', () => {
    let r: Records = {}
    let a = addTake(r, 's', 6000, 3, 1)
    expect(a.newBest).toBe(true)
    r = a.records
    a = addTake(r, 's', 5000, 2, 2)
    expect(a.newBest).toBe(false)
    expect(a.records.s!.best).toBe(6000)
    expect(a.records.s!.stars).toBe(3)
    expect(a.records.s!.plays).toBe(2)
    r = a.records
    for (let i = 0; i < 20; i++) r = addTake(r, 's', 100 + i, 0, 3 + i).records
    expect(r.s!.recent.length).toBe(MAX_RECENT)
  })
  it('does not mutate its input', () => {
    const r: Records = {}
    addTake(r, 's', 1, 0, 1)
    expect(r).toEqual({})
  })
  it('keeps the most recently played songs', () => {
    const r: Records = {}
    for (let i = 0; i < 10; i++) r[`s${i}`] = { best: 1, stars: 0, plays: 1, lastAt: i, recent: [1] }
    const c = capRecords(r, 3)
    expect(Object.keys(c).sort()).toEqual(['s7', 's8', 's9'])
  })
  it('migrates old best scores without overwriting newer ones', () => {
    const m = migrateBest({ a: 1200, b: 900, junk: NaN as number }, { b: { best: 5000, stars: 2, plays: 3, lastAt: 9, recent: [5000] } })
    expect(m.a!.best).toBe(1200)
    expect(m.b!.best).toBe(5000)
    expect(m.junk).toBeUndefined()
  })
  it('sanitizes a damaged store', () => {
    const s = sanitizeRecords({ a: { best: 99999, stars: 9, plays: -2, recent: [1, 'x', 3] }, b: 'nope', c: null })
    expect(Object.keys(s)).toEqual(['a'])
    expect(s.a).toMatchObject({ best: 10000, stars: 5, plays: 0, recent: [1, 3] })
    expect(sanitizeRecords('x')).toEqual({})
  })
  it('caps a map and keeps the newest', () => {
    let m: Record<string, number> = {}
    for (let i = 0; i < 10; i++) m = setCapped(m, `k${i}`, i, 4)
    expect(Object.keys(m)).toEqual(['k6', 'k7', 'k8', 'k9'])
    m = setCapped(m, 'k6', 0, 4)
    expect(Object.keys(m).pop()).toBe('k6')
  })
})
