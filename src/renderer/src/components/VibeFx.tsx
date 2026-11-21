import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { getPosition, usePlayer } from '@/store/player'
import { useEffectiveVibe } from '@/hooks/useVibe'

const PALM = 'M50 300 C48 220 52 150 60 90 C40 100 18 96 0 80 C24 78 44 82 58 74 C52 52 36 40 14 36 C40 30 62 44 66 66 C74 46 92 34 112 34 C96 44 82 58 76 80 C96 84 116 82 140 70 C120 92 94 98 70 98 C62 150 58 220 62 300 Z'

function Scoreboard() {
  const track = usePlayer((x) => x.snapshot?.track ?? null)
  const [t, setT] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setT(getPosition()), 1000)
    return () => clearInterval(id)
  }, [])
  const dur = track?.durationMs ?? 1
  const mm = String(Math.floor(t / 60000)).padStart(2, '0')
  const ss = String(Math.floor((t % 60000) / 1000)).padStart(2, '0')
  return (
    <div className="vibefx__score-bug">
      <span className="live">LIVE</span>
      <span className="clock">{mm}:{ss}</span>
      <span className="teams">{track?.title ?? 'Lyra'}<em>vs</em>{track?.artists[0] ?? ''}</span>
      <span className="half">{t < dur / 2 ? '1ST HALF' : '2ND HALF'}</span>
    </div>
  )
}

/** The framed window of a scene vibe (see styles/scene.css): a panel when there is no video, plus the vibe's own frame layers. */
function SceneWindow({ children }: { children?: ReactNode }) {
  return (
    <div className="scenewin">
      <div className="scenewin__art">
        <span>No video</span>
        <div className="scenewin__eq">
          {[0, 0.2, 0.1, 0.3, 0.15].map((d, i) => (
            <i key={i} style={{ animationDelay: `${d}s` }} />
          ))}
        </div>
      </div>
      {children}
    </div>
  )
}

/** Chrome: liquid-metal blobs drift in the dark blue, a highlight runs around the screen edge, the video sits in a chrome bezel. */
function ChromeFx({ sparkles }: { sparkles: { x: number; y: number; s: number; d: number }[] }) {
  return (
    <div className="chromefx">
      <i className="chromefx__blob chromefx__blob--a" />
      <i className="chromefx__blob chromefx__blob--b" />
      <i className="chromefx__blob chromefx__blob--c" />
      {sparkles.map((p, i) => (
        <svg key={i} className="vibefx__spark" viewBox="-12 -12 24 24" style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s, animationDelay: `${p.d}s` }}>
          <path d="M0 -11 C1 -3 3 -1 11 0 C3 1 1 3 0 11 C-1 3 -3 1 -11 0 C-3 -1 -1 -3 0 -11Z" />
        </svg>
      ))}
      <div className="chromefx__bezel" />
      <SceneWindow>
        <div className="chromefx__gloss" />
      </SceneWindow>
      <div className="chromefx__edge" />
    </div>
  )
}

/** Neon: a rainy alley. The wall, street and fog are the backdrop; this is what moves in front: rain, ripples, the window frame
 *  (the video plays inside it) and a passing car's light sweeping the wall. */
function NeonAlley() {
  const rain = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => {
        const far = i % 3 !== 0
        return {
          left: (i * 37) % 112,
          w: far ? 1 : 1.8,
          h: far ? 5 + (i % 4) : 9 + (i % 4),
          dur: far ? 0.9 + (i % 5) * 0.1 : 0.55 + (i % 4) * 0.07,
          delay: -((i * 0.13) % 2),
          o: far ? 0.18 + (i % 4) / 16 : 0.35 + (i % 3) / 9
        }
      }),
    []
  )
  const rings = useMemo(() => Array.from({ length: 8 }, (_, i) => ({ left: 6 + ((i * 41) % 84), bottom: 2 + ((i * 5) % 14), delay: (i * 0.57) % 2.8 })), [])
  const drops = useMemo(() => Array.from({ length: 7 }, (_, i) => ({ left: (i * 47 + 9) % 92, top: (i * 23) % 50, dur: 5 + (i % 4) * 1.4, delay: -(i * 1.3), s: 0.7 + (i % 3) * 0.4 })), [])
  return (
    <div className="neonfx">
      <div className="neonfx__sweep" />
      <SceneWindow>
        <div className="neonfx__glass" />
        {drops.map((d, i) => (
          <i key={i} className="neonfx__drop" style={{ left: `${d.left}%`, top: `${d.top}%`, animationDuration: `${d.dur}s`, animationDelay: `${d.delay}s`, scale: d.s }} />
        ))}
      </SceneWindow>
      {rings.map((r, i) => (
        <i key={i} className="neonfx__ring" style={{ left: `${r.left}%`, bottom: `${r.bottom}%`, animationDelay: `${r.delay}s` }} />
      ))}
      <div className="neonfx__rain">
        {rain.map((r, i) => (
          <i key={i} style={{ left: `${r.left}%`, width: r.w, height: `${r.h}vh`, animationDuration: `${r.dur}s`, animationDelay: `${r.delay}s`, opacity: r.o }} />
        ))}
      </div>
    </div>
  )
}

