import { describe, expect, it } from 'vitest'
import { parseLrc } from '@shared/lrc'
import { languagePenalty, pickBestLyrics, rankLyrics, scoreLyricsListing, validateSyncedLines, type LyricsOption } from './rank'

const want = { title: 'Tum Hi Ho', artist: 'Arijit Singh', durationMs: 262_000 }
const matched = { title: 'Tum Hi Ho', artist: 'Arijit Singh', durationMs: 261_000 }

/** n evenly spaced "line k" rows from 5s up to `endSec` */
const lrc = (n: number, endSec: number, word = false): string =>
  Array.from({ length: n }, (_, i) => {
    const t = 5 + ((endSec - 5) * i) / Math.max(1, n - 1)
    const mm = String(Math.floor(t / 60)).padStart(2, '0')
    const ss = (t % 60).toFixed(2).padStart(5, '0')
    return `[${mm}:${ss}]${word ? `<${mm}:${ss}>la <${mm}:${ss}>la` : `line ${i + 1}`}`
  }).join('\n')

const opt = (o: Partial<LyricsOption> & { provider: string }): LyricsOption => ({ matched, ...o })

describe('rankLyrics: tiers', () => {
  it('properly synced beats unsynced, whatever the provider order', () => {
    const r = rankLyrics(want, [opt({ provider: 'a', plain: 'words\nwords' }), opt({ provider: 'b', synced: lrc(40, 255) })])
    expect(r.map((x) => x.option.provider)).toEqual(['b', 'a'])
    expect(r[0]!.kind).toBe('line-synced')
  })
  it('word-level beats line-level', () => {
    const r = rankLyrics(want, [opt({ provider: 'line', synced: lrc(40, 255) }), opt({ provider: 'word', synced: lrc(40, 255, true) })])
    expect(r[0]!.option.provider).toBe('word')
    expect(r[0]!.kind).toBe('word-synced')
  })
  it('a better title/duration match wins within a tier', () => {
    const near = opt({ provider: 'near', synced: lrc(40, 255) })
    const far = opt({ provider: 'far', synced: lrc(40, 255), matched: { ...matched, durationMs: 258_000 } })
    expect(rankLyrics(want, [far, near])[0]!.option.provider).toBe('near')
  })
  it('instrumental placeholders rank last', () => {
    const r = rankLyrics(want, [opt({ provider: 'i', instrumental: true }), opt({ provider: 'p', plain: 'hello' })])
    expect(r[0]!.option.provider).toBe('p')
  })
  it('drops candidates with nothing in them', () => {
    expect(rankLyrics(want, [opt({ provider: 'e' })])).toHaveLength(0)
  })
})

describe('rankLyrics: invalid synced is demoted below sane unsynced', () => {
  const cases: Array<[string, Partial<LyricsOption>]> = [
    ['wrong song (title mismatch)', { synced: lrc(40, 255), matched: { title: 'Totally Other Song', artist: 'Someone Else', durationMs: 261_000 } }],
    ['duration off by a minute', { synced: lrc(40, 255), matched: { ...matched, durationMs: 201_000 } }],
    ['timestamps beyond the track end', { synced: lrc(40, 400) }],
    ['only three lines', { synced: lrc(3, 200) }],
    ['instrumental placeholder lines', { synced: '[00:01.00]♪\n[00:30.00]♪\n[01:30.00][Instrumental]\n[02:30.00]♪\n[04:00.00]♪' }],
    ['snippet that stops early', { synced: lrc(10, 40) }],
    ['stamps going backwards', { synced: '[00:10.00]a\n[03:00.00]b\n[00:20.00]c\n[02:50.00]d\n[00:30.00]e\n[02:00.00]f\n[00:40.00]g' }]
  ]
  it.each(cases)('%s', (_name, bad) => {
    const best = pickBestLyrics(want, [opt({ provider: 'bad', ...bad }), opt({ provider: 'plain', plain: 'real words\nreal words' })])!
    expect(best.option.provider).toBe('plain')
    const rej = rankLyrics(want, [opt({ provider: 'bad', ...bad })])[0]!
    expect(rej.kind).toBe('plain')
    expect(rej.rejectedSynced).toBe(true)
    expect(rej.reasons.length).toBeGreaterThan(0)
  })
  it('an invalid synced copy alone is still offered as plain text', () => {
    const best = pickBestLyrics(want, [opt({ provider: 'bad', synced: lrc(40, 400) })])!
    expect(best.kind).toBe('plain')
    expect(best.lines).toHaveLength(0)
  })
  it('a valid synced beats an invalid synced', () => {
    const best = pickBestLyrics(want, [opt({ provider: 'bad', synced: lrc(40, 400), plain: 'x' }), opt({ provider: 'good', synced: lrc(30, 250) })])!
    expect(best.option.provider).toBe('good')
  })
})

