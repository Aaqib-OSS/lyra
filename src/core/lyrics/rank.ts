import { parseLrc, stripLrc } from '@shared/lrc'
import type { LyricLine } from '@shared/types'
import { isAcceptable, scoreCandidate, type Wanted } from './match'
import type { LyricsCandidate, Matched } from './provider'

/**
 * Pure ranking of lyrics candidates from all providers (no Electron / network).
 *
 * Tiers dominate, then closeness of the match breaks ties:
 *   word-synced > line-synced >> unsynced >> instrumental placeholder.
 * A synced candidate only holds its tier when it passes validation (right song, plausible length, sane timestamps);
 * otherwise it is demoted to the unsynced tier, so properly synced lyrics always beat unsynced and unsynced only wins
 * when no synced candidate is trustworthy.
 */

export type LyricsKind = 'word-synced' | 'line-synced' | 'plain' | 'instrumental'

const TIER: Record<LyricsKind, number> = { 'word-synced': 3.2, 'line-synced': 3, plain: 1, instrumental: 0.2 }

/** how far past the track's end a timestamp may sit (outros, rounding, slightly different edits) */
export const TIMESTAMP_SLACK_MS = 8000
export const MIN_SYNCED_LINES = 4

/** One thing a provider returned for the song (a `ProviderResult` of kind 'found' plus where it came from). */
export interface LyricsOption {
  provider: string
  id?: string
  synced?: string
  plain?: string
  instrumental?: boolean
  matched?: Matched
}

export interface ScoredLyrics<T extends LyricsOption = LyricsOption> {
  option: T
  /** the tier the candidate actually earns after validation */
  kind: LyricsKind
  /** parsed lines when the candidate is validly synced */
  lines: LyricLine[]
  score: number
  /** synced text exists but failed validation (reasons say why) */
  rejectedSynced: boolean
  reasons: string[]
}

const PLACEHOLDER = /^[\s♪♫♬🎵🎶.\-–—_*~[\]()]*(?:instrumental|music|intro|outro|no lyrics|lyrics not available|\.{3}|…)?[\s♪♫♬🎵🎶.\-–—_*~[\]()]*$/i

/** Problems that make a parsed synced lyric untrustworthy. Empty = fine. */
export function validateSyncedLines(lines: readonly LyricLine[], durationMs: number, raw?: string): string[] {
  const problems: string[] = []
  const real = lines.filter((l) => !PLACEHOLDER.test(l.text))
  if (lines.length === 0) return ['no lines']
  if (real.length === 0) problems.push('only placeholder lines (instrumental)')
  else if (real.length < MIN_SYNCED_LINES && (durationMs <= 0 || durationMs >= 90_000)) problems.push(`only ${real.length} lyric lines`)
  if (durationMs > 0) {
    const last = lines[lines.length - 1]!.timeMs
    if (last > durationMs + TIMESTAMP_SLACK_MS) problems.push('timestamps run past the end of the track')
    // a lyric that stops in the first third of a long song is a snippet, not the song
    else if (durationMs >= 90_000 && last < durationMs * 0.33) problems.push('lyrics end far too early')
  }
  if (raw) {
    // parseLrc sorts, so check the order in the source: stamps going backwards mean a broken or merged file
    let prev = -1
    let backwards = 0
    for (const m of raw.split(/\r?\n/)) {
      const s = /^\s*\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/.exec(m)
      if (!s) continue
      const t = (Number(s[1]) * 60 + Number(s[2])) * 1000
      if (prev >= 0 && t + 1000 < prev) backwards++
      prev = t
    }
    if (backwards > 1) problems.push('timestamps are not in order')
  }
  const distinct = new Set(lines.map((l) => l.timeMs)).size
  if (lines.length >= MIN_SYNCED_LINES && distinct <= 1) problems.push('every line has the same timestamp')
  return problems
}

function scriptOf(s: string): 'latin' | 'other' | 'none' {
  let latin = 0
  let other = 0
  for (const ch of s) {
    if (/\p{Script=Latin}/u.test(ch)) latin++
    else if (/\p{L}/u.test(ch)) other++
  }
  if (latin + other === 0) return 'none'
  return other > latin ? 'other' : 'latin'
}

/** A song named in a non-Latin script with Latin-only lyrics is usually a translation or the wrong song. */
export function languagePenalty(want: Wanted, text: string): number {
  const wantScript = scriptOf(`${want.title} ${want.artist}`)
  if (wantScript !== 'other') return 0
  return scriptOf(text) === 'latin' ? 0.15 : 0
}

