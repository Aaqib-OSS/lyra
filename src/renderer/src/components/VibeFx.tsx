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

/** Arcade: the video plays on a CRT in a cabinet, a score ticks with the song, marquee bulbs chase around the screen. */
function ArcadeFx() {
  const track = usePlayer((x) => x.snapshot?.track ?? null)
  const [t, setT] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setT(getPosition()), 1000)
    return () => clearInterval(id)
  }, [])
  const score = String(Math.floor(t / 1000) * 100).padStart(6, '0')
  const hi = String(Math.floor((track?.durationMs ?? 0) / 1000) * 100).padStart(6, '0')
  return (
    <div className="arcadefx">
      <div className="vibefx__stars" />
      <div className="vibefx__stars vibefx__stars--b" />
      <div className="arcadefx__hud">
        <span>1UP <b>{score}</b></span>
        <span className="arcadefx__coin">INSERT COIN</span>
        <span>HI <b>{hi}</b></span>
      </div>
      <SceneWindow>
        <div className="arcadefx__crt" />
      </SceneWindow>
      <div className="arcadefx__bulbs arcadefx__bulbs--t" />
      <div className="arcadefx__bulbs arcadefx__bulbs--r" />
      <div className="arcadefx__bulbs arcadefx__bulbs--b" />
      <div className="arcadefx__bulbs arcadefx__bulbs--l" />
    </div>
  )
}

/** Sunset Drive, fullscreen: golden hour. Warm haze and soft light rays, dust in the light, the video as a framed print. */
function GoldenHour() {
  const motes = useMemo(() => Array.from({ length: 26 }, (_, i) => ({ left: (i * 41 + 7) % 100, bottom: (i * 29) % 60, size: 2 + (i % 3), dur: 14 + (i % 7) * 3, delay: -((i * 1.7) % 20) })), [])
  return (
    <div className="sunsetfx">
      <i className="sunsetfx__ray sunsetfx__ray--a" />
      <i className="sunsetfx__ray sunsetfx__ray--b" />
      <i className="sunsetfx__ray sunsetfx__ray--c" />
      <div className="sunsetfx__hills" />
      {motes.map((m, i) => (
        <i key={i} className="sunsetfx__mote" style={{ left: `${m.left}%`, bottom: `${m.bottom}%`, width: m.size, height: m.size, animationDuration: `${m.dur}s`, animationDelay: `${m.delay}s` }} />
      ))}
      <SceneWindow>
        <div className="sunsetfx__glass" />
      </SceneWindow>
      <div className="sunsetfx__haze" />
    </div>
  )
}

/** Trailer, fullscreen: a letterboxed screen with a grade, light leaks, an anamorphic streak and film grain. */
function TrailerFx() {
  return (
    <div className="trailerfx">
      <SceneWindow>
        <div className="trailerfx__grade" />
        <i className="trailerfx__leak trailerfx__leak--a" />
        <i className="trailerfx__leak trailerfx__leak--b" />
      </SceneWindow>
      <div className="trailerfx__streak" />
      <div className="trailerfx__grain" />
    </div>
  )
}

/** Sketchbook, fullscreen: a notebook spread. A pencil frame draws itself, doodles sketch in and out, the video is a taped print. */
function SketchFx() {
  return (
    <div className="sketchfx">
      <div className="sketchfx__paper" />
      <div className="sketchfx__rules" />
      <div className="sketchfx__spine" />
      <svg className="sketchfx__frame" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">
        <rect x="14" y="14" width="972" height="532" rx="6" pathLength="1" />
        <rect x="20" y="19" width="962" height="524" rx="8" pathLength="1" />
      </svg>
      <svg className="sketchfx__doodle" viewBox="0 0 60 60" style={{ left: '3vw', bottom: '5vh', ['--d' as string]: '0s' }} aria-hidden="true">
        <path pathLength="1" className="red" d="M30 6 L36 24 L55 24 L40 35 L46 54 L30 42 L14 54 L20 35 L5 24 L24 24 Z" />
      </svg>
      <svg className="sketchfx__doodle" viewBox="0 0 90 40" style={{ left: '22vw', bottom: '4vh', width: '14vh', ['--d' as string]: '2s' }} aria-hidden="true">
        <path pathLength="1" d="M4 24 C24 8 46 36 70 18 M60 8 L74 18 L58 28" />
      </svg>
      <svg className="sketchfx__doodle" viewBox="0 0 60 60" style={{ left: '44vw', top: '4vh', ['--d' as string]: '4s' }} aria-hidden="true">
        <path pathLength="1" d="M30 30 C30 24 38 24 38 30 C38 40 22 40 22 28 C22 14 42 14 44 32 C46 50 14 52 12 28" />
      </svg>
      <svg className="sketchfx__doodle" viewBox="0 0 60 60" style={{ right: '3vw', bottom: '4vh', ['--d' as string]: '1s' }} aria-hidden="true">
        <path pathLength="1" className="red" d="M30 50 C6 34 8 14 22 14 C28 14 30 20 30 20 C30 20 32 14 38 14 C52 14 54 34 30 50 Z" />
      </svg>
      <svg className="sketchfx__doodle" viewBox="0 0 90 30" style={{ left: '30vw', top: '3.5vh', width: '16vh', ['--d' as string]: '6s' }} aria-hidden="true">
        <path pathLength="1" d="M4 16 C14 4 22 28 32 16 C42 4 50 28 60 16 C70 4 78 24 86 14" />
      </svg>
      <i className="sketchfx__tape sketchfx__tape--l" />
      <i className="sketchfx__tape sketchfx__tape--r" />
      <SceneWindow />
    </div>
  )
}

