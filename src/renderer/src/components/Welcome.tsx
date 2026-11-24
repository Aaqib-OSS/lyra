import { motion } from 'framer-motion'
import { GLOBAL_SHORTCUTS, effectiveAccel } from '@shared/shortcuts'
import { useSettings } from '@/store/settings'
import { requestMode } from '@/store/ui'
import { Icon } from './Icon'

const pretty = (accel: string): string => accel.replace('Control', 'Ctrl').replace('Super', 'Win')

/** First-run card: what Lyra needs and the handful of things worth knowing. */
export function Welcome() {
  const set = useSettings((s) => s.set)
  const defaultMode = useSettings((s) => s.settings.defaultMode)
  const overrides = useSettings((s) => s.settings.shortcuts)
  const pick = (id: (typeof GLOBAL_SHORTCUTS)[number]['id']): string => pretty(effectiveAccel(id, overrides))

  const done = (): void => {
    set({ onboarded: true })
    requestMode(defaultMode === 'mini' ? 'mini' : defaultMode)
  }

  return (
    <motion.div
      className="welcome"
      role="dialog"
      aria-label="Welcome to Lyra"
      aria-modal="true"
      onKeyDown={(e) => e.key === 'Escape' && done()}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="welcome__mark" aria-hidden="true">
        <Icon name="note" size={22} />
      </div>
      <h2>Welcome to Lyra</h2>
      <p className="welcome__lead">Beautiful, synced lyrics for the Spotify desktop app — no account or login.</p>
      <ol className="welcome__steps">
        <li>
          <b>Play a song in the Spotify desktop app.</b> Lyra follows it on its own, nothing to link.
        </li>
        <li>
          <b>Make it yours:</b> press <kbd>F</kbd> for fullscreen lyrics and <kbd>V</kbd> to flip through the looks.
        </li>
        <li>
          <b>Keep what you love:</b> tap the bookmark on a line to save it, or share it as a card. Press <kbd>?</kbd> any time for every shortcut.
        </li>
      </ol>
      <dl className="welcome__keys">
        <div>
          <dt>Show / hide</dt>
          <dd>{pick('toggle-visible')}</dd>
        </div>
        <div>
          <dt>Fullscreen</dt>
          <dd>{pick('toggle-fullscreen')}</dd>
        </div>
        <div>
          <dt>Play / pause</dt>
          <dd>{pick('toggle-play')}</dd>
        </div>
      </dl>
      <div className="welcome__actions">
        <button type="button" className="primary" autoFocus onClick={done}>
          Get started
        </button>
        <button type="button" className="textbtn" onClick={() => void window.lyra.player.openInSpotify(null)}>
          Open Spotify
        </button>
      </div>
    </motion.div>
  )
}
