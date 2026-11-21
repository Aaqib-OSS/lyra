import { useEffect } from 'react'
import { decideStartGate } from '@core/startGate'
import { trackKey } from '@core/songKey'
import { getPosition, usePlayer } from '@/store/player'
import { useLyrics } from '@/store/lyrics'
import { useSettings } from '@/store/settings'
import { useBgState } from '@/store/bgState'

const KEY = 'lyra.firstLine.v1'
type Book = Record<string, number>

const read = (): Book => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Book
  } catch {
    return {}
  }
}

/** Remember when a song's first lyric line comes, so the next play of the song can decide about the start gate. */
function remember(key: string, ms: number): void {
  try {
    const book = read()
    book[key] = ms
    const keys = Object.keys(book)
    if (keys.length > 400) for (const k of keys.slice(0, keys.length - 400)) delete book[k]
    localStorage.setItem(KEY, JSON.stringify(book))
  } catch {
    /* storage can be unavailable: then the gate simply never has a first-line time */
  }
}

/**
 * Optional start gate (Settings > Video > More > "Wait a moment for lyrics", off by default). When a song just started,
 * both lyrics and video are still loading and the song's first line is known to be >5 s in, pause the player for at most
 * 1.5 s (less if the lyrics arrive sooner), then resume. The decision itself is the pure function in core/startGate.ts.
 * Windows only (the phone cannot pause and resume reliably yet).
 */
export function useStartGate(): void {
  const enabled = useSettings((s) => s.settings.startGate)
  const id = usePlayer((s) => s.snapshot?.track?.id ?? null)

  // remember first lines as lyrics arrive (cheap, always on, only used when the gate is switched on)
  useEffect(() => {
    return useLyrics.subscribe((st) => {
      const track = usePlayer.getState().snapshot?.track
      if (!track || st.state.phase !== 'ready') return
      const r = st.state.result
      if (r.status !== 'synced') return
      const first = r.lines.find((l) => l.text.trim() !== '')
      if (first) remember(trackKey(track), first.timeMs)
    })
  }, [])

  useEffect(() => {
    if (!enabled || !id) return
    if (document.documentElement.dataset.platform === 'android') return
    let timer = 0
    let poll = 0
    let held = false
    const start = window.setTimeout(() => {
      const snap = usePlayer.getState().snapshot
      const track = snap?.track
      if (!snap || !track || track.id !== id) return
      const lyr = useLyrics.getState().state
      const bg = useBgState.getState().phase
      const style = useSettings.getState().settings.backgroundStyle
      const d = decideStartGate({
        enabled: true,
        canControl: true,
        isPlaying: snap.isPlaying,
        positionMs: getPosition(),
        userTouched: false,
        alreadyGated: false,
        lyricsLoading: lyr.phase === 'loading',
        videoWanted: style === 'auto' || style === 'youtube',
        videoLoading: bg === 'searching' || bg === 'loading',
        firstLineMs: read()[trackKey(track)] ?? null
      })
      if (!d.hold) return
      held = true
      void usePlayer.getState().command({ type: 'pause' })
      const resume = (): void => {
        window.clearTimeout(timer)
        window.clearInterval(poll)
        if (!held) return
        held = false
        // resume only if the pause is still ours (the user may have pressed play or skipped meanwhile)
        const now = usePlayer.getState().snapshot
        if (now?.track?.id === id && !now.isPlaying) void usePlayer.getState().command({ type: 'play' })
      }
      timer = window.setTimeout(resume, d.holdMs)
      poll = window.setInterval(() => {
        if (useLyrics.getState().state.phase !== 'loading') resume()
      }, 100)
    }, 400)
    return () => {
      window.clearTimeout(start)
      window.clearTimeout(timer)
      window.clearInterval(poll)
      // leaving mid-hold (song changed): the new song plays by itself; if this was the same song and the gate was turned
      // off, make sure the player is not left paused by us
      if (held) {
        held = false
        const now = usePlayer.getState().snapshot
        if (now?.track?.id === id && !now.isPlaying) void usePlayer.getState().command({ type: 'play' })
      }
    }
  }, [enabled, id])
}
