import type { Track } from '@shared/types'
import { trackKey } from '../songKey'

const NO_KEY = '|'

/** Two copies of a song whose lengths differ by more than this are different versions (live, extended, radio edit). */
export const DURATION_TOLERANCE_MS = 15_000

/**
 * Cache key for a SONG: normalized artist|title (same identity the lyrics and pins use), so the same song from
 * Spotify, Windows media controls or a re-release hits the same entry. Falls back to the player's id when the
 * title/artist normalise to nothing. Duration is not part of the key (players disagree by a few seconds); entries
 * remember it and `sameLength` rejects a version that is clearly different.
 */
export function trackCacheKey(track: Pick<Track, 'id' | 'artists' | 'title'>): string {
  const k = trackKey(track)
  return k === NO_KEY ? `id:${track.id}` : k
}

/** true when a cached entry made for `cachedMs` fits a request for `wantMs` (unknown lengths always fit). */
export function sameLength(cachedMs: number | undefined, wantMs: number | undefined): boolean {
  if (!cachedMs || !wantMs) return true
  return Math.abs(cachedMs - wantMs) <= DURATION_TOLERANCE_MS
}
