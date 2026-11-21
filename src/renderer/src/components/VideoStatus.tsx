import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useBgState, type VideoProblem } from '@/store/bgState'
import { usePlayer } from '@/store/player'
import { useUi } from '@/store/ui'
import { Icon } from './Icon'

const COPY: Record<VideoProblem, { title: string; body: string; action: string }> = {
  'no-key': { title: 'Want a music video here?', body: 'Add a free YouTube key to get the official video behind your lyrics, or choose your own.', action: 'Set it up' },
  none: { title: 'No music video found', body: 'This song has no video we could match. The cover’s colours are playing instead.', action: 'Pick a video' },
  blocked: { title: 'This video can’t play in Lyra', body: 'The uploader blocks embedding. Another upload of the song may work.', action: 'Try another' },
  timeout: { title: 'The video is slow to start', body: 'It didn’t begin in time, so the cover’s colours are playing instead.', action: 'Pick a video' },
  error: { title: 'Couldn’t look for a video', body: 'The video search failed. Lyrics keep working, and Lyra will try again on the next song.', action: 'Pick a video' },
  offline: { title: 'You’re offline', body: 'Videos need the internet. Lyrics and colours still work.', action: '' }
}

function openBackgroundSettings(): void {
  sessionStorage.setItem('lyra.settingsTab', 'bg')
  useUi.getState().setPanel('settings')
}

/**
 * One place that tells the user what the video behind the lyrics is doing, whatever happens:
 * looking for it, starting it, playing it, falling back to a short clip, or giving up (and why).
 */
export function VideoStatus() {
  const phase = useBgState((s) => s.phase)
  const problem = useBgState((s) => s.problem)
  const title = useBgState((s) => s.title)
  const channel = useBgState((s) => s.channel)
  const trackId = usePlayer((s) => s.snapshot?.track?.id ?? null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [open, setOpen] = useState(true)

  // a freshly playing video announces itself for a few seconds, then folds into a small dot
  useEffect(() => {
    if (phase !== 'live') return
    setOpen(true)
    const t = setTimeout(() => setOpen(false), 5200)
    return () => clearTimeout(t)
  }, [phase, title])

  const key = `${trackId}:${phase}:${problem}`
  const showFail = phase === 'failed' && problem && dismissed !== key

  return (
    <div className="vstat" data-nodrag role="status" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        {(phase === 'searching' || phase === 'loading') && (
          <motion.div key="load" className="vstat__pill" initial={{ opacity: 0, y: -10, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
            <span className="vstat__bars" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
            {phase === 'searching' ? 'Finding the music video…' : 'Starting the video…'}
          </motion.div>
        )}
        {phase === 'live' && (
          <motion.button
            key="live"
            type="button"
            className={`vstat__pill vstat__live ${open ? 'is-open' : ''}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            onMouseEnter={() => setOpen(true)}
            onClick={openBackgroundSettings}
            title="Wrong video? Choose another"
            aria-label={`Live video: ${title}. Choose another`}
          >
            <span className="vstat__dot" aria-hidden="true" />
            <span className="vstat__live-text">
              <b>LIVE</b>
              {title && <span>{title}</span>}
              {channel && <em>{channel}</em>}
            </span>
          </motion.button>
        )}
        {phase === 'fallback' && (
          <motion.div key="fb" className="vstat__pill" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Icon name="film" size={14} />
            {problem === 'blocked' ? 'Full video is blocked, playing a 30 s preview' : 'Playing a 30 s preview clip'}
          </motion.div>
        )}
        {showFail && (
          <motion.div key="fail" className="vstat__card" initial={{ opacity: 0, y: -14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
            <span className="vstat__icon" aria-hidden="true">
              <Icon name={problem === 'offline' ? 'wifiOff' : 'film'} size={18} />
            </span>
            <div className="vstat__text">
              <b>{COPY[problem].title}</b>
              <span>{COPY[problem].body}</span>
            </div>
            <div className="vstat__actions">
              {COPY[problem].action && (
                <button type="button" className="pill pill--primary" onClick={openBackgroundSettings}>
                  {COPY[problem].action}
                </button>
              )}
              <button type="button" className="ibtn" aria-label="Dismiss" onClick={() => setDismissed(key)}>
                ✕
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