/** Glitch, fullscreen: a dying tape. Static crawls, a tracking bar rolls up, slices tear, the edges bleed red and cyan. */
function GlitchFx() {
  return (
    <div className="glitchfx">
      <div className="glitchfx__static" />
      <SceneWindow>
        <div className="glitchfx__glass" />
        <div className="glitchfx__slice" />
      </SceneWindow>
      <div className="glitchfx__scan" />
      <div className="glitchfx__track" />
      <div className="glitchfx__tear glitchfx__tear--a" />
      <div className="glitchfx__tear glitchfx__tear--b" />
      <div className="glitchfx__edge" />
      <div className="glitchfx__drop" />
    </div>
  )
}

/** Pop Comic, fullscreen: a printed page. A burst turns slowly, halftone dots, a panel with a caption box, starbursts in the corners. */
function ComicFx() {
  return (
    <div className="comicfx">
      <div className="comicfx__bg">
        <div className="comicfx__rays" />
        <div className="comicfx__dots" />
        <div className="comicfx__dots comicfx__dots--b" />
      </div>
      <SceneWindow />
      <div className="comicfx__caption">Now playing!</div>
      <div className="comicfx__pow comicfx__pow--a"><span>POW!</span></div>
      <div className="comicfx__pow comicfx__pow--b"><span>ZAP!</span></div>
      <div className="comicfx__pow comicfx__pow--c"><span>WOW!</span></div>
      <div className="comicfx__page" />
    </div>
  )
}

/** Stencil, fullscreen: a concrete street wall. Stains, a wheat-pasted poster for the video, paint running down from the top. */
function StencilFx() {
  const drips = useMemo(() => Array.from({ length: 9 }, (_, i) => ({ left: 6 + ((i * 11 + 7) % 90), h: 8 + ((i * 7) % 5) * 5, d: -((i * 1.9) % 16) })), [])
  return (
    <div className="stencilfx">
      <div className="stencilfx__concrete" />
      <i className="stencilfx__stain stencilfx__stain--a" />
      <i className="stencilfx__stain stencilfx__stain--b" />
      <SceneWindow>
        <div className="stencilfx__wrinkle" />
      </SceneWindow>
      {drips.map((p, i) => (
        <i key={i} className="stencilfx__drip" style={{ left: `${p.left}%`, ['--h' as string]: `${p.h}vh`, ['--d' as string]: `${p.d}s` }} />
      ))}
      <div className="stencilfx__vignette" />
    </div>
  )
}

/** Film Reel, fullscreen: a strip of film in a projector. Sprocket holes keep running, grain, dust, scratches, flicker, light leaks. */
function FilmFx() {
  return (
    <div className="filmfx">
      <div className="filmfx__leak filmfx__leak--a" />
      <div className="filmfx__leak filmfx__leak--b" />
      <div className="filmfx__strip">
        <div className="filmfx__holes filmfx__holes--t" />
        <div className="filmfx__holes filmfx__holes--b" />
        <div className="filmfx__frames" />
      </div>
      <SceneWindow>
        <div className="filmfx__gate" />
      </SceneWindow>
      <div className="filmfx__edge">KODAK SAFETY FILM · 5063 · 12A</div>
      <i className="filmfx__scratch filmfx__scratch--a" />
      <i className="filmfx__scratch filmfx__scratch--b" />
      <div className="filmfx__flicker" />
      <div className="filmfx__grain" />
    </div>
  )
}

