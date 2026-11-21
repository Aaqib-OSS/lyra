import type { Track } from '@shared/types'
import { trackKey } from './songKey'

/**
 * Remembers which song each player track id stands for (the last few hundred seen), so choices that only know an id
 * (the video you picked) can be stored under the song's identity and found again from any player.
 */
const byId = new Map<string, string>()

export function rememberTrack(t: Track): string {
  const key = trackKey(t)
  if (byId.size > 400) byId.delete(byId.keys().next().value as string)
  byId.set(t.id, key)
  return key
}

/** The song key for a track id we have seen, or null. */
export const keyForId = (id: string): string | null => byId.get(id) ?? null
