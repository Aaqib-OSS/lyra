import '@fontsource-variable/fraunces/standard.css'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import type { LyricLine, PersonalScene } from '@shared/types'
import { useWindowDrag } from '@/hooks/useWindowDrag'
import { useActiveLine, useFrame } from '@/hooks/useLyricsSync'
import { lineDuration, splitLine, videoTimeFor, wordSpans } from '@/lib/personalScene'
import { getPosition, usePlayer } from '@/store/player'
import { useLyrics } from '@/store/lyrics'
import { requestMode, useUi } from '@/store/ui'

const fmt = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * One song's own screen (src/main/personal.ts): a paper page with the video in a polaroid, the lyrics with a highlighter that
 * follows the singing, and a glass player card. The video is laid over the song clock, so it stays with the lyrics.
 * It replaces the normal screen only while its song plays; everything else is untouched.
 */
export function PersonalSceneView({ scene, mini }: { scene: PersonalScene; mini: boolean }): ReactElement {
  const drag = useWindowDrag()
  const track = usePlayer((s) => s.snapshot?.track ?? null)
  const playing = usePlayer((s) => s.snapshot?.isPlaying ?? false)
  const lyrics = useLyrics((s) => s.state)
  const panel = useUi((s) => s.panel)
  const togglePanel = useUi((s) => s.togglePanel)

  const lines: LyricLine[] = useMemo(() => (lyrics.phase === 'ready' && lyrics.result.status === 'synced' ? lyrics.result.lines.filter((l) => l.text.trim()) : []), [lyrics])
  const synced = lines.length > 0
  const idx = useActiveLine(lines, synced)

  // ---- size: everything is drawn on a 1920x1080 (or 1080x1920, tall windows) page and scaled to the window
  const box = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ u: 1, portrait: false })
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = (): void => {
      const w = el.clientWidth || 1
      const h = el.clientHeight || 1
      const portrait = w / h < 0.9
      setDims({ portrait, u: portrait ? Math.min(w / 1080, h / 1920) : Math.min(w / 1920, h / 1080) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const W = dims.portrait ? 1080 : 1920
  const H = dims.portrait ? 1920 : 1080

  // ---- the video follows the song clock through the scene's anchors
  const vid = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = vid.current
    if (!v) return
    const drive = (): void => {
      if (v.readyState < 2) return
      const { v: want, slope } = videoTimeFor(getPosition() / 1000, scene)
      const target = Math.max(0, Math.min(scene.videoDurationSec - 0.05, want + scene.videoNudgeSec))
      const drift = v.currentTime - target
      if (!playing) {
        if (!v.paused) v.pause()
        if (Math.abs(drift) > 0.04 && !v.seeking) v.currentTime = target
        return
      }
      if (Math.abs(drift) > 0.45 && !v.seeking) v.currentTime = target
      else {
        const rate = Math.max(0.5, Math.min(2, slope * (1 - drift * 0.6)))
        if (Math.abs(v.playbackRate - rate) > 0.04) v.playbackRate = rate
      }
      if (v.paused) void v.play().catch(() => undefined)
    }
    drive()
    const t = window.setInterval(drive, 90)
    v.addEventListener('loadeddata', drive)
    return () => {
      clearInterval(t)
      v.removeEventListener('loadeddata', drive)
    }
  }, [scene, playing, track?.id])

  // ---- the colour of the scene washes softly over the page (12x15 pixels, three times a second)
  useEffect(() => {
    const v = vid.current
    const el = box.current
    if (!v || !el) return
    const c = document.createElement('canvas')
    c.width = 12
    c.height = 15
    const x = c.getContext('2d', { willReadFrequently: true })
    if (!x) return
    const t = window.setInterval(() => {
      try {
        if (v.readyState < 2) return
        x.drawImage(v, 0, 0, 12, 15)
        const d = x.getImageData(0, 0, 12, 15).data
        let r = 0, g = 0, b = 0
        const n = d.length / 4
        for (let i = 0; i < d.length; i += 4) {
          r += d[i]!
          g += d[i + 1]!
          b += d[i + 2]!
        }
        r /= n
        g /= n
        b /= n
        const lum = (r * 0.3 + g * 0.59 + b * 0.11) / 255
        el.style.setProperty('--ps-amb', `rgba(${r | 0},${g | 0},${b | 0},${lum < 0.2 ? 0.16 : 0.34})`)
      } catch {
        /* a frame that cannot be read is skipped */
      }
    }, 350)
    return () => clearInterval(t)
  }, [scene])

  // ---- lyrics: scroll to the current line, bump the polaroid, paint the highlighter
  const trackEl = useRef<HTMLDivElement>(null)
  const pol = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const t = trackEl.current
    if (!t) return
    const cur = t.children[idx] as HTMLElement | undefined
    const vp = t.parentElement
    const y = cur && vp ? cur.offsetTop - vp.clientHeight * 0.26 : 0
    t.style.transform = `translateY(${-Math.max(0, y)}px)`
  }, [idx, lines, dims])
  useEffect(() => {
    const p = pol.current
    if (!p || idx < 0) return
    p.classList.remove('ps-bump')
    void p.offsetWidth
    p.classList.add('ps-bump')
  }, [idx])
  useFrame(
    (pos) => {
      const t = trackEl.current
      if (!t || idx < 0 || !lines[idx]) return
      const lp = pos + (scene.lyricNudgeSec ? -scene.lyricNudgeSec * 1000 : 0)
      const words = t.querySelectorAll<HTMLElement>('.ps-ln.now .w')
      if (!words.length) return
      const spans = wordSpans(Array.from(words, (w) => w.textContent ?? ''))
      const p = Math.max(0, Math.min(1, (lp - lines[idx]!.timeMs) / lineDuration(lines, idx)))
      words.forEach((w, k) => {
        const [a, b] = spans[k]!
        if (p >= b) {
          w.dataset.s = 'done'
          w.style.removeProperty('--wp')
        } else if (p >= a) {
          w.dataset.s = 'on'
          w.style.setProperty('--wp', ((p - a) / (b - a)).toFixed(3))
        } else {
          delete w.dataset.s
          w.style.removeProperty('--wp')
        }
      })
    },
    synced,
    [idx, lines, scene]
  )

  // ---- the card
  const timeEl = useRef<HTMLSpanElement>(null)
  const progEl = useRef<HTMLElement>(null)
  const dur = track?.durationMs ?? 0
  useFrame(
    (pos) => {
      if (timeEl.current) timeEl.current.textContent = `${fmt(pos)}\u00a0\u00a0\u2212${fmt(Math.max(0, dur - pos))}`
      if (progEl.current) progEl.current.style.width = `${dur ? Math.max(0, Math.min(100, (pos / dur) * 100)) : 0}%`
    },
    true,
    [dur]
  )
  const seek = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (!dur) return
    const r = e.currentTarget.getBoundingClientRect()
    usePlayer.getState().seek(Math.round(((e.clientX - r.left) / r.width) * dur))
  }

  const style = { ['--u' as string]: `${dims.u}px`, width: '100%', height: '100%' } as CSSProperties
  return (
    <div ref={box} className="pscene" data-portrait={dims.portrait || undefined} style={style} aria-label={`${track?.title ?? ''} by ${track?.artists.join(', ') ?? ''}`}>
      <div className="pscene__page" style={{ width: W * dims.u, height: H * dims.u }}>
        <svg className="ps-branch" viewBox="0 0 520 300" fill="none" aria-hidden="true">
          <path d="M520 40 C400 60 330 90 250 150 C200 190 150 215 60 230" stroke="#3f5a43" strokeWidth="7" strokeLinecap="round" />
          <path d="M330 92 C320 60 300 40 270 30M250 150 C240 190 215 215 190 250M410 62 C400 30 380 10 360 0" stroke="#3f5a43" strokeWidth="4" strokeLinecap="round" />
          <g fill="#fff" stroke="#c8d6c2" strokeWidth="1.5">
            <circle cx="300" cy="46" r="13" />
            <circle cx="345" cy="70" r="11" />
            <circle cx="262" cy="124" r="14" />
            <circle cx="214" cy="175" r="12" />
            <circle cx="392" cy="40" r="11" />
            <circle cx="150" cy="212" r="12" />
          </g>
          <circle cx="262" cy="124" r="4" fill="#f2c9d3" />
        </svg>
        <div className="ps-edge" aria-hidden="true" />
        <div className="ps-petals" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => (
            <i key={i} className="ps-petal" style={{ left: `${6 + ((i * 97) % 88)}%`, animationDuration: `${16 + ((i * 7) % 11)}s`, animationDelay: `${-((i * 5) % 17)}s` }} />
          ))}
        </div>

        <header className="ps-top" {...(mini ? drag : {})}>
          <span className="ps-device" />
          <div className="ps-tools" data-nodrag>
            <button type="button" aria-label="Settings" aria-pressed={panel === 'settings'} onClick={() => togglePanel('settings')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></svg>
            </button>
            <button type="button" aria-label={mini ? 'Fullscreen lyrics' : 'Exit fullscreen'} onClick={() => requestMode(mini ? 'full' : 'mini')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{mini ? <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /> : <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />}</svg>
            </button>
            {mini && (
              <>
                <button type="button" aria-label="Minimize" onClick={() => window.lyra.window.minimize()}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14" /></svg>
                </button>
                <button type="button" aria-label="Collapse to widget" onClick={() => requestMode('compact')}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 15l6-6 6 6" /></svg>
                </button>
                <button type="button" aria-label="Quit Lyra" onClick={() => window.lyra.window.quit()}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </>
            )}
          </div>
        </header>

        <section ref={pol} className="ps-pol" aria-label="Video">
          <i className="ps-tape" />
          <i className="ps-pin" />
          <div className="ps-vwrap">
            <video ref={vid} src={scene.videoUrl} muted playsInline preload="auto" disablePictureInPicture />
          </div>
          <div className="ps-strip">
            <span>{track?.title}</span>
            <span>{track?.artists[0]}</span>
          </div>
        </section>
        <div className="ps-sticker" aria-hidden="true">made for you</div>

        <section className="ps-ly" aria-label="Lyrics">
          <div className="ps-px">NOW PLAYING</div>
          <div className="ps-viewport">
            <div ref={trackEl} className="ps-track">
              {synced ? (
                lines.map((l, i) => {
                  const { bk, main } = splitLine(l.text)
                  const d = i - idx
                  const cls = `ps-ln${d < 0 ? ' past' : ''}${d === 0 ? ' now' : ''}${Math.abs(d) > 2 ? ' far' : ''}`
                  return (
                    <div key={`${i}-${l.timeMs}`} className={cls}>
                      {bk && <small className="bk">{bk}</small>}
                      {d === 0
                        ? main.split(/\s+/).map((w, k, all) => (
                            <span key={k}>
                              <span className="w">{w}</span>
                              {k < all.length - 1 ? ' ' : ''}
                            </span>
                          ))
                        : main}
                    </div>
                  )
                })
              ) : (
                <div className="ps-ln now ps-note">{lyrics.phase === 'loading' ? 'Finding the lyrics…' : lyrics.phase === 'ready' && lyrics.result.status !== 'synced' ? 'These lyrics aren’t time-synced, so they can’t follow the song.' : '…'}</div>
              )}
            </div>
          </div>
        </section>

        <section className="ps-card" aria-label="Player">
          <div className="ps-art" style={{ backgroundImage: `url(${scene.artUrl ?? track?.artworkUrl ?? ''})` }} />
          <div className="ps-meta">
            <div className="ps-row">
              <b>{track?.title}</b>
              <span ref={timeEl} className="ps-px" />
            </div>
            <div className="ps-by">{track?.artists.join(', ')}</div>
            <div className="ps-bar" role="slider" aria-label="Song position" aria-valuemin={0} aria-valuemax={Math.round(dur / 1000)} onClick={seek}>
              <i ref={progEl} />
            </div>
            <div className="ps-ctl">
              <button type="button" aria-label="Previous" onClick={() => void usePlayer.getState().command({ type: 'previous' })}>
                <svg viewBox="0 0 22 16" fill="currentColor"><path d="M11 0v16L0 8zM22 0v16L11 8z" /></svg>
              </button>
              <button type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={() => usePlayer.getState().toggle()}>
                {playing ? (
                  <svg viewBox="0 0 22 22" fill="currentColor"><rect x="3" y="1" width="6" height="20" rx="2" /><rect x="13" y="1" width="6" height="20" rx="2" /></svg>
                ) : (
                  <svg viewBox="0 0 22 22" fill="currentColor"><path d="M5 1l16 10L5 21z" /></svg>
                )}
              </button>
              <button type="button" aria-label="Next" onClick={() => void usePlayer.getState().command({ type: 'next' })}>
                <svg viewBox="0 0 22 16" fill="currentColor"><path d="M0 0v16l11-8zM11 0v16l11-8z" /></svg>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