function matchedOf(want: Wanted, o: LyricsOption): { score: number; ok: boolean } {
  if (!o.matched) return { score: 0.6, ok: true } // user-supplied / unknown source: no evidence against it
  const c = { ...o.matched, synced: !!o.synced }
  return { score: scoreCandidate(want, c), ok: isAcceptable(want, c) }
}

export function scoreLyricsOption<T extends LyricsOption>(want: Wanted, o: T): ScoredLyrics<T> {
  const reasons: string[] = []
  const m = matchedOf(want, o)
  const durationMs = want.durationMs > 0 ? want.durationMs : (o.matched?.durationMs ?? 0)
  if (!m.ok) reasons.push('title/artist/duration do not match the track')

  if (o.instrumental) return { option: o, kind: 'instrumental', lines: [], score: TIER.instrumental + (m.ok ? m.score * 0.5 : 0), rejectedSynced: false, reasons }

  let lines: LyricLine[] = []
  let rejectedSynced = false
  let kind: LyricsKind = 'plain'
  if (o.synced) {
    lines = parseLrc(o.synced)
    const problems = lines.length === 0 ? [] : validateSyncedLines(lines, durationMs, o.synced)
    if (lines.length > 0 && problems.length === 0 && m.ok) kind = lines.some((l) => l.words && l.words.length > 1) ? 'word-synced' : 'line-synced'
    else if (lines.length > 0) {
      rejectedSynced = true
      reasons.push(...problems)
      lines = []
    }
  }
  const text = o.plain ?? (o.synced ? stripLrc(o.synced) : '')
  if (kind === 'plain' && !text.trim()) return { option: o, kind: 'plain', lines: [], score: -1, rejectedSynced, reasons: [...reasons, 'empty'] }

  let score = TIER[kind] + m.score
  if (!m.ok) score -= 0.6
  if (rejectedSynced) score -= 0.3 // a broken synced copy is a worse text source than a clean unsynced one
  score -= languagePenalty(want, kind === 'plain' ? text : lines.map((l) => l.text).join(' '))
  return { option: o, kind, lines, score, rejectedSynced, reasons }
}

/** Best first. Candidates with nothing usable (empty) are dropped. */
export function rankLyrics<T extends LyricsOption>(want: Wanted, options: readonly T[]): Array<ScoredLyrics<T>> {
  return options
    .map((o) => scoreLyricsOption(want, o))
    .filter((s) => s.score >= 0)
    .sort((a, b) => b.score - a.score)
}

export function pickBestLyrics<T extends LyricsOption>(want: Wanted, options: readonly T[]): ScoredLyrics<T> | null {
  return rankLyrics(want, options)[0] ?? null
}

/** Ranks picker rows (metadata only, before lyrics text is fetched): right song and length first, synced before unsynced. */
export function scoreLyricsListing(want: Wanted, c: LyricsCandidate): number {
  const m = { title: c.title, artist: c.artist, durationMs: c.durationMs, synced: c.synced }
  let s = scoreCandidate(want, m)
  const ok = isAcceptable(want, m)
  if (!ok) s -= 0.6
  if (c.instrumental) return s - 2
  return s + (c.synced && ok ? 3 : c.synced ? 0.3 : 0)
}

export type ListingWhy = 'synced' | 'plain' | 'instrumental' | 'length-match' | 'length-off' | 'right-song' | 'other-song'

/**
 * Picker rows with a "Why this lyrics?" explanation: best-first (same order as [scoreLyricsListing]), the top one
 * flagged `best` only when it is a trustworthy match for the right song, and plain reason codes for each row.
 */
export function rankListings<T extends LyricsCandidate>(want: Wanted, items: readonly T[]): Array<T & { best: boolean; why: ListingWhy[] }> {
  const rows = items
    .map((c) => {
      const m = { title: c.title, artist: c.artist, durationMs: c.durationMs, synced: c.synced }
      const ok = isAcceptable(want, m)
      const why: ListingWhy[] = [ok ? 'right-song' : 'other-song']
      if (c.instrumental) why.push('instrumental')
      else why.push(c.synced ? 'synced' : 'plain')
      if (want.durationMs > 0 && c.durationMs > 0) why.push(Math.abs(c.durationMs - want.durationMs) <= 3000 ? 'length-match' : 'length-off')
      return { c, ok, s: scoreLyricsListing(want, c), why }
    })
    .sort((a, b) => b.s - a.s)
  return rows.map((r, i) => ({ ...r.c, best: i === 0 && r.ok && !r.c.instrumental, why: r.why }))
}
