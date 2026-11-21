import type { YoutubeVideo } from '@shared/types'
import { platform, type Store } from '../platform'

/**
 * Videos that did not play for a song (embedding blocked, never started), remembered per SONG identity so the same
 * problem never happens twice: the resolver skips them and uses the next good one. Persistent, size- and age-capped.
 * (The renderer keeps its own copy in lib/failMemory.ts to reorder instantly; it reports each failure here too.)
 */

export const FAILS_VERSION = 1
const TTL = 60 * 24 * 3600_000
const MAX_IDS = 8
const MAX_SONGS = 500
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

export interface FailBook {
  v: number
  songs: Record<string, { at: number; ids: string[] }>
}

const EMPTY = (): FailBook => ({ v: FAILS_VERSION, songs: {} })

export class FailedVideos {
  constructor(
    private readonly store: () => Store<FailBook>,
    private readonly now: () => number = Date.now
  ) {}

  private book(): FailBook | null {
    const f = this.store().get()
    return f && f.v === FAILS_VERSION && f.songs && typeof f.songs === 'object' ? f : null
  }

  failed(songKey: string): Set<string> {
    const e = this.book()?.songs[songKey]
    return e && Array.isArray(e.ids) && this.now() - e.at < TTL ? new Set(e.ids.filter((i) => VIDEO_ID.test(i))) : new Set()
  }

  remember(songKey: string, videoId: string): void {
    const b = this.book()
    if (!songKey || !VIDEO_ID.test(videoId) || !b) return
    const now = this.now()
    const songs = { ...b.songs }
    for (const k of Object.keys(songs)) if (now - songs[k]!.at > TTL) delete songs[k]
    const ids = new Set(this.failed(songKey))
    ids.add(videoId)
    songs[songKey] = { at: now, ids: [...ids].slice(-MAX_IDS) }
    const keys = Object.keys(songs)
    if (keys.length > MAX_SONGS) for (const k of keys.sort((a, c) => songs[a]!.at - songs[c]!.at).slice(0, keys.length - MAX_SONGS)) delete songs[k]
    this.store().set({ v: FAILS_VERSION, songs })
  }

  /** The user picked this video by hand (or reset the song): it deserves another chance. */
  forget(songKey: string, videoId?: string): void {
    const b = this.book()
    if (!b || !b.songs[songKey]) return
    const songs = { ...b.songs }
    const ids = videoId ? songs[songKey]!.ids.filter((i) => i !== videoId) : []
    if (ids.length) songs[songKey] = { at: songs[songKey]!.at, ids }
    else delete songs[songKey]
    this.store().set({ v: FAILS_VERSION, songs })
  }
}

let shared: FailedVideos | null = null
/** The app-wide instance, backed by the host's persistent store. */
export function failedVideos(): FailedVideos {
  return (shared ??= new FailedVideos(
    (() => {
      let s: Store<FailBook> | null = null
      let host: unknown = null
      return () => {
        const p = platform()
        if (!s || host !== p) {
          host = p
          s = p.store<FailBook>('video-fails.json', EMPTY())
        }
        return s
      }
    })()
  ))
}

/**
 * The video to auto-play given what failed before: the ranked pick when it is fine, otherwise the next trustworthy one
 * (flagged acceptable by the ranker; for older cache entries without the flag, one of about the right length).
 */
export function avoidFailed(auto: YoutubeVideo | null, list: readonly YoutubeVideo[], failed: ReadonlySet<string>, wantSec: number): YoutubeVideo | null {
  if (!auto) return null
  if (!failed.has(auto.videoId)) return auto
  const ok = (v: YoutubeVideo): boolean => (v.acceptable !== undefined ? v.acceptable : !v.durationSec || !wantSec || Math.abs(v.durationSec - wantSec) <= 25)
  return list.find((v) => v.videoId !== auto.videoId && !failed.has(v.videoId) && ok(v)) ?? null
}
