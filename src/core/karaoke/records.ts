/**
 * Karaoke high scores and small per-song maps, kept on this device only. Pure (plain objects in, plain objects out) so
 * the size limits and the "new best" decision are unit tested; the renderer wrapper only reads and writes localStorage.
 */
export interface SongRecord {
  /** best total, 0..10000 */
  best: number
  /** stars of the best take */
  stars: number
  /** finished scored takes */
  plays: number
  /** when the last take finished (ms since epoch) */
  lastAt: number
  /** totals of the latest takes, newest last */
  recent: number[]
}
export type Records = Record<string, SongRecord>

export const MAX_SONGS = 200
export const MAX_RECENT = 8

export interface AddResult {
  records: Records
  newBest: boolean
  previousBest: number
}

/** Adds one finished take. Never mutates its input. */
export function addTake(records: Records, songId: string, total: number, stars: number, now: number): AddResult {
  const prev = records[songId]
  const previousBest = prev?.best ?? 0
  const newBest = total > previousBest
  const next: SongRecord = {
    best: Math.max(previousBest, total),
    stars: newBest ? stars : (prev?.stars ?? stars),
    plays: (prev?.plays ?? 0) + 1,
    lastAt: now,
    recent: [...(prev?.recent ?? []), total].slice(-MAX_RECENT)
  }
  return { records: capRecords({ ...records, [songId]: next }), newBest, previousBest }
}

/** Keeps the most recently played songs. */
export function capRecords(records: Records, max = MAX_SONGS): Records {
  const ids = Object.keys(records)
  if (ids.length <= max) return records
  const keep = ids.sort((a, b) => records[b]!.lastAt - records[a]!.lastAt).slice(0, max)
  const out: Records = {}
  for (const id of keep) out[id] = records[id]!
  return out
}

/** Old versions stored only `songId -> best`: carry those over without overwriting anything newer. */
export function migrateBest(old: Record<string, number>, records: Records): Records {
  const out = { ...records }
  for (const [id, best] of Object.entries(old)) {
    if (out[id] || typeof best !== 'number' || !Number.isFinite(best) || best <= 0) continue
    out[id] = { best: Math.min(10000, Math.round(best)), stars: 0, plays: 1, lastAt: 0, recent: [Math.round(best)] }
  }
  return capRecords(out)
}

/** Drops anything that is not a well-formed record (a hand-edited or damaged store must not break the screen). */
export function sanitizeRecords(raw: unknown): Records {
  const out: Records = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const r = v as Partial<SongRecord> | null
    if (!r || typeof r.best !== 'number' || !Number.isFinite(r.best)) continue
    out[id] = {
      best: Math.max(0, Math.min(10000, Math.round(r.best))),
      stars: Math.max(0, Math.min(5, Math.round(Number(r.stars) || 0))),
      plays: Math.max(0, Math.round(Number(r.plays) || 0)),
      lastAt: Number(r.lastAt) || 0,
      recent: Array.isArray(r.recent) ? r.recent.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)).slice(-MAX_RECENT) : []
    }
  }
  return capRecords(out)
}

/** A small id -> value map (timing nudges) that may not grow without limit: the oldest entries go first. */
export function setCapped<T>(map: Record<string, T>, id: string, value: T, max = 300): Record<string, T> {
  const next = { ...map }
  delete next[id] // newest last
  next[id] = value
  const keys = Object.keys(next)
  for (const old of keys.slice(0, Math.max(0, keys.length - max))) delete next[old]
  return next
}
