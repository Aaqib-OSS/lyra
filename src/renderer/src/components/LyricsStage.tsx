import { memo, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { LyricLine, LyricStyle } from '@shared/types'
import { useFrame } from '@/hooks/useLyricsSync'
import { useLyricOffset } from '@/store/offsets'
import { lyricPosition } from '@/hooks/useLyricsSync'
import { useArtwork } from '@/hooks/useArtwork'
import { usePlayer } from '@/store/player'
import { clamp } from '@/lib/format'

/**
 * Staged lyrics for fullscreen: one phrase at a time instead of a scrolling list.
 *  - kinetic: giant type, words slice in as they are sung, the layout changes from phrase to phrase
 *  - constellation: every word is a star, joined to the last one as it is sung
 */

interface StageWord {
  text: string
  start: number
  end: number
}

/** Real word timing when the source has it, otherwise spread the words across the line by their length. */
function stageWords(line: LyricLine, nextTime: number | undefined): StageWord[] {
  const end = line.endMs ?? nextTime ?? line.timeMs + 4000
  if (line.words && line.words.length > 0) {
    return line.words.map((w, i) => ({
      text: w.text.trim(),
      start: w.timeMs,
      end: Math.min(line.words![i + 1]?.timeMs ?? end, end)
    }))
  }
  const parts = line.text.split(/\s+/).filter(Boolean)
  const total = parts.reduce((n, w) => n + w.length + 1, 0)
  const span = Math.max(600, (end - line.timeMs) * 0.85)
  let acc = 0
  return parts.map((text) => {
    const start = line.timeMs + (acc / total) * span
    acc += text.length + 1
    return { text, start, end: line.timeMs + (acc / total) * span }
  })
}

function hash(n: number, text: string): number {
  let h = 2166136261 ^ n
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}
function rng(seed: number): () => number {
  let a = seed || 1
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** How many of the words have started (re-renders only when that number changes). */
function useRevealed(words: StageWord[], startAtMax = false): number {
  const offset = useLyricOffset()
  const [n, setN] = useState(() => (startAtMax ? words.length : words.filter((w) => w.start <= lyricPosition(offset)).length))
  useFrame(
    (pos) => {
      if (startAtMax) return
      const p = pos + offset
      let c = 0
      for (const w of words) if (w.start - 40 <= p) c++
      setN((cur) => (cur === c ? cur : c))
    },
    !startAtMax,
    [words, offset, startAtMax]
  )
  return n
}

interface StageProps {
  lines: readonly LyricLine[]
  active: number
  mode: Exclude<LyricStyle, 'classic'>
}

export function LyricsStage({ lines, active, mode }: StageProps) {
  const line = active >= 0 ? lines[active] : undefined
  const live = line && line.text !== '' ? line : undefined
  return (
    <div className={`stage stage--${mode}`} aria-live="off">
      {mode === 'kinetic' && (
        <AnimatePresence>{live && <Kinetic key={active} line={live} index={active} nextTime={lines[active + 1]?.timeMs} />}</AnimatePresence>
      )}
      {mode === 'constellation' && <Constellations lines={lines} active={active} />}
      {mode === 'sticker' && (
        <AnimatePresence>{live && <Stickers key={active} line={live} index={active} nextTime={lines[active + 1]?.timeMs} />}</AnimatePresence>
      )}
      {mode === 'chat' && <Chat lines={lines} active={active} />}
      {mode === 'type' && <Typewriter lines={lines} active={active} />}
      {active >= 0 && !live && (
        <div className="stage__rest" aria-label="instrumental break">
          <i />
          <i />
          <i />
        </div>
      )}
    </div>
  )
}

// ---------- kinetic ----------

const VARIANTS = ['stack', 'slab', 'outline', 'wide'] as const

function chunkRows(words: StageWord[]): StageWord[][] {
  const rows: StageWord[][] = []
  let cur: StageWord[] = []
  let len = 0
  for (const w of words) {
    if (cur.length && len + w.text.length > 13) {
      rows.push(cur)
      cur = []
      len = 0
    }
    cur.push(w)
    len += w.text.length + 1
  }
  if (cur.length) rows.push(cur)
  return rows
}

const Kinetic = memo(function Kinetic({ line, index, nextTime }: { line: LyricLine; index: number; nextTime: number | undefined }) {
  const words = useMemo(() => stageWords(line, nextTime), [line, nextTime])
  const revealed = useRevealed(words)
  const rows = useMemo(() => chunkRows(words), [words])
  const variant = VARIANTS[hash(index, line.text) % VARIANTS.length]!
  const chars = line.text.length
  const k = chars <= 12 ? 1 : chars <= 24 ? 0.78 : chars <= 40 ? 0.6 : 0.46
  const longest = words.reduce((b, w, i) => (w.text.length > (words[b]?.text.length ?? 0) ? i : b), 0)
  let idx = -1
  return (
    <motion.div
      className={`kin kin--${variant}`}
      style={{ ['--k' as string]: k }}
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(22px)', scale: 1.14, y: '-6%', transition: { duration: 0.42, ease: [0.5, 0, 0.9, 0.4] } }}
    >
      {rows.map((row, r) => (
        <div className="kin__row" key={r}>
          {row.map((w) => {
            idx++
            const i = idx
            const cls = ['kin__word', i < revealed ? 'is-in' : '', i === revealed - 1 ? 'is-now' : '', i === longest ? 'is-big' : '']
            const slab = variant === 'slab' && r === rows.length - 1 && w === row[row.length - 1]
            return (
              <span key={i} className={cls.join(' ') + (slab ? ' is-slab' : '')} data-text={w.text}>
                {w.text}
              </span>
            )
          })}
        </div>
      ))}
    </motion.div>
  )
})

// ---------- constellation ----------

function layout(line: LyricLine, index: number, count: number): Array<{ x: number; y: number }> {
  const rand = rng(hash(index, line.text))
  const pts: Array<{ x: number; y: number }> = []
  let lastY = 50
  for (let i = 0; i < count; i++) {
    const x = count === 1 ? 50 : 10 + (80 * i) / (count - 1) + (rand() - 0.5) * 7
    let y = 22 + rand() * 56
    if (Math.abs(y - lastY) < 14) y = y > 50 ? y - 20 : y + 20
    y = Math.min(84, Math.max(16, y))
    pts.push({ x, y })
    lastY = y
  }
  return pts
}

function Constellations({ lines, active }: { lines: readonly LyricLine[]; active: number }) {
  const idxs: number[] = []
  for (const i of [active - 1, active]) if (i >= 0 && lines[i] && lines[i]!.text !== '') idxs.push(i)
  return (
    <AnimatePresence>
      {idxs.map((i) => (
        <Constellation key={i} line={lines[i]!} index={i} nextTime={lines[i + 1]?.timeMs} ghost={i !== active} />
      ))}
    </AnimatePresence>
  )
}

const Constellation = memo(function Constellation({ line, index, nextTime, ghost }: { line: LyricLine; index: number; nextTime: number | undefined; ghost: boolean }) {
  const words = useMemo(() => stageWords(line, nextTime), [line, nextTime])
  const revealed = useRevealed(words, ghost)
  const pts = useMemo(() => layout(line, index, words.length), [line, index, words.length])
  return (
    <motion.div
      className={`con ${ghost ? 'is-ghost' : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: ghost ? 0.3 : 1, scale: ghost ? 0.94 : 1 }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(8px)' }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      <svg className="con__lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {pts.slice(1).map((p, i) => (
          <line
            key={i}
            x1={pts[i]!.x}
            y1={pts[i]!.y}
            x2={p.x}
            y2={p.y}
            pathLength={1}
            vectorEffect="non-scaling-stroke"
            className={i + 1 < revealed ? 'is-drawn' : ''}
          />
        ))}
      </svg>
      {words.map((w, i) => {
        const p = pts[i]!
        const left = p.x > 72
        return (
          <div
            key={i}
            className={`con__star ${i < revealed ? 'is-in' : ''} ${i === revealed - 1 && !ghost ? 'is-now' : ''} ${left ? 'is-left' : ''}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            <svg viewBox="-12 -12 24 24" aria-hidden="true">
              <path d="M0 -11 C1 -3 3 -1 11 0 C3 1 1 3 0 11 C-1 3 -3 1 -11 0 C-3 -1 -1 -3 0 -11Z" />
            </svg>
            <span>{w.text}</span>
          </div>
        )
      })}
    </motion.div>
  )
})

