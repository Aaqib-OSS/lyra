import type { LyricLine } from '@shared/types'

/** Pure helpers for the lyrics list. Kept free of React and the DOM so they can be tested. */

/** Per-song nudge limits (ms). */
export const OFFSET_MAX_MS = 10_000

export function clampOffset(ms: number): number {
  if (!Number.isFinite(ms)) return 0
  return Math.max(-OFFSET_MAX_MS, Math.min(OFFSET_MAX_MS, Math.round(ms)))
}

/** "sync", "+0.25s", "-1.50s": what the offset readout shows. */
export function describeOffset(ms: number): string {
  if (ms === 0) return 'sync'
  return `${ms > 0 ? '+' : '-'}${(Math.abs(ms) / 1000).toFixed(2)}s`
}

/** Toast text after a nudge. Positive delta = lyrics appear earlier. */
export function nudgeMessage(delta: number, total: number): string {
  const how = delta > 0 ? 'earlier' : 'later'
  return `Lyrics ${(Math.abs(delta) / 1000).toFixed(2)}s ${how} (${describeOffset(total)})`
}

/** Rows further than this from the current line look identical, so they keep the same props and are not re-rendered. */
export const DIST_LIMIT = 7
export function windowedDist(dist: number): number {
  return Math.max(-DIST_LIMIT, Math.min(DIST_LIMIT, dist))
}

/** scrollTop that puts the middle of a row at `anchor` (0..1) of the box height. Never negative. */
export function scrollTarget(rowTop: number, rowHeight: number, boxHeight: number, anchor: number): number {
  return Math.max(0, rowTop - boxHeight * anchor + rowHeight / 2)
}

/**
 * Glide to nearby lines, jump to far ones (a seek across the song would otherwise be one long, sluggish smooth scroll).
 * Reduced motion always jumps.
 */
export function scrollMode(currentTop: number, targetTop: number, boxHeight: number, reduced: boolean): 'auto' | 'smooth' {
  if (reduced) return 'auto'
  return Math.abs(targetTop - currentTop) > boxHeight * 2 ? 'auto' : 'smooth'
}

const RTL = /[֐-ࣿיִ-﷿ﹰ-ﻼ]/
const LTR = /[A-Za-zÀ-ʸͰ-֏ऀ-῿぀-鿿가-힯]/

/** Direction of a line from its first strong letter (the browser's `dir=auto` rule), so the markup can set it explicitly. */
export function textDirection(text: string): 'ltr' | 'rtl' {
  for (const ch of text) {
    if (RTL.test(ch)) return 'rtl'
    if (LTR.test(ch)) return 'ltr'
  }
  return 'ltr'
}

/** The whole lyric as plain text: one line per row, breaks as blank lines. For copy and for screen readers. */
export function linesToText(lines: readonly LyricLine[]): string {
  const out: string[] = []
  for (const l of lines) {
    if (l.text === '') {
      if (out.length > 0 && out[out.length - 1] !== '') out.push('')
    } else out.push(l.text)
  }
  while (out.length > 0 && out[out.length - 1] === '') out.pop()
  return out.join('\n')
}
