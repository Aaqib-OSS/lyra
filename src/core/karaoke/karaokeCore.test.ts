import { describe, expect, it } from 'vitest'
import { rankKaraoke, scoreKaraoke, type VideoCandidate } from '../background/rank'
import { activeIndex, countInAt, gapBefore, inBreak, wordFills, type Span } from './countIn'
import { SmoothClock, usableRates } from './clockSmooth'
import { addBad, counterpart, orderItems, pickFirst, pickNext, songMemoryKey, type KaraokeItem } from './select'

const want = { title: 'Blinding Lights', artist: 'The Weeknd', durationMs: 200_000 }
const v = (videoId: string, title: string, channel: string, durationSec: number | null, embeddable = true): VideoCandidate => ({ videoId, title, channel, durationSec, embeddable })

describe('rankKaraoke', () => {
  const list = [
    v('official', 'The Weeknd - Blinding Lights (Official Video)', 'TheWeekndVEVO', 200),
    v('sk', 'Blinding Lights - The Weeknd (Karaoke Version)', 'Sing King', 201),
    v('inst', 'The Weeknd - Blinding Lights (Instrumental)', 'Some Channel', 203),
    v('guide', 'Blinding Lights - The Weeknd (Karaoke With Lead Vocals)', 'Karafun Karaoke', 200),
    v('cover', 'Blinding Lights - karaoke cover by someone', 'Fan', 205),
    v('long', 'Blinding Lights karaoke 10 hours loop', 'Loops', 36000),
    v('noembed', 'Blinding Lights (Karaoke)', 'Sing King', 200, false),
    v('wrongsong', 'Another Song (Karaoke Version)', 'Sing King', 200)
  ]
  const ranked = rankKaraoke(want, list)
  const ids = ranked.map((r) => r.videoId)

  it('puts a clean karaoke version from a karaoke channel first and never offers an unembeddable or wrong one as best', () => {
    expect(ids[0]).toBe('sk')
    expect(ids).not.toContain('noembed')
    expect(ranked.find((r) => r.videoId === 'wrongsong')?.acceptable ?? false).toBe(false)
  })
  it('ranks the plain official video and the loop below real karaoke', () => {
    expect(ids.indexOf('sk')).toBeLessThan(ids.indexOf('long') === -1 ? 99 : ids.indexOf('long'))
    expect(ranked.find((r) => r.videoId === 'official')?.acceptable ?? false).toBe(false)
    expect(ranked.find((r) => r.videoId === 'long')?.acceptable ?? false).toBe(false)
  })
  it('flags guide-vocal versions and prefers the clean one', () => {
    const g = ranked.find((r) => r.videoId === 'guide')!
    expect(g.guide).toBe(true)
    expect(ranked.find((r) => r.videoId === 'sk')!.guide).toBe(false)
    expect(ranked.find((r) => r.videoId === 'sk')!.score).toBeGreaterThan(g.score)
  })
  it('treats an instrumental as acceptable', () => {
    expect(ranked.find((r) => r.videoId === 'inst')?.acceptable).toBe(true)
  })
  it('prefers the closer length, smoothly', () => {
    const near = scoreKaraoke(want, v('a', 'Blinding Lights (Karaoke)', 'x', 201)).score
    const mid = scoreKaraoke(want, v('b', 'Blinding Lights (Karaoke)', 'x', 230)).score
    const far = scoreKaraoke(want, v('c', 'Blinding Lights (Karaoke)', 'x', 330)).score
    expect(near).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(far)
  })
  it('sinks videos on the avoid list', () => {
    const r = rankKaraoke(want, list, new Set(['sk']))
    expect(r.map((x) => x.videoId)).not.toContain('sk')
    expect(r[0]!.videoId).not.toBe('sk')
  })
  it('does not demand a length when the song length is unknown', () => {
    expect(scoreKaraoke({ ...want, durationMs: 0 }, v('a', 'Blinding Lights (Karaoke Version)', 'Sing King', 999)).acceptable).toBe(true)
  })
})

describe('select', () => {
  const items: KaraokeItem[] = [
    { videoId: 'a', title: 'A', channel: '', durationSec: 200 },
    { videoId: 'b', title: 'B', channel: '', durationSec: 200, guide: true },
    { videoId: 'c', title: 'C', channel: '', durationSec: 200 }
  ]
  const none = new Set<string>()
  it('starts with the remembered choice, then the search order', () => {
    expect(orderItems(items, { bad: none, chosen: 'c' }).map((x) => x.videoId)).toEqual(['c', 'a', 'b'])
    expect(pickFirst(items, { bad: none })?.videoId).toBe('a')
  })
  it('puts bad ones last and never picks them', () => {
    expect(orderItems(items, { bad: new Set(['a']), chosen: 'a' }).map((x) => x.videoId)).toEqual(['b', 'c', 'a'])
    expect(pickFirst(items, { bad: new Set(['a', 'b', 'c']) })).toBeNull()
  })
  it('moves on to the next good one after a failure', () => {
    expect(pickNext(items, { bad: none }, 'a')?.videoId).toBe('b')
    expect(pickNext(items, { bad: new Set(['b']) }, 'a')?.videoId).toBe('c')
    expect(pickNext([items[0]!], { bad: none }, 'a')).toBeNull()
  })
  it('finds the guide / clean counterpart only when the list has both', () => {
    expect(counterpart(items, { bad: none }, 'a')?.videoId).toBe('b')
    expect(counterpart(items, { bad: none }, 'b')?.videoId).toBe('a')
    expect(counterpart([items[0]!, items[2]!], { bad: none }, 'a')).toBeNull()
    expect(counterpart(items, { bad: new Set(['b']) }, 'a')).toBeNull()
  })
  it('keeps the bad list small and de-duplicated', () => {
    expect(addBad(['x', 'y'], 'x')).toEqual(['y', 'x'])
    expect(addBad(['x', 'y', 'z'], 'w', 3)).toEqual(['y', 'z', 'w'])
  })
  it('makes the same song key for tidy and noisy titles', () => {
    expect(songMemoryKey('Blinding Lights (Remastered)', 'The Weeknd')).toBe(songMemoryKey('Blinding  Lights', 'the weeknd'))
  })
})