// ---------- sticker bomb ----------

const STICKER_COLORS = ['#c6ff3d', '#ff5fa2', '#4fd0ff', '#ffd23d', '#b48cff', '#ff8a3d']
const DECOS = [
  // burst
  'M50 4l9 20 21-9-7 22 22 5-19 12 14 17-23-2-1 23-16-16-16 16-1-23-23 2 14-17L2 42l22-5-7-22 21 9z',
  // heart
  'M50 90C8 58 6 30 28 18c12-6 22 0 22 12 0-12 10-18 22-12 22 12 20 40-22 72z',
  // smiley (face outline + eyes as one path)
  'M50 6a44 44 0 1 0 0 88 44 44 0 0 0 0-88zM34 36a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm32 0a6 6 0 1 1 0 12 6 6 0 0 1 0-12zM28 62c6 14 38 14 44 0-8 4-36 4-44 0z'
]

const Stickers = memo(function Stickers({ line, index, nextTime }: { line: LyricLine; index: number; nextTime: number | undefined }) {
  const words = useMemo(() => stageWords(line, nextTime), [line, nextTime])
  const revealed = useRevealed(words)
  const seed = hash(index, line.text)
  const rand = useMemo(() => rng(seed), [seed])
  const look = useMemo(
    () => words.map((_, i) => ({ rot: (rand() - 0.5) * 11, scale: 0.9 + rand() * 0.28, color: STICKER_COLORS[(i + seed) % STICKER_COLORS.length]! })),
    [words, rand, seed]
  )
  const decos = useMemo(
    () => [0, 1].map((n) => ({ d: DECOS[(seed + n) % DECOS.length]!, x: n ? 78 + rand() * 12 : 4 + rand() * 12, y: n ? 62 + rand() * 20 : 6 + rand() * 14, rot: (rand() - 0.5) * 50, c: STICKER_COLORS[(seed + n * 2 + 1) % STICKER_COLORS.length]! })),
    [seed, rand]
  )
  const chars = line.text.length
  const k = chars <= 12 ? 1 : chars <= 24 ? 0.82 : chars <= 40 ? 0.64 : 0.5
  return (
    <motion.div
      className="stk"
      style={{ ['--k' as string]: k }}
      exit={{ opacity: 0, rotate: 7, y: -80, scale: 0.92, transition: { duration: 0.4, ease: [0.5, 0, 0.9, 0.4] } }}
    >
      {decos.map((d, i) => (
        <svg key={i} className={`stk__deco ${revealed > i ? 'is-in' : ''}`} viewBox="0 0 100 100" style={{ left: `${d.x}%`, top: `${d.y}%`, ['--r' as string]: `${d.rot}deg`, fill: d.c }}>
          <path d={d.d} fillRule="evenodd" />
        </svg>
      ))}
      <div className="stk__words">
        {words.map((w, i) => (
          <span
            key={i}
            className={`stk__word ${i < revealed ? 'is-in' : ''} ${i === revealed - 1 ? 'is-now' : ''}`}
            style={{ ['--r' as string]: `${look[i]!.rot}deg`, ['--s' as string]: look[i]!.scale, background: look[i]!.color }}
          >
            {w.text}
          </span>
        ))}
      </div>
    </motion.div>
  )
})