/** Film Strip (draft B): the film moves. The strip advances one frame at a time, right to left, as the song plays. */
function FilmStripFx() {
  const duration = usePlayer((x) => x.snapshot?.track?.durationMs ?? 0)
  useEffect(() => {
    const root = document.documentElement
    const N = 5
    const tick = (): void => {
      const p = duration > 0 ? Math.min(0.999, getPosition() / duration) : 0
      root.style.setProperty('--film-k', String(Math.floor(p * N)))
    }
    tick()
    const id = setInterval(tick, 400)
    return () => {
      clearInterval(id)
      root.style.removeProperty('--film-k')
    }
  }, [duration])
  return (
    <div className="filmstripfx">
      <div className="filmstripfx__strip">
        <div className="filmstripfx__holes filmstripfx__holes--t" />
        <div className="filmstripfx__holes filmstripfx__holes--b" />
        <div className="filmstripfx__frames" />
      </div>
      <SceneWindow>
        <div className="filmstripfx__gate" />
      </SceneWindow>
      <div className="filmstripfx__edge">KODAK SAFETY FILM · 5063 · 12A</div>
      <div className="filmstripfx__grain" />
    </div>
  )
}

/** Dream, fullscreen: the video is a blurred dreamscape, soft orbs drift over it, an aurora glow breathes at the edge. */
function DreamFx() {
  const dust = useMemo(() => Array.from({ length: 18 }, (_, i) => ({ left: (i * 37 + 9) % 100, top: 30 + ((i * 23) % 65), dur: 9 + (i % 6) * 2, delay: -((i * 1.3) % 12) })), [])
  return (
    <div className="dreamfx">
      <i className="vibefx__orb vibefx__orb--a" />
      <i className="vibefx__orb vibefx__orb--b" />
      <i className="vibefx__orb vibefx__orb--c" />
      <SceneWindow />
      {dust.map((d, i) => (
        <i key={i} className="dreamfx__dust" style={{ left: `${d.left}%`, top: `${d.top}%`, animationDuration: `${d.dur}s`, animationDelay: `${d.delay}s` }} />
      ))}
      <div className="dreamfx__aurora" />
    </div>
  )
}

/** Terminal, fullscreen: tmux panes with titles, scanlines, a rolling bar, a curved-glass vignette, a blinking cursor. */
function TermFx() {
  return (
    <div className="termfx">
      <SceneWindow />
      <div className="termfx__pane termfx__pane--video" data-title="video.mp4" />
      <div className="termfx__pane termfx__pane--log" data-title="lyrics.log" />
      <div className="termfx__cursor" />
      <div className="termfx__roll" />
      <div className="termfx__scan" />
      <div className="termfx__glass" />
    </div>
  )
}

/** Stickers, fullscreen: a sticker sheet. A dot grid, loose die-cut stickers drifting, a peeling corner on the video sticker. */
const STICKER_SHAPES = [
  { d: 'M50 6 L61 38 L95 38 L67 58 L78 92 L50 71 L22 92 L33 58 L5 38 L39 38 Z', fill: '#ffd84a' },
  { d: 'M50 88 C10 60 6 30 28 22 C40 18 48 26 50 32 C52 26 60 18 72 22 C94 30 90 60 50 88 Z', fill: '#ff6fb0' },
  { d: 'M50 10 A40 40 0 1 1 49.9 10 Z M34 40 A5 5 0 1 0 34 41 Z M66 40 A5 5 0 1 0 66 41 Z', fill: '#4de3ff' },
  { d: 'M20 80 L50 14 L80 80 Z', fill: '#c6ff3d' },
  { d: 'M12 50 C12 20 40 12 50 36 C60 12 88 20 88 50 C88 80 60 88 50 64 C40 88 12 80 12 50 Z', fill: '#b794ff' }
]
function StickerFx() {
  const loose = useMemo(
    () => Array.from({ length: 9 }, (_, i) => ({ shape: STICKER_SHAPES[i % STICKER_SHAPES.length]!, left: 44 + ((i * 53 + 5) % 48), top: 4 + ((i * 37 + 8) % 82), s: 6 + ((i * 5) % 7), d: -((i * 1.7) % 11), r0: -14 + ((i * 9) % 20), r1: 6 + ((i * 7) % 24) })),
    []
  )
  return (
    <div className="stickerfx">
      <div className="stickerfx__dots" />
      {loose.map((l, i) => (
        <svg key={i} className="stickerfx__loose" viewBox="0 0 100 100" style={{ left: `${l.left}%`, top: `${l.top}%`, ['--s' as string]: `${l.s}vh`, ['--d' as string]: `${l.d}s`, ['--r0' as string]: `${l.r0}deg`, ['--r1' as string]: `${l.r1}deg` }}>
          <path d={l.shape.d} fill={l.shape.fill} fillRule="evenodd" />
        </svg>
      ))}
      <div className="stickerfx__cut" />
      <SceneWindow />
      <div className="stickerfx__peel" />
    </div>
  )
}

