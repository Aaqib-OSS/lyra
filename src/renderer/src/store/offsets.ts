import { create } from 'zustand'
import { usePlayer } from './player'
import { useSettings } from './settings'

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
  set(trackId: string, ms: number): void
}

export const useOffsets = create<OffsetStore>((set, get) => ({
  map: load(),
  set(trackId, ms) {
    const clamped = Math.max(-10_000, Math.min(10_000, ms))
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
  const store = useOffsets.getState()
  const ms = (store.map[id] ?? 0) + delta
  store.set(id, ms)
  // also remember it per song in the main process (survives a cleared browser store, shared across players)
  const track = usePlayer.getState().snapshot?.track
  if (track) void window.lyra?.choices?.setOffset(track, useOffsets.getState().map[id] ?? 0).catch(() => {})
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
      if (c?.offsetMs && usePlayer.getState().snapshot?.track?.id === track.id && useOffsets.getState().map[track.id] === undefined) useOffsets.getState().set(track.id, c.offsetMs)
    })
    .catch(() => {})
})
