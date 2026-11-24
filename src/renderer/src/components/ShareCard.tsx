import { useEffect, useMemo, useRef, useState } from 'react'
import type { LyricLine } from '@shared/types'
import { momentCaption } from '@shared/moments'
import { cardDataUrl, cardTheme, drawCard, FORMAT_H, type CardFormat } from '@/lib/shareCard'
import { useEffectiveVibe } from '@/hooks/useVibe'
import { usePlayer } from '@/store/player'
import { useUi } from '@/store/ui'

/** Pick up to three lines around the one you tapped, preview the card, then save, copy or share it. */
export function ShareCard({ lines, index, onClose }: { lines: LyricLine[]; index: number; onClose(): void }) {
  const track = usePlayer((s) => s.snapshot?.track)
  const { vibe } = useEffectiveVibe()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [from, setFrom] = useState(index)
  const [count, setCount] = useState(1)
  const [look, setLook] = useState<'classic' | 'doodle'>('doodle')
  const [format, setFormat] = useState<CardFormat>('story')
  const chain = useRef<Promise<unknown>>(Promise.resolve()) // draws run one after another so two never paint over each other
  const box = useRef<HTMLDivElement>(null)
  const android = document.documentElement.dataset.platform === 'android'
  const text = useMemo(
    () =>
      lines
        .slice(from, from + count)
        .map((l) => l.text)
        .filter(Boolean),
    [lines, from, count]
  )

  useEffect(() => {
    if (!track || !canvas.current || text.length === 0) return
    const css = getComputedStyle(document.documentElement)
    const el = canvas.current
    chain.current = chain.current.then(() => drawCard(el, {
      lines: text,
      title: track.title,
      artist: track.artists.join(', '),
      artworkUrl: track.artworkUrl,
      accent: css.getPropertyValue('--accent').trim() || '#d8d8d8',
      tint1: css.getPropertyValue('--tint1').trim() || '#1a1a1a',
      tint2: css.getPropertyValue('--tint2').trim() || '#101010',
      style: look,
      theme: cardTheme(vibe), // the card wears the vibe you are looking at
      format
    })).catch(() => undefined)
  }, [track, text, look, vibe, format])

  useEffect(() => {
    box.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  if (!track) return null
  const toast = useUi.getState().toast
  const name = `lyra-${track.title.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40)}.png`
  const data = (): string | null => {
    try {
      return cardDataUrl(canvas.current!)
    } catch {
      toast('Couldn’t make the image (the cover blocks it). Try another song', 'error')
      return null
    }
  }
  const copyText = async (): Promise<void> => {
    // the words plus song and artist; deliberately no link, nothing about you
    const ok = await window.lyra.app.copy(momentCaption(text.join(' / '), track.title, track.artists.join(', ')))
    toast(ok ? 'Text copied' : 'Couldn’t copy the text', ok ? 'info' : 'error')
  }
  const act = async (kind: 'save' | 'copy' | 'share'): Promise<void> => {
    const url = data()
    if (!url) return
    if (kind === 'copy') {
      toast((await window.lyra.app.copyImage(url)) ? 'Image copied. Paste it anywhere' : 'Couldn’t copy the image', 'info')
    } else {
      const r = await window.lyra.app.shareImage(url, name)
      if (r === 'saved') toast('Card saved')
      else if (r === 'failed') toast('Couldn’t save the card. Pick another folder or copy the image instead', 'error')
    }
  }

  return (
    <div className="sharecard" role="dialog" aria-label="Share a lyric card" aria-modal="true" data-nodrag>
      <div className="sharecard__box" ref={box} tabIndex={-1}>
        <header>
          <b>Share a lyric card</b>
          <button type="button" className="ibtn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        <canvas ref={canvas} className="sharecard__canvas" style={{ aspectRatio: `1080 / ${FORMAT_H[format]}` }} role="img" aria-label={`Preview of the card: ${text.join(' ')}`} />
        <div className="sharecard__row">
          <span>Lines</span>
          <div className="seg" role="group" aria-label="Number of lines">
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" aria-pressed={count === n} className={count === n ? 'is-on' : ''} onClick={() => setCount(n)}>
                {n}
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Card style">
            {(['doodle', 'classic'] as const).map((k) => (
              <button key={k} type="button" aria-pressed={look === k} className={look === k ? 'is-on' : ''} onClick={() => setLook(k)}>
                {k === 'doodle' ? 'Doodle' : 'Classic'}
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Card size">
            {([['story', 'Story'], ['portrait', '4:5'], ['square', 'Square']] as const).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={format === k} className={format === k ? 'is-on' : ''} onClick={() => setFormat(k)}>
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="pill" disabled={from <= 0} onClick={() => setFrom((f) => Math.max(0, f - 1))}>
            ↑ Earlier
          </button>
          <button type="button" className="pill" disabled={from + count >= lines.length} onClick={() => setFrom((f) => f + 1)}>
            ↓ Later
          </button>
        </div>
        <div className="sharecard__row sharecard__row--end">
          <button type="button" className="pill" onClick={() => void copyText()}>
            Copy text
          </button>
          {!android && (
            <button type="button" className="pill" onClick={() => void act('copy')}>
              Copy image
            </button>
          )}
          <button type="button" className="pill pill--primary" onClick={() => void act('share')}>
            {android ? 'Share' : 'Save image'}
          </button>
        </div>
      </div>
    </div>
  )
}