/** DM, fullscreen: the video is a story in a slowly turning gradient ring, soft blue glows behind the thread. */
function DmFx() {
  return (
    <div className="dmfx">
      <i className="dmfx__glow dmfx__glow--a" />
      <i className="dmfx__glow dmfx__glow--b" />
      <SceneWindow />
      <div className="dmfx__ring" />
    </div>
  )
}

/** Diary, fullscreen: a cosy night corner. Fairy lights glow out of focus, a twine line with clothespins, a polaroid for the video. */
function DiaryFx() {
  const title = usePlayer((x) => x.snapshot?.track?.title ?? '')
  const bokeh = useMemo(() => Array.from({ length: 16 }, (_, i) => ({ left: 4 + ((i * 41 + 13) % 92), top: 1 + ((i * 17) % 22), s: 2.2 + ((i * 7) % 6) * 0.9, b: (i % 3) * 2 + 1, d: -((i * 0.7) % 4) })), [])
  return (
    <div className="diaryfx">
      {bokeh.map((b, i) => (
        <i key={i} className="diaryfx__bokeh" style={{ left: `${b.left}%`, top: `${b.top}%`, ['--s' as string]: `${b.s}vh`, ['--b' as string]: `${b.b}px`, ['--d' as string]: `${b.d}s` }} />
      ))}
      <svg className="diaryfx__twine" viewBox="0 0 1000 140" preserveAspectRatio="none" aria-hidden="true">
        <path d="M-10 30 C200 110 360 110 520 62 C680 14 820 110 1010 40" />
      </svg>
      <SceneWindow />
      <div className="diaryfx__polaroid" />
      <div className="diaryfx__caption">{title}</div>
    </div>
  )
}

/** Cinema, fullscreen: a black-and-white screening. Venetian-blind light drifts, grain, a projector flicker, a beam with dust. */
function NoirFx() {
  const dust = useMemo(() => Array.from({ length: 22 }, (_, i) => ({ left: 8 + ((i * 37 + 5) % 84), top: 30 + ((i * 19) % 62), dur: 8 + (i % 6) * 2, delay: -((i * 1.1) % 12) })), [])
  return (
    <div className="noirfx">
      <i className="noirfx__beam" />
      <SceneWindow />
      <div className="noirfx__blinds" />
      {dust.map((d, i) => (
        <i key={i} className="noirfx__dust" style={{ left: `${d.left}%`, top: `${d.top}%`, animationDuration: `${d.dur}s`, animationDelay: `${d.delay}s` }} />
      ))}
      <div className="noirfx__vignette" />
      <div className="noirfx__flicker" />
      <div className="noirfx__grain" />
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
      {vibe === 'arcade' && <ArcadeFx />}
      {vibe === 'sunset' && (
        <>
          <div className="vibefx__sunset-sun" />
          <svg className="vibefx__palm vibefx__palm--l" viewBox="0 0 140 300"><path d={PALM} /></svg>
          <svg className="vibefx__palm vibefx__palm--r" viewBox="0 0 140 300"><path d={PALM} /></svg>
          <div className="vibefx__road" />
          <div className="vibefx__radio"><i /><i /><i /><b>LYRA FM 98.7</b></div>
          <div className="vibefx__stars-hud">★★★<s>★★</s></div>
          <GoldenHour />
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
          <TrailerFx />
        </>
      )}
      {vibe === 'noir' && <NoirFx />}
      {vibe === 'paper' && <DiaryFx />}
      {vibe === 'sketch' && <SketchFx />}
      {vibe === 'stencil' && <StencilFx />}
      {vibe === 'film' && <FilmFx />}
      {vibe === 'comic' && <ComicFx />}
      {vibe === 'glitch' && <GlitchFx />}
      {vibe === 'neon' && <NeonAlley />}
      {vibe === 'crt' && <TermFx />}
      {vibe === 'dream' && <DreamFx />}
      {vibe === 'filmstrip' && <FilmStripFx />}
      {vibe === 'chrome' && <ChromeFx sparkles={sparkles} />}
      {vibe === 'sticker' && <StickerFx />}
      {vibe === 'chat' && <DmFx />}
    </div>
  )
}
