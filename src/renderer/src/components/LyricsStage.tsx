import { memo, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { LyricLine, LyricStyle } from '@shared/types'
import { useFrame } from '@/hooks/useLyricsSync'
import { useLyricOffset } from '@/store/offsets'
import { lyricPosition } from '@/hooks/useLyricsSync'

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
      {mode === 'kinetic' ? (
        <AnimatePresence>{live && <Kinetic key={active} line={live} index={active} nextTime={lines[active + 1]?.timeMs} />}</AnimatePresence>
      ) : (
        <Constellations lines={lines} active={active} />
      )}
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