// ---------- DM thread ----------

function Chat({ lines, active }: { lines: readonly LyricLine[]; active: number }) {
  const track = usePlayer((s) => s.snapshot?.track ?? null)
  const art = useArtwork(track?.artworkUrl ?? null)
  const shown: number[] = []
  for (let i = active; i >= 0 && shown.length < 4; i--) if (lines[i] && lines[i]!.text !== '') shown.unshift(i)
  const cur = shown[shown.length - 1]
  return (
    <div className="chat">
      <header className="chat__head">
        {art ? <img src={art} alt="" /> : <i />}
        <div>
          <b>{track?.artists[0] ?? 'Lyra'}</b>
          <span>{track?.title ?? ''}</span>
        </div>
      </header>
      <div className="chat__feed">
        <AnimatePresence initial={false}>
          {shown.map((i, n) => (
            <Bubble key={i} line={lines[i]!} nextTime={lines[i + 1]?.timeMs} side={i % 2 === 0 ? 'in' : 'out'} age={shown.length - 1 - n} live={i === cur} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

const Bubble = memo(function Bubble({ line, nextTime, side, age, live }: { line: LyricLine; nextTime: number | undefined; side: 'in' | 'out'; age: number; live: boolean }) {
  const words = useMemo(() => stageWords(line, nextTime), [line, nextTime])
  const revealed = useRevealed(words, !live)
  const typing = live && revealed === 0
  return (
    <motion.div
      layout="position"
      className={`bub bub--${side} ${live ? 'is-live' : ''}`}
      initial={{ opacity: 0, y: 40, scale: 0.7 }}
      animate={{ opacity: live ? 1 : Math.max(0.5, 0.85 - age * 0.14), y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -50, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.8 }}
    >
      <div className={`bub__body ${typing ? 'is-typing' : ''}`}>
        {typing && (
          <span className="bub__dots">
            <i />
            <i />
            <i />
          </span>
        )}
        <span className="bub__text">
          {words.map((w, i) => (
            <span key={i} className={i < revealed ? 'is-in' : ''}>
              {w.text}{' '}
            </span>
          ))}
        </span>
      </div>
      {live && revealed >= words.length && <small className="bub__read">Read ✓✓</small>}
    </motion.div>
  )
})

// ---------- terminal ----------

function Typewriter({ lines, active }: { lines: readonly LyricLine[]; active: number }) {
  const track = usePlayer((s) => s.snapshot?.track ?? null)
  const offset = useLyricOffset()
  const typed = useRef<HTMLSpanElement>(null)
  const bar = useRef<HTMLSpanElement>(null)
  const cur = active >= 0 ? lines[active] : undefined
  const text = cur?.text ?? ''
  const prev: number[] = []
  for (let i = active - 1; i >= 0 && prev.length < 4; i--) if (lines[i] && lines[i]!.text !== '') prev.unshift(i)
  const end = cur ? (cur.endMs ?? lines[active + 1]?.timeMs ?? cur.timeMs + 4000) : 0

  useFrame(
    (pos) => {
      if (!cur || !typed.current) return
      const p = clamp((pos + offset - cur.timeMs) / Math.max(400, (end - cur.timeMs) * 0.8), 0, 1)
      typed.current.textContent = text.slice(0, Math.ceil(p * text.length))
      const dur = track?.durationMs
      if (bar.current && dur) {
        const filled = Math.round(clamp((pos + offset) / dur, 0, 1) * 24)
        bar.current.textContent = '█'.repeat(filled) + '░'.repeat(24 - filled)
      }
    },
    true,
    [cur, text, end, offset, track?.durationMs]
  )
  return (
    <div className="term">
      <div className="term__head">
        <span>LYRA.SYS</span>
        <span>▸ {track ? `${track.title} — ${track.artists[0]}` : 'standby'}</span>
        <span className="term__bar" ref={bar} />
      </div>
      <div className="term__log">
        {prev.map((i) => (
          <div key={i} className="term__old">
            <em>{String(i + 1).padStart(3, '0')}</em> {lines[i]!.text}
          </div>
        ))}
        {cur && text !== '' ? (
          <div className="term__now" key={active}>
            <em>{String(active + 1).padStart(3, '0')}</em> <b>&gt;</b> <span ref={typed} />
            <i className="term__caret" />
          </div>
        ) : (
          <div className="term__now">
            <b>&gt;</b> <i className="term__caret" />
          </div>
        )}
      </div>
    </div>
  )
}
