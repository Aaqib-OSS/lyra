import { Fragment, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { LyricLine } from '@shared/types'
import { activeIndex, countInAt, inBreak, wordFills, type Span } from '@core/karaoke/countIn'

/**
 * The lyrics of the karaoke screen. Cheap by design: React renders only when the LINE changes (about once every few
 * seconds) or the count-in number changes (once a second). Everything that moves smoothly (the fill of each word, the
 * count-in ring, the song progress) is a CSS custom property written straight to the element from one
 * requestAnimationFrame loop that runs at ~30 Hz and reads the clock from a function, never from React state.
 */
interface Props {
  lines: LyricLine[]
  spans: Span[]
  /** song position in ms, lyrics timing nudge included */
  getPos(): number
  /** song length in ms (0 unknown), for the progress hairline */
  getLength(): number
  /** playback speed (the count-in beats stretch with it) */
  rate: number
}

const FRAME_MS = 33

export function KaraokeStage({ lines, spans, getPos, getLength, rate }: Props): ReactElement {
  const [active, setActive] = useState(-1)
  const [count, setCount] = useState(0)
  const [brk, setBrk] = useState(false)
  const wordEls = useRef<Array<HTMLElement | null>>([])
  const ringRef = useRef<HTMLDivElement | null>(null)
  const barRef = useRef<HTMLElement | null>(null)
  const rateRef = useRef(rate)
  rateRef.current = rate

  const starts = useMemo(() => spans.map((s) => s.startMs), [spans])
  const wordStarts = useMemo(() => lines.map((l) => (l.words && l.words.length > 1 ? l.words.map((w) => w.timeMs) : [l.timeMs])), [lines])

  useEffect(() => {
    let raf = 0
    let last = -FRAME_MS
    let shown = -2
    const fills: number[] = []
    const tick = (ts: number): void => {
      raf = requestAnimationFrame(tick)
      if (ts - last < FRAME_MS) return
      last = ts
      const pos = getPos()
      const a = activeIndex(starts, pos)
      setActive(a)
      const ci = countInAt(spans, pos, rateRef.current)
      setCount(ci ? ci.n : 0)
      setBrk(inBreak(spans, pos))
      if (ringRef.current) ringRef.current.style.setProperty('--beat', (ci ? ci.beat : 0).toFixed(3))
      const len = getLength()
      if (barRef.current && len > 0) barRef.current.style.transform = `scaleX(${Math.max(0, Math.min(1, pos / len)).toFixed(4)})`
      if (a !== shown) {
        // a new line is rendered next: its word elements do not exist yet
        shown = a
        fills.length = 0
        return
      }
      const ws = wordStarts[a]
      const end = spans[a]?.endMs
      if (!ws || end === undefined) return
      const f = wordFills(ws, end, pos)
      for (let k = 0; k < f.length; k++) {
        if (Math.abs((fills[k] ?? -1) - f[k]!) < 0.004) continue
        fills[k] = f[k]!
        wordEls.current[k]?.style.setProperty('--p', f[k]!.toFixed(3))
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [starts, spans, wordStarts, getPos, getLength])

  const slots = [active - 1, active, active + 1, active + 2]
  const lineText = (l: LyricLine): string => l.text || '♪'

  return (
    <div className="k2-stage">
      <div className="k2-lines" aria-live="off">
        {slots.map((i, slot) => {
          const l = lines[i]
          if (!l) return <div key={`e${slot}`} className="k2-line k2-line--empty" aria-hidden />
          if (i === active) {
            const words = l.words && l.words.length > 1 ? l.words : [{ text: l.text, timeMs: l.timeMs }]
            wordEls.current.length = words.length
            return (
              <div key={i} className="k2-line k2-line--now">
                {l.text
                  ? words.map((w, k) => (
                      <Fragment key={k}>
                        <span className="k2-w">
                          <span className="k2-w__t">{w.text}</span>
                          <span className="k2-w__f" aria-hidden ref={(el) => { wordEls.current[k] = el }}>{w.text}</span>
                        </span>{' '}
                      </Fragment>
                    ))
                  : '♪'}
              </div>
            )
          }
          const cls = i < active ? 'k2-line--past' : i === active + 1 || (active < 0 && i === 0) ? (brk || count > 0 || active < 0 ? 'k2-line--up' : 'k2-line--next') : 'k2-line--later'
          return <div key={i} className={`k2-line ${cls}`}>{lineText(l)}</div>
        })}
      </div>
      <div className={`k2-count ${count ? 'is-on' : ''}`} ref={ringRef} aria-hidden={!count} role="status" aria-label={count ? `Get ready ${count}` : undefined}>
        <span key={count}>{count || ''}</span>
      </div>
      {brk && !count && <div className="k2-break" aria-label="Instrumental"><i /><i /><i /></div>}
      <div className="k2-bar" aria-hidden><i ref={barRef} /></div>
    </div>
  )
}
