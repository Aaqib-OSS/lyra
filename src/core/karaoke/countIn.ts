/**
 * Count-in and line timing for the karaoke stage. Pure: positions in, a small description out, so it is unit tested
 * without a player or a DOM and the stage can call it from a requestAnimationFrame loop with refs.
 */

export interface Span {
  startMs: number
  /** when the line stops being sung (not when the next one starts) */
  endMs: number
}

/** 3-2-1 only for a pause this long (silence between one line's end and the next line's start) */
export const MIN_GAP_MS = 5000
/** the first line gets a count-in when it starts at least this late */
export const MIN_INTRO_MS = 3500
/** one number per second */
export const BEAT_MS = 1000
export const COUNT_FROM = 3

export interface CountIn {
  /** the number to show: 3, 2 or 1 */
  n: number
  /** 0..1 through the current beat (for a shrinking ring) */
  beat: number
  /** the line it counts towards */
  toLine: number
}

/** Index of the line being sung at `posMs` (the last one that has started), -1 before the first. */
export function activeIndex(starts: readonly number[], posMs: number): number {
  let lo = 0
  let hi = starts.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (starts[mid]! <= posMs) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

/** Is there a long enough silence before line `i` (after the previous line ended, or after the start for line 0)? */
export function gapBefore(spans: readonly Span[], i: number): number {
  const s = spans[i]
  if (!s) return 0
  return i === 0 ? s.startMs : s.startMs - spans[i - 1]!.endMs
}

/**
 * The count-in to show at `posMs`: before the first line, and before any line that follows a long instrumental gap.
 * Counts down the last COUNT_FROM seconds before that line. null the rest of the time.
 */
export function countInAt(spans: readonly Span[], posMs: number, rate = 1): CountIn | null {
  if (!spans.length) return null
  // the line that comes next
  const next = activeIndex(spans.map((s) => s.startMs), posMs) + 1
  const s = spans[next]
  if (!s) return null
  const gap = gapBefore(spans, next)
  if (gap < (next === 0 ? MIN_INTRO_MS : MIN_GAP_MS)) return null
  // at a slower tempo a second of song lasts longer, so beats are stretched to keep the count in real time
  const beatMs = BEAT_MS * Math.max(0.25, rate)
  const until = s.startMs - posMs
  if (until <= 0 || until > COUNT_FROM * beatMs) return null
  const n = Math.min(COUNT_FROM, Math.ceil(until / beatMs))
  const beat = 1 - (until - (n - 1) * beatMs) / beatMs
  return { n, beat: Math.max(0, Math.min(1, beat)), toLine: next }
}

/** Is `posMs` inside an instrumental break (the line is over, the next one is not near yet)? */
export function inBreak(spans: readonly Span[], posMs: number, margin = 600): boolean {
  const a = activeIndex(spans.map((s) => s.startMs), posMs)
  const cur = spans[a]
  const next = spans[a + 1]
  if (!cur || !next) return false
  return posMs > cur.endMs + margin && next.startMs - cur.endMs > margin
}

/** Fill 0..1 for each word of a line at `posMs`. Word i fills from its start to the start of word i+1 (last: to lineEnd). */
export function wordFills(wordStarts: readonly number[], lineEndMs: number, posMs: number): number[] {
  return wordStarts.map((t, k) => {
    const end = wordStarts[k + 1] ?? lineEndMs
    const span = Math.max(1, end - t)
    return Math.max(0, Math.min(1, (posMs - t) / span))
  })
}
