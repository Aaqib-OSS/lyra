import { addBad, songMemoryKey, type Memory } from '@core/karaoke/select'

/** What karaoke remembers on this device: versions that were bad, the version chosen per song, and whether it is used at all. */
const BAD = 'lyra.karaoke.bad'
const CHOSEN = 'lyra.karaoke.choice'
const USED = 'lyra.karaoke.lastUsed'

const readJson = <T,>(k: string, fallback: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(k) ?? 'null') as T | null) ?? fallback
  } catch {
    return fallback
  }
}
const write = (k: string, v: unknown): void => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* storage full or blocked: forgetting is fine */
  }
}

export function loadMemory(title: string, artist: string): Memory {
  const chosen = readJson<Record<string, string>>(CHOSEN, {})[songMemoryKey(title, artist)] ?? null
  return { bad: new Set(readJson<string[]>(BAD, [])), chosen }
}

export function markBad(videoId: string): void {
  write(BAD, addBad(readJson<string[]>(BAD, []), videoId))
}

export function unmarkBad(videoId: string): void {
  write(BAD, readJson<string[]>(BAD, []).filter((x) => x !== videoId))
}

export function rememberChoice(title: string, artist: string, videoId: string): void {
  const all = readJson<Record<string, string>>(CHOSEN, {})
  const k = songMemoryKey(title, artist)
  delete all[k] // newest last, so the oldest can be dropped
  all[k] = videoId
  const keys = Object.keys(all)
  for (const old of keys.slice(0, Math.max(0, keys.length - 300))) delete all[old]
  write(CHOSEN, all)
}

export function touchUsed(): void {
  write(USED, Date.now())
}

/** karaoke is something this user does: they opened it within the last 30 days (gates the quota-costing pre-fetch) */
export function karaokeInUse(now = Date.now()): boolean {
  return now - readJson<number>(USED, 0) < 30 * 24 * 3600_000
}
