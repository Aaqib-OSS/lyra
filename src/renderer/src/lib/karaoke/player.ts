import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SmoothClock, usableRates } from '@core/karaoke/clockSmooth'

/**
 * The karaoke video as a clock: a YouTube embed that we play, pause and seek through its message API, and read the
 * current time from. Time between two messages (about 4 a second) is interpolated and smoothed (SmoothClock), so
 * lyrics move steadily. Nothing here re-renders per frame: `now()` is read from refs by whoever animates.
 */
const ORIGIN = 'https://www.youtube-nocookie.com'

/** What the screen needs from a music source: the karaoke video, or the original song (lyrics-only sing-along). */
export interface SingClock {
  ready: boolean
  playing: boolean
  /** seconds, interpolated */
  now(): number
  isPlaying(): boolean
  length(): number
  play(): void
  pause(): void
  seek(sec: number): void
}

export interface KaraokePlayer extends SingClock {
  /** attach to the iframe */
  frame: React.RefObject<HTMLIFrameElement | null>
  src: string
  duration: number
  /** YouTube error code (101 / 150: the owner blocked embedding; 2: bad id; 100: removed), null when fine */
  error: number | null
  /** tempo steps this player really supports (empty = cannot change speed: no tempo control is offered) */
  rates: number[]
  rate: number
  setRate(r: number): void
  onLoad(): void
}

type Info = { currentTime?: number; playerState?: number; duration?: number; playbackRate?: number; availablePlaybackRates?: number[] }

/** harness / test seam: with window.__karaokeSim set there is no iframe, a fake 200 s video runs instead */
const simulated = (): boolean => typeof window !== 'undefined' && !!(window as { __karaokeSim?: boolean }).__karaokeSim

export function useKaraokePlayer(videoId: string | null, startSec = 0): KaraokePlayer {
  const frame = useRef<HTMLIFrameElement | null>(null)
  const clock = useRef(new SmoothClock())
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<number | null>(null)
  const [rates, setRates] = useState<number[]>([])
  const [rate, setRateState] = useState(1)
  const durationRef = useRef(0)
  const sim = useRef({ t: 0, playing: false, rate: 1 })

  const apply = useCallback((info: Info): void => {
    const at = performance.now()
    if (typeof info.playbackRate === 'number' && info.playbackRate > 0 && info.playbackRate !== clock.current.getRate()) {
      clock.current.setRate(info.playbackRate, at)
      setRateState(info.playbackRate)
    }
    if (Array.isArray(info.availablePlaybackRates)) setRates(usableRates(info.availablePlaybackRates))
    if (typeof info.playerState === 'number') {
      const p = info.playerState === 1
      if (p !== clock.current.isPlaying()) clock.current.setPlaying(p, at)
      setPlaying(p)
      setReady(true)
    }
    if (typeof info.currentTime === 'number') clock.current.report(info.currentTime, at)
    if (typeof info.duration === 'number' && info.duration > 0 && info.duration !== durationRef.current) {
      durationRef.current = info.duration
      setDuration(info.duration)
    }
  }, [])

  const cmd = useCallback(
    (func: string, args: unknown[] = []): void => {
      if (simulated()) {
        const s = sim.current
        if (func === 'playVideo') s.playing = true
        else if (func === 'pauseVideo') s.playing = false
        else if (func === 'seekTo') s.t = Number(args[0]) || 0
        else if (func === 'setPlaybackRate') s.rate = Number(args[0]) || 1
        return
      }
      frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), ORIGIN)
    },
    []
  )

  useEffect(() => {
    setReady(false)
    setPlaying(false)
    setError(null)
    setRates([])
    setRateState(1)
    durationRef.current = 0
    clock.current.reset()
    if (simulated()) {
      sim.current = { t: startSec, playing: false, rate: 1 }
      const id = window.setInterval(() => {
        const s = sim.current
        if (s.playing) s.t += 0.25 * s.rate
        apply({ currentTime: s.t, playerState: s.playing ? 1 : 2, duration: 200, playbackRate: s.rate, availablePlaybackRates: [0.5, 0.75, 0.85, 1, 1.25] })
      }, 250)
      return () => window.clearInterval(id)
    }
    const onMsg = (e: MessageEvent): void => {
      if (e.source !== frame.current?.contentWindow || e.origin !== ORIGIN) return
      let d: { event?: string; info?: Info | number } | null = null
      try {
        d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      } catch {
        return
      }
      if (d?.event === 'onReady') {
        setReady(true)
        cmd('unloadModule', ['captions'])
        cmd('unloadModule', ['cc'])
      }
      if (d?.event === 'onError' && typeof d.info === 'number') setError(d.info)
      if (d?.info && typeof d.info === 'object') apply(d.info)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
    // startSec only matters for the address the frame is loaded with
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, apply, cmd])

  const src = useMemo(() => {
    if (!videoId || simulated()) return ''
    const start = startSec > 1 ? `&start=${Math.floor(startSec)}&autoplay=1` : ''
    return `${ORIGIN}/embed/${videoId}?controls=0&modestbranding=1&rel=0&playsinline=1&disablekb=1&fs=0&iv_load_policy=3&cc_load_policy=0&enablejsapi=1${start}`
  }, [videoId, startSec])

  return {
    frame,
    src,
    ready,
    playing,
    duration,
    error,
    rates,
    rate,
    isPlaying: () => clock.current.isPlaying(),
    length: () => durationRef.current,
    now: () => clock.current.now(performance.now()),
    play: () => cmd('playVideo'),
    pause: () => cmd('pauseVideo'),
    seek: (sec: number) => {
      cmd('seekTo', [Math.max(0, sec), true])
      clock.current.seek(sec, performance.now())
    },
    setRate: (r: number) => {
      cmd('setPlaybackRate', [r])
      clock.current.setRate(r, performance.now())
      setRateState(r)
    },
    onLoad: () => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), ORIGIN)
  }
}

/** A YouTube address or a bare id -> the 11-character video id (or null). */
export function parseVideoId(text: string): string | null {
  const t = text.trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(t)) return t
  const m = /(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/.exec(t)
  return m ? m[1]! : null
}
