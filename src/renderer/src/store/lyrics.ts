import { create } from 'zustand'
import type { LyricsResult, Track } from '@shared/types'
import { backoffDelay } from '@core/resilience'
import { usePlayer } from './player'

type LyricsState = { phase: 'idle' } | { phase: 'loading'; trackId: string } | { phase: 'ready'; result: LyricsResult }

interface LyricsStore {
  state: LyricsState
  /** when the next automatic retry happens (null = none planned): the UI shows a countdown */
  retryAt: { attempt: number; at: number } | null
  /** set by "Paste lyrics": the match panel focuses its paste box once it is open, then clears this */
  pasteRequested: boolean
  requestPaste(open?: boolean): void
  init(): void
  retry(): void
  /** Replace the current result (e.g. after the user picks another match). */
  apply(result: LyricsResult): void
}

let requestSeq = 0
let retryTimer: ReturnType<typeof setTimeout> | undefined
let autoRetries = 0
/** After this many automatic tries Lyra stops and waits for the network to come back (or a click on "Try now"). */
const MAX_AUTO_RETRIES = 8

/**
 * Temporary failures (offline, a service resting) heal themselves: retry with growing pauses (1.5 s, 3 s, 6 s ... up to
 * 30 s, or as long as the service asked for) until the lyrics load or the song changes. The pause is published so the
 * screen can say "trying again in 6 s".
 */
function scheduleRetry(track: Track, hintSec: number | undefined, failed: boolean, set: (s: LyricsState) => void, setRetry: (r: { attempt: number; at: number } | null) => void): void {
  clearTimeout(retryTimer)
  if (!failed || autoRetries >= MAX_AUTO_RETRIES) {
    if (!failed) autoRetries = 0
    setRetry(null)
    return
  }
  const delay = Math.max((hintSec ?? 0) * 1000, backoffDelay(autoRetries, 1500, 30_000))
  autoRetries++
  setRetry({ attempt: autoRetries, at: Date.now() + delay })
  retryTimer = setTimeout(() => {
    if (usePlayer.getState().snapshot?.track?.id === track.id) void load(track, true, set, setRetry)
  }, delay)
}

async function load(track: Track, force: boolean, set: (s: LyricsState) => void, setRetry: (r: { attempt: number; at: number } | null) => void): Promise<void> {
  const seq = ++requestSeq
  set({ phase: 'loading', trackId: track.id })
  try {
    const result = await (force ? window.lyra.lyrics.refresh(track) : window.lyra.lyrics.get(track))
    if (seq === requestSeq) {
      set({ phase: 'ready', result })
      scheduleRetry(track, result.error?.retryInSec, result.status === 'error' && result.error?.retryable !== false, set, setRetry)
    }
  } catch (e) {
    if (seq !== requestSeq) return
    set({
      phase: 'ready',
      result: {
        trackId: track.id,
        status: 'error',
        provider: 'unknown',
        lines: [],
        error: { kind: 'unknown', message: (e as Error).message, retryable: true }
      }
    })
    scheduleRetry(track, undefined, true, set, setRetry)
  }
}

export const useLyrics = create<LyricsStore>((set, get) => ({
  state: { phase: 'idle' },
  retryAt: null,
  pasteRequested: false,
  requestPaste: (open = true) => set({ pasteRequested: open }),

  init() {
    const setState = (state: LyricsState): void => set({ state })
    const setRetry = (retryAt: { attempt: number; at: number } | null): void => set({ retryAt })
    let current: string | null = null
    const check = (): void => {
      const track = usePlayer.getState().snapshot?.track ?? null
      if (track?.id === current) return
      current = track?.id ?? null
      requestSeq++
      autoRetries = 0
      clearTimeout(retryTimer)
      if (!track) return setState({ phase: 'idle' })
      setRetry(null)
      void load(track, false, setState, setRetry)
    }
    usePlayer.subscribe(check)
    check()
    // back online: don't wait for the next timer
    window.addEventListener('online', () => {
      const track = usePlayer.getState().snapshot?.track
      const cur = get().state
      if (track && cur.phase === 'ready' && cur.result.status === 'error') {
        clearTimeout(retryTimer)
        autoRetries = 0
        void load(track, true, setState, setRetry)
      }
    })
  },

  apply(result) {
    requestSeq++ // drop any in-flight automatic lookup
    set({ state: { phase: 'ready', result } })
  },

  retry() {
    const track = usePlayer.getState().snapshot?.track
    if (track) {
      autoRetries = 0
      clearTimeout(retryTimer)
      void load(track, true, (state) => set({ state }), (retryAt) => set({ retryAt }))
    }
  }
}))
