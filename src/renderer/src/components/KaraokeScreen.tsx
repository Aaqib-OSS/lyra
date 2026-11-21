import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { LyricLine, YoutubeVideo } from '@shared/types'
import { estimateWords } from '@shared/wordTiming'
import { MIN_INTRO_MS } from '@core/karaoke/countIn'
import { counterpart, orderItems, pickFirst, pickNext, type Memory } from '@core/karaoke/select'
import { parseVideoId, useKaraokePlayer, type SingClock } from '@/lib/karaoke/player'
import { useOriginalClock } from '@/lib/karaoke/original'
import { loadMemory, markBad, rememberChoice, touchUsed } from '@/lib/karaoke/memory'
import { openMic, type Mic } from '@/lib/karaoke/mic'
import { scoreLine, summarize, type Frame, type KLine, type LineResult, type Summary } from '@/lib/karaoke/score'
import { useLyrics } from '@/store/lyrics'
import { usePlayer } from '@/store/player'
import { Icon } from './Icon'
import { KaraokeStage } from './KaraokeStage'
import '@/styles/karaoke2.css'

/**
 * Karaoke: a karaoke / instrumental version of the song plays (YouTube), Lyra shows the lyrics word by word with a
 * count-in, and the microphone is scored: how much of each line you sang, and how cleanly (see lib/karaoke/score.ts).
 * When no karaoke version exists the original song can play instead (lyrics-only sing-along on the shared song clock).
 * Pure decisions live in core/karaoke (ranking, picking, count-in timing, the smoothed clock) and are unit tested.
 */
type Phase = 'pick' | 'calm' | 'count' | 'sing' | 'done'
type Source = 'karaoke' | 'original'

const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const offsetKey = 'lyra.karaoke.offsets'
const bestKey = 'lyra.karaoke.best'
const read = <T,>(k: string): Record<string, T> => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? '{}') as Record<string, T>
  } catch {
    return {}
  }
}
const NO_MEMORY: Memory = { bad: new Set(), chosen: null }
const SLOW_LOAD_MS = 15000

