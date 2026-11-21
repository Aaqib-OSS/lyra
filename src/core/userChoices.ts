import type { SongChoice, SongChoiceField } from '@shared/types'
import { platform, type Store } from './platform'

/**
 * What the user picked by hand for a song (the video, the lyrics match, a timing nudge), remembered per SONG
 * (songKey identity, so it follows the song across players and re-releases) and used instead of automatic ranking.
 * Tiny API on purpose: getChoice / setChoice / clearChoice. Persistent, versioned, size-capped.
 */

export const CHOICES_VERSION = 1
export const MAX_CHOICES = 2000
export const MAX_OFFSET_MS = 10_000

export interface ChoicesFile {
  v: number
  songs: Record<string, SongChoice>
}

const EMPTY = (): ChoicesFile => ({ v: CHOICES_VERSION, songs: {} })

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

/** Keep only well-formed fields of one stored entry (the file may be hand-edited or from a newer build). */
export function sanitize(raw: unknown): SongChoice | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const out: SongChoice = { at: typeof r.at === 'number' && Number.isFinite(r.at) ? r.at : 0 }
  const v = r.video as { videoId?: unknown } | undefined
  if (v && typeof v.videoId === 'string' && VIDEO_ID.test(v.videoId)) out.video = { videoId: v.videoId }
  const l = r.lyrics as { provider?: unknown; id?: unknown } | undefined
  if (l && typeof l.provider === 'string' && typeof l.id === 'string' && l.provider && l.id && l.provider.length < 40 && l.id.length < 200) out.lyrics = { provider: l.provider, id: l.id }
  if (typeof r.offsetMs === 'number' && Number.isFinite(r.offsetMs) && r.offsetMs !== 0) out.offsetMs = clampOffset(r.offsetMs)
  if (typeof r.durationMs === 'number' && Number.isFinite(r.durationMs) && r.durationMs > 0) out.durationMs = Math.round(r.durationMs)
  return out.video || out.lyrics || out.offsetMs !== undefined ? out : null
}

const clampOffset = (ms: number): number => Math.max(-MAX_OFFSET_MS, Math.min(MAX_OFFSET_MS, Math.round(ms)))

export class UserChoices {
  constructor(
    private readonly store: () => Store<ChoicesFile>,
    private readonly now: () => number = Date.now
  ) {}

  private songs(): Record<string, SongChoice> {
    const f = this.store().get()
    // an unknown (newer) schema is left alone rather than misread: behave as empty and never overwrite it
    return f && f.v === CHOICES_VERSION && f.songs && typeof f.songs === 'object' ? f.songs : {}
  }

  private writable(): boolean {
    const f = this.store().get()
    return !!f && f.v === CHOICES_VERSION
  }

  getChoice(key: string): SongChoice | null {
    if (!key) return null
    const c = this.songs()[key]
    return c ? sanitize(c) : null
  }

  /** Merge the given fields into the song's entry. A field set to null is removed. */
  setChoice(key: string, patch: Partial<Record<SongChoiceField, unknown>> & { durationMs?: number }): SongChoice | null {
    if (!key || !this.writable()) return null
    const songs = { ...this.songs() }
    const cur: Record<string, unknown> = { ...(songs[key] ?? {}) }
    for (const f of ['video', 'lyrics', 'offsetMs'] as const) {
      if (!(f in patch)) continue
      if (patch[f] === null || patch[f] === undefined || patch[f] === 0) delete cur[f]
      else cur[f] = patch[f]
    }
    if (patch.durationMs) cur.durationMs = patch.durationMs
    cur.at = this.now()
    const clean = sanitize(cur)
    if (clean) songs[key] = clean
    else delete songs[key]
    this.commit(songs)
    return clean
  }

  /** Back to automatic: forget one field, or the whole entry when no field is given. */
  clearChoice(key: string, field?: SongChoiceField): void {
    if (!key || !this.writable()) return
    const songs = { ...this.songs() }
    if (!songs[key]) return
    if (field) return void this.setChoice(key, { [field]: null })
    delete songs[key]
    this.commit(songs)
  }

  private commit(songs: Record<string, SongChoice>): void {
    const keys = Object.keys(songs)
    if (keys.length > MAX_CHOICES) {
      // size cap: drop the least recently touched
      for (const k of keys.sort((a, b) => (songs[a]!.at ?? 0) - (songs[b]!.at ?? 0)).slice(0, keys.length - MAX_CHOICES)) delete songs[k]
    }
    this.store().set({ v: CHOICES_VERSION, songs })
  }
}

let shared: UserChoices | null = null
/** The app-wide instance, backed by the host's persistent store (atomic writes by the host). */
export function userChoices(): UserChoices {
  return (shared ??= new UserChoices(
    (() => {
      let s: Store<ChoicesFile> | null = null
      let host: unknown = null
      return () => {
        const p = platform()
        if (!s || host !== p) {
          host = p
          s = p.store<ChoicesFile>('user-choices.json', EMPTY())
        }
        return s
      }
    })()
  ))
}
