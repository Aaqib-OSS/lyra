/**
 * Remembers which videos did not play for a song, so the same problem never repeats: the next time the song comes on,
 * the video that was blocked / never started is skipped straight away (and the next best one is used).
 * Stored per song identity (not per player id) so it follows the song across players. Entries expire after 14 days.
 */
const KEY = 'lyra.videoFails.v1'
const TTL = 14 * 24 * 3600_000
type Book = Record<string, { at: number; ids: string[] }>

const read = (): Book => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Book
  } catch {
    return {}
  }
}

export function failedVideos(songKey: string): Set<string> {
  const e = read()[songKey]
  return e && Date.now() - e.at < TTL ? new Set(e.ids) : new Set()
}

export function rememberFailure(songKey: string, videoId: string): void {
  try {
    const book = read()
    const now = Date.now()
    for (const k of Object.keys(book)) if (now - book[k]!.at > TTL) delete book[k]
    const ids = new Set(book[songKey]?.ids ?? [])
    ids.add(videoId)
    book[songKey] = { at: now, ids: [...ids].slice(-6) }
    const keys = Object.keys(book)
    if (keys.length > 300) for (const k of keys.sort((a, b) => book[a]!.at - book[b]!.at).slice(0, keys.length - 300)) delete book[k]
    localStorage.setItem(KEY, JSON.stringify(book))
  } catch {
    /* storage can be unavailable: then failures are simply not remembered */
  }
}
