import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cycleVibe } from '@/hooks/useVibe'
import { useLyricPreview, usePlayerView } from '@/hooks/usePlayerView'
import { useWindowDrag } from '@/hooks/useWindowDrag'
import { joinArtists } from '@/lib/format'
import { usePlayer } from '@/store/player'
import { requestMode, useUi } from '@/store/ui'
import { Artwork } from './Artwork'
import { IconButton, Transport } from './Controls'
import { Icon, type IconName } from './Icon'
import { openShortcuts } from './ShortcutsHelp'
import { ProgressBar } from './ProgressBar'
import { OfflineBanner, WidgetStatus } from './StateScreens'

export function CompactWidget({ minimal }: { minimal: boolean }) {
  const view = usePlayerView()
  const track = usePlayer((s) => s.snapshot?.track ?? null)
  const drag = useWindowDrag(() => requestMode('mini'))
  const [menu, setMenu] = useState(false)

  return (
    <div className={`widget ${minimal ? 'widget--minimal' : 'widget--compact'} ${menu ? 'widget--menu' : ''}`} {...drag} role="group" aria-label="Player widget">
      {view === 'playing' && track ? (
        minimal ? <MinimalBody /> : <CompactBody />
      ) : view === 'loading' || view === 'connect' || view === 'offline' || view === 'idle' || view === 'ad' ? (
        <WidgetStatus view={view} />
      ) : null}

      <div className="widget__actions" data-nodrag>
        {track && (
          <IconButton icon="external" label="Open in Spotify" size={14} onClick={() => void window.lyra.player.openInSpotify(track)} />
        )}
        <IconButton icon="expand" label="Expand player" size={14} onClick={() => requestMode('mini')} />
        {document.documentElement.dataset.platform !== 'android' && <IconButton icon="more" label="More" size={14} active={menu} onClick={() => setMenu((m) => !m)} />}
        <IconButton icon="minus" label="Minimize" size={14} onClick={() => window.lyra.window.minimize()} />
        <IconButton icon="close" label="Quit Lyra" size={14} onClick={() => window.lyra.window.quit()} />
      </div>

      {menu && <WidgetMenu onClose={() => setMenu(false)} />}

      {view === 'playing' && (
        <div className="widget__bar">
          <ProgressBar variant="thin" />
        </div>
      )}
      {!minimal && view === 'playing' && <OfflineBanner />}
    </div>
  )
}

/**
 * The widget is too short for a drop-down list, so "More" lays the same actions out as one row over the widget.
 * Same wording as the menus of the expanded player and of fullscreen. Left / Right move, Esc closes.
 */
function WidgetMenu({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const ui = useUi.getState
  const items: Array<{ icon: IconName; label: string; run(): void }> = [
    { icon: 'settings', label: 'Settings', run: () => (ui().setPanel('settings'), requestMode('mini')) },
    { icon: 'fullscreen', label: 'Fullscreen lyrics', run: () => requestMode('full') },
    { icon: 'mic', label: 'Karaoke', run: () => (ui().setPending('karaoke'), requestMode('mini')) },
    { icon: 'film', label: 'Export lyric video', run: () => (ui().setPending('studio'), requestMode('mini')) },
    { icon: 'vibe', label: 'Next vibe', run: () => cycleVibe(1) },
    { icon: 'lock', label: 'Click-through lock', run: () => window.lyra.window.lock(true) },
    { icon: 'keyboard', label: 'Keyboard shortcuts', run: () => openShortcuts() }
  ]
  useEffect(() => {
    const esc = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation() // closes the menu only (see useHotkeys)
      onClose()
    }
    window.addEventListener('keydown', esc, true)
    const t = setTimeout(() => box.current?.querySelector<HTMLButtonElement>('button')?.focus(), 30)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', esc, true)
    }
  }, [onClose])
  const onKey = (e: React.KeyboardEvent): void => {
    const all = Array.from(box.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    const at = all.indexOf(document.activeElement as HTMLButtonElement)
    const go = (n: number): void => {
      e.preventDefault()
      all[(n + all.length) % all.length]?.focus()
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(all.length - 1)
  }
  return (
    <div className="widget__more" ref={box} role="menu" aria-label="More" data-nodrag onKeyDown={onKey} onClick={(e) => e.target === e.currentTarget && onClose()}>
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          role="menuitem"
          title={it.label}
          aria-label={it.label}
          onClick={() => {
            onClose()
            it.run()
          }}
        >
          <Icon name={it.icon} size={18} />
          <span>{it.label.replace('Export lyric video', 'Export').replace('Fullscreen lyrics', 'Fullscreen').replace('Click-through lock', 'Lock').replace('Keyboard shortcuts', 'Keys')}</span>
        </button>
      ))}
    </div>
  )
}

function LyricLinePreview() {
  const p = useLyricPreview()
  const playing = usePlayer((s) => !!s.snapshot?.isPlaying)
  return (
    <div className="preview" aria-live="off">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={p.kind + p.text}
          className={`preview__text preview__text--${p.kind}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          {p.kind === 'loading' ? <i className="shimmer" /> : p.kind === 'gap' ? '♪' : p.text}
        </motion.span>
      </AnimatePresence>
      {p.synced && (
        <span className={`syncdot ${playing ? 'is-live' : ''}`} title={playing ? 'Lyrics synchronized' : 'Lyrics synchronized (paused)'}>
          <i />
          <i />
          <i />
        </span>
      )}
    </div>
  )
}

function CompactBody() {
  const track = usePlayer((s) => s.snapshot!.track!)
  return (
    <>
      <Artwork url={track.artworkUrl} size={112} radius={12} />
      <div className="widget__meta">
        <div className="widget__title" title={track.title}>
          {track.title}
        </div>
        <div className="widget__artist" title={joinArtists(track.artists)}>
          {joinArtists(track.artists)}
        </div>
        <LyricLinePreview />
        <div className="widget__transport" data-nodrag>
          <Transport size="sm" />
        </div>
      </div>
    </>
  )
}

function MinimalBody() {
  const track = usePlayer((s) => s.snapshot!.track!)
  const p = useLyricPreview()
  return (
    <>
      <Artwork url={track.artworkUrl} size={40} radius={8} />
      <div className="widget__meta widget__meta--min">
        <div className="widget__title">{track.title}</div>
        <div className="widget__artist">{p.kind === 'line' ? p.text : joinArtists(track.artists)}</div>
      </div>
      <div data-nodrag>
        <Transport size="sm" />
      </div>
    </>
  )
}
