import { create } from 'zustand'
import { usePlayer } from './player'
import { useSettings } from './settings'
import { useUi } from './ui'
import { useLyrics } from './lyrics'
import { clampOffset, describeOffset, nudgeMessage } from '@/lib/lyricsView'

const KEY = 'lyra.lyricOffsets'
const MAX_ENTRIES = 500
export const OFFSET_STEP_MS = 250

function load(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown
    return raw && typeof raw === 'object' ? (raw as Record<string, number>) : {}
  } catch {
    return {}
  }
}

interface OffsetStore {
  /** Per-song nudges, on top of the global default offset from Settings. */
  map: Record<string, number>
  /** `remember: false` skips the user-choices write (used when restoring from it). */
  set(trackId: string, ms: number, remember?: boolean): void
}

export const useOffsets = create<OffsetStore>((set, get) => ({
  map: load(),
  set(trackId, ms, remember = true) {
    const clamped = clampOffset(ms)
    const next = { ...get().map }
    if (clamped === 0) delete next[trackId]
    else next[trackId] = clamped
    // keep the file bounded: drop the oldest entries
    const keys = Object.keys(next)
    if (keys.length > MAX_ENTRIES) for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete next[k]
    set({ map: next })
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* storage full / disabled: offset still applies for this session */
    }
    // also remember it per song in the user-choices store (survives a cleared browser store, shared across players)
    const track = usePlayer.getState().snapshot?.track
    if (remember && track && track.id === trackId) void window.lyra?.choices?.setOffset(track, clamped).catch(() => {})
  }
}))

/** Per-song offset only (what the footer −/+ buttons edit). */
export function useSongOffset(): number {
  const id = usePlayer((s) => s.snapshot?.track?.id)
  return useOffsets((s) => (id ? (s.map[id] ?? 0) : 0))
}

/** Total offset applied to lyric timing: global default + this song's nudge. */
export function useLyricOffset(): number {
  const global = useSettings((s) => s.settings.lyricOffsetMs)
  return global + useSongOffset()
}

export function nudgeSongOffset(delta: number): void {
  const id = usePlayer.getState().snapshot?.track?.id
  if (!id) return
  const ls = useLyrics.getState().state
  if (ls.phase !== 'ready' || ls.result.status !== 'synced') {
    useUi.getState().toast('Only timed lyrics can be shifted')
    return
  }
  const store = useOffsets.getState()
  const before = store.map[id] ?? 0
  store.set(id, before + delta) // also syncs into the user-choices store (clamped there)
  const after = useOffsets.getState().map[id] ?? 0
  // one live toast at a time: repeated presses update it instead of stacking
  useUi.setState((u) => ({ toasts: u.toasts.filter((t) => !t.message.startsWith('Lyrics ')) }))
  useUi.getState().toast(after === before ? `Lyrics can't move further (${describeOffset(after)})` : nudgeMessage(after - before, after))
}

/** Back to the song's own timing (the footer readout resets on click). */
export function resetSongOffset(): void {
  const id = usePlayer.getState().snapshot?.track?.id
  if (id) useOffsets.getState().set(id, 0)
}

// when a song starts and we hold no nudge for it locally, restore the remembered one
let lastHydrated: string | undefined
usePlayer.subscribe((s) => {
  const track = s.snapshot?.track
  if (!track || track.id === lastHydrated) return
  lastHydrated = track.id
  if (useOffsets.getState().map[track.id] !== undefined) return
  void window.lyra?.choices
    ?.get(track)
    .then((c) => {
      if (c?.offsetMs && usePlayer.getState().snapshot?.track?.id === track.id && useOffsets.getState().map[track.id] === undefined) useOffsets.getState().set(track.id, c.offsetMs, false)
    })
    .catch(() => {})
})
