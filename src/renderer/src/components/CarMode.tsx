import { useMemo } from 'react'
import type { LyricLine } from '@shared/types'
import { carLines, lengthClass, shouldOfferCarMode } from '@/lib/car'
import { useActiveLine } from '@/hooks/useLyricsSync'
import { useLyrics } from '@/store/lyrics'
import { usePlayer } from '@/store/player'
import { useCar } from '@/store/car'

const NO_LINES: LyricLine[] = []

const Prev = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h2.4v14H6zM20 5v14L9.5 12z" /></svg>
)
const Next = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.6 5H18v14h-2.4zM4 5l10.5 7L4 19z" /></svg>
)
const Play = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
)
const Pause = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5h4.4v15H6zM13.6 4.5H18v15h-4.4z" /></svg>
)

/**
 * Car mode for the phone screen: three big lines, three big buttons, nothing to scroll or hunt for. It is meant for
 * passengers or a parked car; the app can not tell whether the car is moving, so it never starts by itself.
 * Android Auto / Automotive OS do not run this screen (see docs/android-car.md).
 */
export function CarMode() {
  const snapshot = usePlayer((s) => s.snapshot)
  const command = usePlayer((s) => s.command)
  const toggle = usePlayer((s) => s.toggle)
  const lyrics = useLyrics((s) => s.state)
  const setOn = useCar((s) => s.setOn)

  const track = snapshot?.track ?? null
  const result = lyrics.phase === 'ready' && track && lyrics.result.trackId === track.id ? lyrics.result : null
  const synced = result && result.status === 'synced' && result.lines.length > 0 ? result.lines : NO_LINES
  const idx = useActiveLine(synced, synced.length > 0)
  const view = useMemo(() => carLines(synced, idx), [synced, idx])
  const playing = !!snapshot?.isPlaying

  let note = ''
  if (!track) note = 'Play a song to see its lyrics here'
  else if (snapshot?.isAdOrUnknown) note = 'Waiting for the next song'
  else if (lyrics.phase === 'loading') note = 'Loading lyrics…'
  else if (synced.length === 0) note = 'No synced lyrics for this song'

  return (
    <section className="car" aria-label="Car mode" data-playing={playing || undefined}>
      <header className="car__head">
        <div className="car__song">
          <b>{track?.title ?? 'Lyra'}</b>
          <span>{track ? track.artists.join(', ') : 'Nothing playing'}</span>
        </div>
        <button type="button" className="car__done" onClick={() => setOn(false)}>
          Done
        </button>
      </header>

      <div className="car__lyrics" aria-live="off">
        {note ? (
          <p className="car__note">{note}</p>
        ) : (
          <>
            <p className="car__line car__line--prev">{view.prev}</p>
            <p key={idx} className="car__line car__line--now" data-len={lengthClass(view.current)}>
              {view.current}
            </p>
            <p className="car__line car__line--next">{view.next}</p>
          </>
        )}
      </div>

      <div className="car__controls" role="group" aria-label="Playback controls">
        <button type="button" className="car__btn" aria-label="Previous song" onClick={() => void command({ type: 'previous' })}>
          <Prev />
        </button>
        <button type="button" className="car__btn car__btn--play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => toggle()}>
          {playing ? <Pause /> : <Play />}
        </button>
        <button type="button" className="car__btn" aria-label="Next song" onClick={() => void command({ type: 'next' })}>
          <Next />
        </button>
      </div>

      <footer className="car__foot">For passengers, or when parked. Please do not read this while driving.</footer>
    </section>
  )
}

/** A small, calm button offered when the phone is docked in a car. Tapping it is the explicit choice to enter Car mode. */
export function CarOffer() {
  const dock = useCar((s) => s.dock)
  const on = useCar((s) => s.on)
  const setOn = useCar((s) => s.setOn)
  if (!shouldOfferCarMode(dock, on)) return null
  return (
    <button type="button" className="car-offer" onClick={() => setOn(true)}>
      Car mode
    </button>
  )
}

/** The manual switch in Settings → Phone (for passengers or a parked car). */
export function CarModeRow() {
  const setOn = useCar((s) => s.setOn)
  return (
    <div className="srow">
      <div className="srow__label">
        <span>Car mode</span>
        <small>Big lyrics and big buttons for passengers, or when parked. Never opens by itself.</small>
      </div>
      <div className="srow__ctl">
        <button type="button" className="btn" onClick={() => setOn(true)}>
          Open
        </button>
      </div>
    </div>
  )
}
