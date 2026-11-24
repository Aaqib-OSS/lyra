import { randomUUID } from 'node:crypto'
import type { SavedMoment } from '@shared/types'
import { addMoment, normalizeMoments } from '@shared/moments'
import { JsonStore } from './jsonStore'

/** The user's personal collection of memorable lines. Stored locally only. */
let store: JsonStore<{ items: SavedMoment[] }> | null = null
const ensure = (): JsonStore<{ items: SavedMoment[] }> => {
  if (!store) {
    store = new JsonStore('moments.json', { items: [] as SavedMoment[] })
    // anything read from disk is validated: a hand-edited or damaged file can never reach the UI as-is
    store.set({ items: normalizeMoments(store.get().items) })
  }
  return store
}

export const moments = {
  list: (): SavedMoment[] => ensure().get().items,
  add(m: Omit<SavedMoment, 'id' | 'savedAt'>): SavedMoment[] {
    const items = ensure().get().items
    const next = addMoment(items, m, randomUUID(), Date.now())
    if (next !== items) ensure().set({ items: next })
    return next
  },
  remove(id: string): SavedMoment[] {
    const next = ensure().get().items.filter((x) => x.id !== id)
    ensure().set({ items: next })
    return next
  },
  flush: (): void => store?.flush()
}