/** Background effects of the active vibe. Pure decoration: sits behind the content and never takes input. */
export function VibeFx() {
  const { vibe } = useEffectiveVibe()
  const sparkles = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        x: (i * 37 + 11) % 100,
        y: (i * 53 + 7) % 100,
        s: 10 + ((i * 7) % 18),
        d: (i * 0.37) % 3
      })),
    []
  )
  if (vibe === 'none') return null
  return (
    <div className={`vibefx vibefx--${vibe}`} aria-hidden="true">
      <i className="vibeflash" key={vibe} />
      {vibe === 'arcade' && (
        <>
          <div className="vibefx__hud"><span>1UP</span><span className="vibefx__score" /><span>HI 099950</span></div>
          <div className="vibefx__stars" />
          <div className="vibefx__stars vibefx__stars--b" />
        </>
      )}
      {vibe === 'sunset' && (
        <>
          <div className="vibefx__sunset-sun" />
          <svg className="vibefx__palm vibefx__palm--l" viewBox="0 0 140 300"><path d={PALM} /></svg>
          <svg className="vibefx__palm vibefx__palm--r" viewBox="0 0 140 300"><path d={PALM} /></svg>
          <div className="vibefx__road" />
          <div className="vibefx__radio"><i /><i /><i /><b>LYRA FM 98.7</b></div>
          <div className="vibefx__stars-hud">★★★<s>★★</s></div>
        </>
      )}
      {vibe === 'blocks' && (
        <>
          <div className="vibefx__cloud vibefx__cloud--a" />
          <div className="vibefx__cloud vibefx__cloud--b" />
          <div className="vibefx__ground" />
          <div className="vibefx__hotbar">{Array.from({ length: 9 }, (_, i) => <i key={i} className={i === 2 ? 'on' : ''} />)}</div>
          <div className="vibefx__xp" />
        </>
      )}
      {vibe === 'stadium' && (
        <>
          <div className="vibefx__pitch" />
          <div className="vibefx__flood vibefx__flood--l" />
          <div className="vibefx__flood vibefx__flood--r" />
          <Scoreboard />
        </>
      )}
      {vibe === 'cassette' && (
        <svg className="vibefx__tape" viewBox="0 0 320 200" aria-hidden="true">
          <rect x="4" y="4" width="312" height="192" rx="18" />
          <rect x="40" y="26" width="240" height="64" rx="8" className="lbl" />
          <text x="160" y="66" textAnchor="middle">SIDE A</text>
          <g className="reels"><circle cx="100" cy="132" r="26" className="reel" /><circle cx="220" cy="132" r="26" className="reel" /><path d="M100 112v40M80 132h40M220 112v40M200 132h40" /></g>
          <rect x="120" y="164" width="80" height="22" rx="4" className="win" />
        </svg>
      )}
      {vibe === 'trailer' && (
        <>
          <div className="vibefx__bar vibefx__bar--t" />
          <div className="vibefx__bar vibefx__bar--b" />
          <div className="vibefx__flare" />
        </>
      )}
      {vibe === 'noir' && (
        <>
          <div className="vibefx__bar vibefx__bar--t" />
          <div className="vibefx__bar vibefx__bar--b" />
          <div className="vibefx__dust" />
        </>
      )}
      {vibe === 'paper' && <div className="vibefx__lines" />}
      {vibe === 'sketch' && (
        <>
          <div className="vibefx__paper" />
          <svg className="vibefx__pencil" viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <path d="M40 150 C90 90 170 80 230 110 C190 120 120 130 70 170" />
            <path d="M60 160 C120 130 190 130 260 120" />
            <path d="M250 70 C300 40 340 60 360 100 C330 90 290 90 250 110" />
            <path d="M110 40 C150 20 190 25 215 55 M120 52 C150 38 185 40 205 62 M130 62 C155 52 180 54 196 70" />
            <circle cx="205" cy="112" r="15" />
            <circle cx="205" cy="112" r="6" className="dot" />
          </svg>
        </>
      )}
      {vibe === 'stencil' && (
        <>
          <div className="vibefx__concrete" />
          <div className="vibefx__drips" />
        </>
      )}
      {vibe === 'film' && (
        <>
          <div className="vibefx__grain" />
          <div className="vibefx__leak" />
          <div className="vibefx__flicker" />
          <div className="vibefx__strip vibefx__strip--l" />
          <div className="vibefx__strip vibefx__strip--r" />
        </>
      )}
      {vibe === 'comic' && (
        <>
          <div className="vibefx__halftone" />
          <div className="vibefx__rays" />
        </>
      )}
      {vibe === 'glitch' && (
        <>
          <div className="vibefx__scan" />
          <div className="vibefx__tear" />
          <div className="vibefx__rgb" />
        </>
      )}
      {vibe === 'neon' && <NeonAlley />}
      {vibe === 'crt' && <div className="vibefx__scan" />}
      {vibe === 'dream' && (
        <>
          <i className="vibefx__orb vibefx__orb--a" />
          <i className="vibefx__orb vibefx__orb--b" />
          <i className="vibefx__orb vibefx__orb--c" />
        </>
      )}
      {vibe === 'chrome' && <ChromeFx sparkles={sparkles} />}
      {vibe === 'sticker' && <div className="vibefx__dots" />}
    </div>
  )
}
