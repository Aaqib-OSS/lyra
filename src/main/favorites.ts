import { JsonStore } from './jsonStore'

interface Fav {
  title: string
  artist: string
  at: number
}

/** Most favourites kept; the oldest go first, so the file can never grow without bound. */
const MAX_FAVS = 5000

/** Lyra's own favourites (local only; not synced with Spotify Liked Songs). */
let store: JsonStore<{ items: Record<string, Fav> }> | null = null
const ensure = (): JsonStore<{ items: Record<string, Fav> }> => {
  if (!store) {
    store = new JsonStore('favorites.json', { items: {} as Record<string, Fav> })
    const raw = store.get().items
    // a damaged or hand-edited file: keep only well-formed entries
    const ok = raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.entries(raw).filter(([, v]) => v && typeof v === 'object' && Number.isFinite((v as Fav).at)) : []
    store.set({ items: Object.fromEntries(ok) })
  }
  return store
}

export const favorites = {
  has: (id: string): boolean => id in ensure().get().items,
  set(id: string, liked: boolean, meta: { title: string; artist: string }): void {
    const items = { ...ensure().get().items }
    if (liked) {
      items[id] = { title: String(meta.title).slice(0, 200), artist: String(meta.artist).slice(0, 200), at: Date.now() }
      const ids = Object.keys(items)
      if (ids.length > MAX_FAVS) for (const old of ids.sort((a, b) => items[a]!.at - items[b]!.at).slice(0, ids.length - MAX_FAVS)) delete items[old]
    } else delete items[id]
    ensure().set({ items })
  },
  flush: (): void => store?.flush()
}
