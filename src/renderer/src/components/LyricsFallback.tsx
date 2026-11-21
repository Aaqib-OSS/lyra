import { useEffect, useState } from 'react'
import type { LyricsResult } from '@shared/types'
import { useLyrics } from '@/store/lyrics'
import { usePlayer } from '@/store/player'
import { useUi } from '@/store/ui'
import { Icon } from './Icon'

type Kind = 'offline' | 'resting' | 'error' | 'none'

function kindOf(r: LyricsResult): Kind {
  if (r.status === 'none') return 'none'
  if (!navigator.onLine || r.error?.kind === 'network') return 'offline'
  if (r.error?.kind === 'rate-limit' || (r.error?.retryInSec ?? 0) > 0) return 'resting'
  return 'error'
}

const COPY: Record<Kind, { title: string; body: string }> = {
  offline: { title: 'Waiting for the connection', body: 'Lyra can’t reach the lyrics services right now. The song keeps playing, and the lyrics will appear as soon as the connection is back.' },
  resting: { title: 'The lyrics service is catching its breath', body: 'It asked for a short pause. Lyra waits politely and tries again by itself.' },
  error: { title: 'Couldn’t load the lyrics', body: 'Something went wrong while fetching them. Lyra keeps trying in the background.' },
  none: { title: 'No lyrics found yet', body: 'The song may be new or listed under another title. You can pick a match, or paste the words yourself and Lyra will remember them.' }
}

/**
 * What the lyrics area shows when there are no lyrics. It is a designed scene, never an error box: the song's name set
 * big, a moving equaliser (the music is still playing), the reason in plain words, a live "trying again in 6 s", and
 * the ways out: try now, pick a match, paste your own.
 */
export function LyricsFallback({ result }: { result: LyricsResult }) {
  const track = usePlayer((s) => s.snapshot?.track ?? null)
  const retryAt = useLyrics((s) => s.retryAt)
  const retry = useLyrics((s) => s.retry)
  const [now, setNow] = useState(Date.now())
  const kind = kindOf(result)
  const waiting = kind !== 'none' && retryAt !== null

  useEffect(() => {
    if (!waiting) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [waiting])

  const left = retryAt ? Math.max(0, Math.ceil((retryAt.at - now) / 1000)) : 0
  const gaveUp = kind !== 'none' && retryAt === null
  const open = (): void => useUi.getState().setPanel('lyrics')

  return (
    <div className={`lfb lfb--${kind}`} role="status">
      <div className="lfb__poster" aria-hidden="true">
        <span className="lfb__title">{track?.title ?? ''}</span>
        <span className="lfb__artist">{track?.artists[0] ?? ''}</span>
      </div>
      <div className="lfb__eq" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} style={{ animationDelay: `${(i * 137) % 900}ms` }} />
        ))}
      </div>
      <h3>{COPY[kind].title}</h3>
      <p>{COPY[kind].body}</p>
      {kind !== 'none' && (
        <p className="lfb__status">
          {waiting ? (
            <>
              <i className="lfb__pulse" /> Trying again in {left}s <small>· attempt {retryAt!.attempt}</small>
            </>
          ) : gaveUp ? (
            'Paused. Lyra retries when the connection returns, or press Try now.'
          ) : null}
        </p>
      )}
      <div className="lfb__actions">
        {kind !== 'none' ? (
          <button type="button" className="pill pill--primary" onClick={retry}>
            <Icon name="refresh" size={14} />
            Try now
          </button>
        ) : (
          <button type="button" className="pill pill--primary" onClick={retry}>
            <Icon name="refresh" size={14} />
            Search again
          </button>
        )}
        <button type="button" className="pill" onClick={open}>
          Pick a match
        </button>
        <button type="button" className="pill" onClick={open}>
          Paste lyrics
        </button>
      </div>
    </div>
  )
}