describe('validateSyncedLines', () => {
  it('accepts a normal lyric', () => expect(validateSyncedLines(parseLrc(lrc(40, 255)), 262_000, lrc(40, 255))).toEqual([]))
  it('is lenient about short songs', () => expect(validateSyncedLines(parseLrc(lrc(3, 40)), 45_000)).toEqual([]))
  it('rejects identical timestamps', () => {
    const raw = Array.from({ length: 8 }, (_, i) => `[01:00.00]l${i}`).join('\n')
    expect(validateSyncedLines(parseLrc(raw), 262_000, raw)).toContain('every line has the same timestamp')
  })
  it('allows an outro slightly past the end', () => expect(validateSyncedLines(parseLrc(lrc(40, 266)), 262_000)).toEqual([]))
})

describe('languagePenalty', () => {
  it.each([
    ['Latin song, Devanagari lyrics', { title: 'Tum Hi Ho', artist: 'Arijit', durationMs: 1 }, 'तुम ही हो', 0],
    ['Latin song, Latin lyrics', { title: 'Tum Hi Ho', artist: 'Arijit', durationMs: 1 }, 'hello there', 0],
    ['Hindi title, Latin-only lyrics', { title: 'तुम ही हो', artist: 'अरिजीत', durationMs: 1 }, 'hello there', 0.15],
    ['Hindi title, Hindi lyrics', { title: 'तुम ही हो', artist: 'अरिजीत', durationMs: 1 }, 'तुम ही हो', 0],
    ['Korean title, Korean lyrics', { title: '봄날', artist: '방탄소년단', durationMs: 1 }, '보고 싶다', 0]
  ])('%s', (_n, w, text, pen) => expect(languagePenalty(w, text)).toBe(pen))

  it('prefers lyrics in the song language between two otherwise equal candidates', () => {
    const w = { title: '봄날', artist: '방탄소년단', durationMs: 274_000 }
    const m = { title: '봄날', artist: '방탄소년단', durationMs: 274_000 }
    const ko = Array.from({ length: 20 }, (_, i) => `[${String(Math.floor((9 + i * 13) / 60)).padStart(2, '0')}:${String((9 + i * 13) % 60).padStart(2, '0')}.00]보고 싶다 ${i}`).join('\n')
    const en = ko.replace(/보고 싶다/g, 'miss you')
    expect(pickBestLyrics(w, [{ provider: 'en', synced: en, matched: m }, { provider: 'ko', synced: ko, matched: m }])!.option.provider).toBe('ko')
  })
})

describe('scoreLyricsListing (picker rows)', () => {
  const row = (id: string, o: Partial<{ title: string; artist: string; durationMs: number; synced: boolean; instrumental: boolean }>) => ({
    id, title: 'Tum Hi Ho', artist: 'Arijit Singh', album: '', durationMs: 261_000, synced: true, instrumental: false, ...o
  })
  it('orders: exact synced, exact plain, wrong-song synced, instrumental', () => {
    const rows = [
      row('instr', { instrumental: true, synced: false }),
      row('wrong', { title: 'Tum Hi Ho (Cover)', artist: 'Random Guy', durationMs: 200_000 }),
      row('plain', { synced: false }),
      row('exact', {})
    ]
    const sorted = [...rows].sort((a, b) => scoreLyricsListing(want, b) - scoreLyricsListing(want, a)).map((r) => r.id)
    expect(sorted).toEqual(['exact', 'plain', 'wrong', 'instr'])
  })
})
