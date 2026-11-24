import { addTake, migrateBest, sanitizeRecords, setCapped, type AddResult, type Records } from '@core/karaoke/records'

/**
 * What karaoke keeps on this device (localStorage, nothing is uploaded): high scores per song, the lyric timing nudge
 * per song, and (memory.ts) bad / chosen backing versions. `forgetKaraokeData` removes all of it.
 */
const RECORDS = 'lyra.karaoke.records'
const OLD_BEST = 'lyra.karaoke.best'
const OFFSETS = 'lyra.karaoke.offsets'
const ALL_KEYS = [RECORDS, OLD_BEST, OFFSETS, 'lyra.karaoke.bad', 'lyra.karaoke.choice', 'lyra.karaoke.lastUsed']

const readJson = (k: string): unknown => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? 'null')
  } catch {
    return null
  }
}
const write = (k: string, v: unknown): void => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* storage full or blocked: a lost score is better than a broken screen */
  }
}

export function loadRecords(): Records {
  const recs = sanitizeRecords(readJson(RECORDS))
  const old = readJson(OLD_BEST)
  if (old && typeof old === 'object') {
    const merged = migrateBest(old as Record<string, number>, recs)
    write(RECORDS, merged)
    try {
      localStorage.removeItem(OLD_BEST)
    } catch {
      /* ignore */
    }
    return merged
  }
  return recs
}

export function saveTake(songId: string, total: number, stars: number): AddResult {
  const r = addTake(loadRecords(), songId, total, stars, Date.now())
  write(RECORDS, r.records)
  return r
}

export function loadOffset(songId: string): number {
  const v = (readJson(OFFSETS) as Record<string, number> | null)?.[songId]
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

export function saveOffset(songId: string, ms: number): void {
  const all = (readJson(OFFSETS) as Record<string, number> | null) ?? {}
  write(OFFSETS, setCapped(all, songId, ms))
}

export function forgetKaraokeData(): void {
  for (const k of ALL_KEYS) {
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  }
}