describe('count-in', () => {
  // first line at 8 s, second right after, a long instrumental break, then a line at 40 s
  const spans: Span[] = [
    { startMs: 8000, endMs: 11000 },
    { startMs: 11500, endMs: 14500 },
    { startMs: 40000, endMs: 43000 }
  ]
  it('counts 3-2-1 down the last three seconds before the first line', () => {
    expect(countInAt(spans, 4000)).toBeNull()
    expect(countInAt(spans, 4999)).toBeNull()
    expect(countInAt(spans, 5100)?.n).toBe(3)
    expect(countInAt(spans, 6100)?.n).toBe(2)
    expect(countInAt(spans, 7100)?.n).toBe(1)
    expect(countInAt(spans, 7999)?.n).toBe(1)
    expect(countInAt(spans, 8000)).toBeNull()
  })
  it('reports how far through the beat it is', () => {
    expect(countInAt(spans, 5000 + 1)!.beat).toBeCloseTo(0, 1)
    expect(countInAt(spans, 5500)!.beat).toBeCloseTo(0.5, 1)
    expect(countInAt(spans, 7900)!.beat).toBeGreaterThan(0.85)
  })
  it('does not count between lines that follow each other closely', () => {
    expect(countInAt(spans, 9000)).toBeNull()
    expect(countInAt(spans, 11200)).toBeNull()
  })
  it('counts again before a line after a long instrumental gap', () => {
    expect(gapBefore(spans, 2)).toBe(25500)
    expect(countInAt(spans, 30000)).toBeNull()
    expect(countInAt(spans, 37500)?.n).toBe(3)
    expect(countInAt(spans, 39500)?.toLine).toBe(2)
  })
  it('skips the count-in for a first line that comes right away', () => {
    expect(countInAt([{ startMs: 2000, endMs: 4000 }], 0)).toBeNull()
  })
  it('stretches the beats at a slower tempo so the count stays 3 real seconds', () => {
    // at 0.75x one beat is 0.75 s of song time
    expect(countInAt(spans, 8000 - 2200, 0.75)?.n).toBe(3)
    expect(countInAt(spans, 8000 - 2300, 0.75)).toBeNull()
  })
  it('handles empty and finished songs', () => {
    expect(countInAt([], 1000)).toBeNull()
    expect(countInAt(spans, 99999)).toBeNull()
  })
  it('finds the active line and breaks', () => {
    const starts = spans.map((s) => s.startMs)
    expect(activeIndex(starts, 0)).toBe(-1)
    expect(activeIndex(starts, 8000)).toBe(0)
    expect(activeIndex(starts, 12000)).toBe(1)
    expect(activeIndex(starts, 50000)).toBe(2)
    expect(inBreak(spans, 9000)).toBe(false)
    expect(inBreak(spans, 20000)).toBe(true)
    expect(inBreak(spans, 44000)).toBe(false)
  })
})

describe('word fills', () => {
  it('fills each word in turn and the last one to the line end', () => {
    expect(wordFills([1000, 2000, 3000], 4000, 500)).toEqual([0, 0, 0])
    expect(wordFills([1000, 2000, 3000], 4000, 1500)).toEqual([0.5, 0, 0])
    expect(wordFills([1000, 2000, 3000], 4000, 3500)).toEqual([1, 1, 0.5])
    expect(wordFills([1000, 2000, 3000], 4000, 9000)).toEqual([1, 1, 1])
  })
})

describe('SmoothClock', () => {
  it('interpolates between reports and freezes when paused', () => {
    const c = new SmoothClock()
    c.setPlaying(true, 0)
    c.report(10, 0)
    expect(c.now(500)).toBeCloseTo(10.5, 3)
    c.setPlaying(false, 1000)
    expect(c.now(5000)).toBeCloseTo(11, 3)
  })
  it('absorbs a small disagreement gradually and snaps on a big one', () => {
    const c = new SmoothClock()
    c.setPlaying(true, 0)
    c.report(10, 0)
    c.report(11.1, 1000) // estimate 11.0, report 11.1: move a part of the way only
    const t = c.now(1000)
    expect(t).toBeGreaterThan(11.0)
    expect(t).toBeLessThan(11.1)
    c.report(30, 1250) // a seek
    expect(c.now(1250)).toBe(30)
  })
  it('runs slower at a lower playback rate', () => {
    const c = new SmoothClock()
    c.setPlaying(true, 0)
    c.report(0, 0)
    c.setRate(0.5, 0)
    expect(c.now(2000)).toBeCloseTo(1, 3)
  })
  it('knows a seek immediately', () => {
    const c = new SmoothClock()
    c.setPlaying(true, 0)
    c.seek(42, 100)
    expect(c.now(100)).toBe(42)
    expect(c.now(1100)).toBeCloseTo(43, 3)
  })
})

describe('usableRates', () => {
  it('offers tempo steps only when the player supports speed changes', () => {
    expect(usableRates(undefined)).toEqual([])
    expect(usableRates([1])).toEqual([])
    expect(usableRates([0.25, 0.5, 0.75, 1, 1.25, 1.5, 2])).toEqual([0.75, 1])
    expect(usableRates([0.75, 0.85, 1])).toEqual([0.75, 0.85, 1])
    expect(usableRates([0.5, 1.5, 2])).toEqual([])
  })
})