export function KaraokeScreen({ onClose }: { onClose: () => void }): ReactElement {
  // the song is fixed when the screen opens (Spotify may move on), and Spotify is paused so only the karaoke music plays
  const [track] = useState(() => usePlayer.getState().snapshot?.track ?? null)
  const lyrics = useLyrics((s) => s.state)
  const lines: LyricLine[] = useMemo(
    () => (lyrics.phase === 'ready' && lyrics.result.status === 'synced' ? estimateWords(lyrics.result.lines, track?.durationMs) : []),
    [lyrics, track?.durationMs]
  )
  // where each line is sung: from its start to the next line's start (at most 9 s, and a little before the next one)
  const kl: KLine[] = useMemo(
    () => lines.map((l, i) => ({ startMs: l.timeMs, endMs: Math.min(l.endMs ?? Infinity, (lines[i + 1]?.timeMs ?? l.timeMs + 6000) - 150, l.timeMs + 9000), text: l.text })),
    [lines]
  )

  const [phase, setPhase] = useState<Phase>('pick')
  const [source, setSource] = useState<Source>('karaoke')
  const [videos, setVideos] = useState<YoutubeVideo[] | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [mem, setMem] = useState<Memory>(() => (track ? loadMemory(track.title, track.artists[0] ?? '') : NO_MEMORY))
  const [videoId, setVideoId] = useState<string | null>(null)
  const [startAt, setStartAt] = useState(0)
  const [paste, setPaste] = useState('')
  const [offsetMs, setOffsetMs] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [count, setCount] = useState(3)
  const [hud, setHud] = useState<{ points: number; last: LineResult | null; streak: number }>({ points: 0, last: null, streak: 0 })
  const [summary, setSummary] = useState<Summary | null>(null)
  const [leak, setLeak] = useState(false)
  const [scored, setScored] = useState(true)
  const [slow, setSlow] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const player = useKaraokePlayer(source === 'karaoke' ? videoId : null, startAt)
  const original = useOriginalClock(track, source === 'original')
  const clock: SingClock = source === 'original' ? original : player
  const clockRef = useRef<SingClock>(clock)
  clockRef.current = clock
  const mic = useRef<Mic | null>(null)
  const frames = useRef<Frame[]>([])
  const done = useRef<LineResult[]>([])
  const meter = useRef<HTMLElement | null>(null)
  const offsetRef = useRef(0)
  offsetRef.current = offsetMs
  const trackId = track?.id ?? ''
  const artist = track?.artists[0] ?? ''

  const items = useMemo(() => orderItems(videos ?? [], mem), [videos, mem])
  const current = items.find((v) => v.videoId === videoId) ?? null
  const pair = videoId ? counterpart(items, mem, videoId) : null
  const noVersion = (videos !== null || searchError !== null) && !videoId
  const getPos = useCallback((): number => clockRef.current.now() * 1000 + offsetRef.current, [])
  const getLength = useCallback((): number => clockRef.current.length() * 1000, [])

  // microphone permission is only allowed while this screen is open
  useEffect(() => {
    touchUsed()
    void window.lyra.studio.setMic(true)
    if (usePlayer.getState().snapshot?.isPlaying) void usePlayer.getState().command({ type: 'pause' })
    // YouTube's player is the slow part of a start: open the connection while the user is still choosing
    const links = ['https://www.youtube-nocookie.com', 'https://i.ytimg.com'].map((href) => {
      const l = document.createElement('link')
      l.rel = 'preconnect'
      l.href = href
      document.head.appendChild(l)
      return l
    })
    return () => {
      void window.lyra.studio.setMic(false)
      mic.current?.stop()
      links.forEach((l) => l.remove())
    }
  }, [])

  // the stored timing nudge and the karaoke versions of this song (a pre-fetch may have cached them: then it is instant)
  useEffect(() => {
    if (!track) return
    setOffsetMs(read<number>(offsetKey)[track.id] ?? 0)
    setVideos(null)
    setSearchError(null)
    void window.lyra.background.karaokeVideos(track).then((r) => {
      setVideos(r.items)
      setSearchError(r.error ?? null)
    })
    // the id is what matters, not the object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId])

  // the best version that is not known to be bad; the user's own pick is never replaced
  useEffect(() => {
    if (!videos) return
    setVideoId((cur) => cur ?? pickFirst(videos, mem)?.videoId ?? null)
    // mem changes (marking bad) are handled where they happen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos])

  // a version that will not play here (embedding blocked, removed): remember it as bad and try the next one
  useEffect(() => {
    if (source !== 'karaoke' || player.error === null || !videoId) return
    const bad = videoId
    markBad(bad)
    const next = loadMemory(track?.title ?? '', artist)
    setMem(next)
    const alt = pickNext(videos ?? [], next, bad)
    setNotice(alt ? 'That version cannot be played here. Trying another one.' : 'That version cannot be played here.')
    setStartAt(clockRef.current.now())
    setVideoId(alt?.videoId ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.error])

  // a version that takes too long to load
  useEffect(() => {
    setSlow(false)
    if (source !== 'karaoke' || !videoId || player.ready) return
    const t = window.setTimeout(() => setSlow(true), SLOW_LOAD_MS)
    return () => window.clearTimeout(t)
  }, [source, videoId, player.ready])

  const nudge = useCallback(
    (ms: number): void => {
      setOffsetMs((cur) => {
        const next = Math.max(-15000, Math.min(15000, cur + ms))
        const all = read<number>(offsetKey)
        all[trackId] = next
        localStorage.setItem(offsetKey, JSON.stringify(all))
        return next
      })
    },
    [trackId]
  )

  const finish = useCallback((): void => {
    clockRef.current.pause()
    mic.current?.stop()
    mic.current = null
    if (!scoredRef.current) {
      setSummary(null)
      return setPhase('done')
    }
    // lines that were not finished count with what was heard so far
    const list = [...done.current]
    for (let i = list.length; i < kl.length; i++) list.push(scoreLine(i, kl[i]!, frames.current))
    const s = summarize(list)
    setSummary(s)
    setPhase('done')
    const best = read<number>(bestKey)
    if (s.total > (best[trackId] ?? 0)) {
      best[trackId] = s.total
      localStorage.setItem(bestKey, JSON.stringify(best))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kl, trackId])
  const scoredRef = useRef(true)
  scoredRef.current = scored

  const start = async (src: Source): Promise<void> => {
    setMessage(null)
    setNotice(null)
    if (!kl.length) return setMessage('This song has no synced lyrics, so karaoke cannot follow it.')
    if (src === 'karaoke' && (!videoId || !player.ready)) return setMessage('The karaoke video is still loading.')
    setSource(src)
    if (src === 'karaoke' && videoId && track) rememberChoice(track.title, artist, videoId)
    frames.current = []
    done.current = []
    setHud({ points: 0, last: null, streak: 0 })
    setSummary(null)
    setLeak(false)
    // the microphone is optional: without it the lyrics still run, just without a score
    let micOk = true
    try {
      mic.current?.stop()
      mic.current = await openMic()
    } catch {
      micOk = false
      mic.current = null
    }
    setScored(micOk)
    scoredRef.current = micOk
    if (micOk) {
      setPhase('calm')
      await mic.current!.calibrate(1400)
    } else setNotice('No microphone, so no score. The lyrics still follow along.')
    // a first line that comes right away has no room for the on-stage count-in: count here instead
    if ((kl[0]?.startMs ?? 0) < MIN_INTRO_MS) {
      setPhase('count')
      for (let n = 3; n >= 1; n--) {
        setCount(n)
        await new Promise((r) => setTimeout(r, 900))
      }
    }
    if (src === 'original') {
      await usePlayer.getState().command({ type: 'seek', positionMs: 0 })
      await usePlayer.getState().command({ type: 'play' })
    } else {
      clockRef.current.seek(0)
      clockRef.current.play()
    }
    setPhase('sing')
  }

  // while singing: the microphone and the scoring (no animation here: the stage moves itself)
  useEffect(() => {
    if (phase !== 'sing') return
    let finishedLines = 0
    let loudRun = 0
    const m = mic.current
    const stopWatch = m
      ? m.watch((r) => {
          if (meter.current) meter.current.style.transform = `scaleX(${m.level().toFixed(2)})`
          if (!clockRef.current.isPlaying()) return
          const t = getPos()
          frames.current.push({ tMs: t, voiced: r.voiced, cents: r.cents })
          // the microphone hearing the music all the time, before the first line: speakers, not headphones
          if (t < (kl[0]?.startMs ?? 0) - 500 && t > 0) loudRun = r.voiced ? loudRun + 1 : 0
          if (loudRun > 60) setLeak(true)
        })
      : () => {}
    const id = window.setInterval(() => {
      const t = getPos()
      // score the lines that are over
      while (scoredRef.current && finishedLines < kl.length && t > kl[finishedLines]!.endMs + 200) {
        const r = scoreLine(finishedLines, kl[finishedLines]!, frames.current)
        done.current.push(r)
        finishedLines++
        const s = summarize(done.current)
        setHud({ points: s.total, last: r, streak: s.bestStreak })
      }
      const lastEnd = kl[kl.length - 1]?.endMs ?? 0
      if (t > lastEnd + 1500) return finish()
      const len = clockRef.current.length()
      if (len > 0 && clockRef.current.now() > len - 0.5) finish()
    }, 80)
    return () => {
      stopWatch()
      window.clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const pickVideo = useCallback((id: string): void => {
    setVideoId(id)
    setMessage(null)
    setNotice(null)
  }, [])

  /** this version is no good: remember it and move to the next best one */
  const rejectCurrent = useCallback((): void => {
    if (!videoId) return
    markBad(videoId)
    const next = loadMemory(track?.title ?? '', artist)
    setMem(next)
    const alt = pickNext(videos ?? [], next, videoId)
    setStartAt(phase === 'sing' ? clockRef.current.now() : 0)
    setVideoId(alt?.videoId ?? null)
    setNotice(alt ? 'Marked as a bad version. Switched to the next one.' : 'Marked as a bad version.')
  }, [videoId, videos, phase, track?.title, artist])

  /** vocal guide on / off: the same song with or without a lead vocal, picking up where we are */
  const toggleGuide = useCallback((): void => {
    if (!pair) return
    setStartAt(phase === 'sing' ? clockRef.current.now() : 0)
    setVideoId(pair.videoId)
  }, [pair, phase])

  const cycleTempo = useCallback((): void => {
    if (player.rates.length < 2) return
    const i = player.rates.indexOf(player.rate)
    player.setRate(player.rates[(i + 1) % player.rates.length]!)
  }, [player])

  const togglePause = useCallback((): void => {
    if (clockRef.current.isPlaying()) clockRef.current.pause()
    else clockRef.current.play()
  }, [])

  const again = useCallback((): void => {
    setPhase('pick')
    if (source === 'karaoke') {
      player.seek(0)
      player.pause()
    }
    setSource('karaoke')
  }, [source, player])

  // keyboard: handled here (capture) so the app's own shortcuts (space = play / pause) do not also fire
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key
      const eat = (): void => {
        e.preventDefault()
        e.stopPropagation()
      }
      if (k === 'Escape') {
        eat()
        return onClose()
      }
      if (phase === 'sing') {
        if (k === ' ' || k === 'k' || k === 'K') (eat(), togglePause())
        else if (k === 'ArrowLeft') (eat(), nudge(e.shiftKey ? -500 : -200))
        else if (k === 'ArrowRight') (eat(), nudge(e.shiftKey ? 500 : 200))
        else if (k === 't' || k === 'T') (eat(), cycleTempo())
        else if (k === 'g' || k === 'G') (eat(), toggleGuide())
        else if (k === 'f' || k === 'F') (eat(), finish())
      } else if (phase === 'pick') {
        if (k === 'Enter') (eat(), void start(noVersion ? 'original' : source))
        else if (k === 'ArrowDown' || k === 'ArrowUp') {
          eat()
          const list = items.filter((v) => !mem.bad.has(v.videoId))
          const i = list.findIndex((v) => v.videoId === videoId)
          const n = list[(i + (k === 'ArrowDown' ? 1 : -1) + list.length) % Math.max(1, list.length)]
          if (n) pickVideo(n.videoId)
        }
      } else if (phase === 'done' && k === 'Enter') (eat(), again())
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // handlers read fresh state through the closure of each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })

  const onStageTap = (e: React.MouseEvent): void => {
    if ((e.target as HTMLElement).closest('button, a, input')) return
    togglePause()
  }

  const best = read<number>(bestKey)[trackId]
  const canStart = !!videoId && player.ready

  return (
    <div className="k2" role="dialog" aria-label="Karaoke" data-nodrag data-phase={phase}>
      <header className="k2-head">
        <b>Karaoke</b>
        <span>{track ? `${track.title} · ${track.artists[0] ?? ''}` : ''}</span>
        <button type="button" className="ibtn" aria-label="Close karaoke" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </header>

      {/* the karaoke video is only a source of music; YouTube's player needs to be on screen to play, so it stays small */}
      {source === 'karaoke' && player.src && <iframe ref={player.frame} className="k2-frame" src={player.src} title="Karaoke music" allow="autoplay; encrypted-media" referrerPolicy="strict-origin-when-cross-origin" onLoad={player.onLoad} />}

      {phase === 'pick' && (
        <div className="k2-body">
          {!track && <p className="k2-hint">Play a song in Spotify first.</p>}
          {track && lines.length === 0 && <p className="k2-hint">Waiting for this song's synced lyrics… Karaoke needs them to follow along.</p>}
          {track && (
            <>
              <h4>Backing music</h4>
              {videos === null && !searchError && <p className="k2-hint">Looking for a karaoke version…</p>}

              {noVersion && (
                <div className="k2-fallback">
                  <p>
                    <b>No karaoke version found.</b> {searchError ?? 'Nothing convincing came up for this song.'}
                  </p>
                  <p className="k2-hint">You can still sing along: the lyrics follow the original song, word by word.</p>
                  <button type="button" className="pill pill--primary k2-go" disabled={!lines.length} onClick={() => void start('original')}>
                    Sing along with the original song
                  </button>
                </div>
              )}

              <div className="k2-list" role="radiogroup" aria-label="Karaoke version">
                {items.slice(0, 6).map((v) => {
                  const bad = mem.bad.has(v.videoId)
                  return (
                    <button key={v.videoId} type="button" role="radio" aria-checked={videoId === v.videoId} className={`k2-ver ${videoId === v.videoId ? 'is-on' : ''} ${bad ? 'is-bad' : ''}`} onClick={() => pickVideo(v.videoId)}>
                      <span className="k2-ver__t">{v.title}</span>
                      <span className="k2-ver__m">
                        {v.channel}
                        {v.durationSec ? ` · ${fmt(v.durationSec)}` : ''}
                        {v.guide ? ' · guide vocals' : ''}
                        {bad ? ' · marked bad' : ''}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="k2-paste">
                <input value={paste} placeholder="Or paste a YouTube link" onChange={(e) => setPaste(e.target.value)} aria-label="YouTube link" />
                <button
                  type="button"
                  className="pill"
                  onClick={() => {
                    const id = parseVideoId(paste)
                    if (id) pickVideo(id)
                    else setMessage('That does not look like a YouTube link.')
                  }}
                >
                  Use
                </button>
              </div>
              <p className="k2-hint">Wear headphones: the microphone must hear you, not the music. Stay quiet for a moment when it starts, it listens to the room first.</p>
              <div className="k2-nudge">
                <span>Lyrics timing</span>
                <button type="button" className="pill" onClick={() => nudge(-500)}>−0.5 s</button>
                <b>{(offsetMs / 1000).toFixed(1)} s</b>
                <button type="button" className="pill" onClick={() => nudge(500)}>+0.5 s</button>
              </div>
              {current && track && current.durationSec && Math.abs(current.durationSec - track.durationMs / 1000) > 10 && (
                <p className="k2-hint">This version is {fmt(Math.abs(current.durationSec - track.durationMs / 1000))} {current.durationSec > track.durationMs / 1000 ? 'longer' : 'shorter'} than the song, so the lyrics may need a timing nudge.</p>
              )}
              {slow && <p className="k2-hint k2-hint--warn">This version is slow to load. Pick another one if it does not start.</p>}
              {notice && <p className="k2-hint k2-hint--warn">{notice}</p>}
              {message && <p className="k2-hint k2-hint--warn">{message}</p>}
              {!noVersion && (
                <div className="k2-actions">
                  <button type="button" className="pill pill--primary k2-go" disabled={!canStart || !lines.length} onClick={() => void start('karaoke')}>
                    {canStart ? 'Start singing' : 'Loading the music…'}
                  </button>
                  <button type="button" className="pill" disabled={!lines.length} onClick={() => void start('original')}>
                    Lyrics only, with the original song
                  </button>
                  {videoId && <button type="button" className="pill" onClick={rejectCurrent}>Not a good version</button>}
                </div>
              )}
              {best ? <p className="k2-hint">Your best: {best} points</p> : null}
              <p className="k2-keys">Enter start · ↑ ↓ version · Esc close</p>
            </>
          )}
        </div>
      )}

      {phase === 'calm' && <div className="k2-center"><h2>Shh…</h2><p>Listening to the room, stay quiet for a second.</p></div>}
      {phase === 'count' && <div className="k2-center"><h1 key={count}>{count}</h1><p>Get ready</p></div>}

      {phase === 'sing' && (
        <div className="k2-sing" onClick={onStageTap}>
          <div className="k2-hud">
            {scored ? <span>{hud.points} pts</span> : <span>Not scored</span>}
            {scored && hud.last && <b className={`grade grade--${hud.last.grade}`} key={hud.last.index}>{hud.last.grade === 'perfect' ? 'Perfect!' : hud.last.grade === 'great' ? 'Great' : hud.last.grade === 'ok' ? 'OK' : 'Miss'}</b>}
            {scored && <span className="k2-meter"><i ref={meter} /></span>}
          </div>
          {leak && <p className="k2-hint k2-hint--warn">The microphone is hearing the music. Headphones will make the score fair.</p>}
          {notice && !leak && <p className="k2-hint k2-hint--warn">{notice}</p>}
          {source === 'karaoke' && !player.ready && <p className="k2-hint">Loading the music…</p>}
          <KaraokeStage lines={lines} spans={kl} getPos={getPos} getLength={getLength} rate={source === 'karaoke' ? player.rate : 1} />
          {!clock.playing && <div className="k2-paused" aria-hidden>Paused · tap or press Space</div>}
          <div className="k2-controls">
            <button type="button" className="k2-btn k2-btn--round" aria-label={clock.playing ? 'Pause' : 'Play'} onClick={togglePause}>
              <Icon name={clock.playing ? 'pause' : 'play'} size={18} />
            </button>
            <button type="button" className="k2-btn" onClick={() => nudge(-200)} title="Left arrow">Lyrics earlier</button>
            <b className="k2-offset">{(offsetMs / 1000).toFixed(1)} s</b>
            <button type="button" className="k2-btn" onClick={() => nudge(200)} title="Right arrow">Lyrics later</button>
            {source === 'karaoke' && player.rates.length > 1 && (
              <button type="button" className="k2-btn" onClick={cycleTempo} title="T: slower, the pitch stays the same">Tempo {Math.round(player.rate * 100)}%</button>
            )}
            {pair && <button type="button" className="k2-btn" onClick={toggleGuide} title="G">Vocal guide {current?.guide ? 'on' : 'off'}</button>}
            {source === 'karaoke' && videoId && <button type="button" className="k2-btn" onClick={rejectCurrent}>Bad version</button>}
            <button type="button" className="k2-btn" onClick={finish} title="F">Finish</button>
          </div>
          <p className="k2-keys">Space pause · ← → timing · T tempo{pair ? ' · G vocal guide' : ''} · F finish · Esc close</p>
        </div>
      )}

      {phase === 'done' && (
        <div className="k2-body k2-results">
          {summary ? (
            <>
              <div className="k2-stars" aria-label={`${summary.stars} of 5 stars`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <span key={n} className={n <= summary.stars ? 'is-on' : ''}>★</span>
                ))}
              </div>
              <h2>{summary.total} points</h2>
              <p className="k2-hint">
                You sang {Math.round(summary.sungShare * 100)}% of the lines · best streak {summary.bestStreak}
                {best === summary.total ? ' · new best!' : ''}
              </p>
              <div className="k2-review">
                {summary.lines.map((r) => (
                  <div key={r.index} className={`review review--${r.grade}`}>
                    <span>{r.text || '♪'}</span>
                    <b>{r.points}</b>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <h2>Nice singing!</h2>
          )}
          <div className="k2-actions">
            <button type="button" className="pill pill--primary" onClick={again}>Sing again</button>
            <button type="button" className="pill" onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
