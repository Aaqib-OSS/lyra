/**
 * Picking the karaoke version to play, from the ranked list the background search returned. Pure.
 * The search ranks by title / channel / length; this adds what only the user's own history knows:
 * the version they chose last time for this song, and versions that turned out bad (will not embed, wrong song).
 */

export interface KaraokeItem {
  videoId: string
  title: string
  channel: string
  durationSec: number | null
  /** keeps a quiet lead vocal to follow */
  guide?: boolean
}

export interface Memory {
  /** video ids that were marked bad */
  bad: ReadonlySet<string>
  /** the version the user picked last time for this song */
  chosen?: string | null
}

/** Order: the remembered choice first (unless bad), then the search order, bad ones last. Stable. */
export function orderItems<T extends KaraokeItem>(items: readonly T[], mem: Memory): T[] {
  const rank = (v: T): number => (mem.bad.has(v.videoId) ? 2 : v.videoId === mem.chosen ? 0 : 1)
  return items.map((v, i) => ({ v, i })).sort((a, b) => rank(a.v) - rank(b.v) || a.i - b.i).map((x) => x.v)
}

/** The version to start with: first that is not bad. null when every candidate is bad (or the list is empty). */
export function pickFirst<T extends KaraokeItem>(items: readonly T[], mem: Memory): T | null {
  return orderItems(items, mem).find((v) => !mem.bad.has(v.videoId)) ?? null
}

/** The next version to try after `failed` (e.g. it would not embed): the next good one in the order. */
export function pickNext<T extends KaraokeItem>(items: readonly T[], mem: Memory, failed: string): T | null {
  const bad = new Set(mem.bad)
  bad.add(failed)
  return pickFirst(items, { bad, chosen: null })
}

/**
 * The same song with or without the lead vocal: when the list has a guide version and a clean one, returns the
 * counterpart of `current` (the best one of the other kind). null when the list has no such pair.
 */
export function counterpart<T extends KaraokeItem>(items: readonly T[], mem: Memory, current: string): T | null {
  const cur = items.find((v) => v.videoId === current)
  if (!cur) return null
  const other = items.filter((v) => !!v.guide !== !!cur.guide && !mem.bad.has(v.videoId))
  return other[0] ?? null
}

/** Remember a bad id: newest last, capped so the stored list stays small. */
export function addBad(list: readonly string[], id: string, cap = 200): string[] {
  const next = list.filter((x) => x !== id)
  next.push(id)
  return next.slice(-cap)
}

/** Song identity for the memory of what was chosen (artist|title, lower case, no punctuation). */
export function songMemoryKey(title: string, artist: string): string {
  const n = (s: string): string => s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  return `${n(artist)}|${n(title)}`
}
