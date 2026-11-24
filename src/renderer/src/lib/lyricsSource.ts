import type { LyricsResult, Track } from '@shared/types'
import { isAcceptable } from '@core/lyrics/match'

/** Where lyrics came from, in words the user knows (never the internal provider id). */
export function providerLabel(id: string): string {
  switch (id) {
    case 'lrclib':
      return 'LRCLIB'
    case 'public-domain':
      return 'Public-domain lyrics'
    case 'demo':
      return 'Demo'
    case 'you':
      return 'Your lyrics'
    default:
      return id
  }
}

/**
 * True when the lyrics were matched automatically to an entry that does not look like the playing song (different
 * title or length). The service already rejects such matches when it can; this is the visible safety net for the
 * ones that slip through, so the footer can nudge toward "Wrong lyrics?". Matches the user chose or pasted never warn.
 */
export function matchLooksOff(track: Pick<Track, 'title' | 'artists' | 'durationMs'> | null, result: LyricsResult): boolean {
  if (!track || !result.matched || result.pinned || result.imported) return false
  const want = { title: track.title, artist: track.artists[0] ?? '', durationMs: track.durationMs }
  return !isAcceptable(want, { ...result.matched, synced: result.status === 'synced' })
}
