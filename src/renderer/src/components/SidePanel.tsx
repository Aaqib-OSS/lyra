import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { SavedMoment } from '@shared/types'
import { useTranslation } from '@/i18n'
import { usePlayer } from '@/store/player'
import { useUi, type Panel } from '@/store/ui'
import { Artwork } from './Artwork'
import { IconButton } from './Controls'
import { Icon } from './Icon'
import { LyricsMatchPanel } from './LyricsMatchPanel'
import { SettingsPanel } from './SettingsPanel'
import { KeysPanel } from './KeysPanel'
import { momentCaption, momentsToMarkdown, searchMoments } from '@shared/moments'

const TITLES: Record<Exclude<Panel, 'none'>, string> = { queue: 'Queue', moments: 'Moments', settings: 'Settings', lyrics: 'Lyrics match', keys: 'Keyboard shortcuts' }

export function SidePanel() {
  const { t } = useTranslation()
  const panel = useUi((s) => s.panel)
  const setPanel = useUi((s) => s.setPanel)
  const phone = document.documentElement.dataset.platform === 'android'

  return (
    <AnimatePresence>
      {panel !== 'none' && (
        <>
          <motion.div
            key="scrim"
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setPanel('none')}
          />
          <motion.aside
            key="panel"
            className="sidepanel"
            role="dialog"
            aria-label={t(TITLES[panel])}
            initial={phone ? { y: '100%' } : { x: '100%', opacity: 0.6 }}
            animate={phone ? { y: 0 } : { x: 0, opacity: 1 }}
            exit={phone ? { y: '100%' } : { x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 40 }}
          >
            {phone && <i className="sidepanel__grip" aria-hidden="true" />}
            <header className="sidepanel__head">
              <h3>{t(TITLES[panel])}</h3>
              <IconButton icon="close" label="Close panel" size={16} onClick={() => setPanel('none')} />
            </header>
            <div className="sidepanel__body">
              {panel === 'queue' && <QueuePanel />}
              {panel === 'moments' && <MomentsPanel />}
              {panel === 'settings' && <SettingsPanel />}
              {panel === 'lyrics' && <LyricsMatchPanel />}
              {panel === 'keys' && <KeysPanel />}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

function QueuePanel() {
  const { t } = useTranslation()
  const track = usePlayer((s) => s.snapshot?.track ?? null)
  const queue = usePlayer((s) => s.queue)
  const recent = usePlayer((s) => s.recent)
  const refreshQueue = usePlayer((s) => s.refreshQueue)
  const refreshRecent = usePlayer((s) => s.refreshRecent)
  const limited = usePlayer((s) => !!s.status?.controlsLimited)
  const local = usePlayer((s) => s.status?.state === 'local')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void Promise.all([refreshQueue(), refreshRecent()]).then(() => setLoaded(true))
  }, [refreshQueue, refreshRecent, track?.id])

  return (
    <div className="list">
      {track && (
        <>
          <h4>{t('Now playing')}</h4>
          <div className="item item--now">
            <Artwork url={track.artworkUrl} size={44} radius={8} />
            <div>
              <b>{track.title}</b>
              <span>{track.artists.join(', ')}</span>
            </div>
          </div>
        </>
      )}
      <h4>{t('Next up')}</h4>
      {!loaded ? (
        <p className="list__empty" role="status">Loading…</p>
      ) : queue === null ? (
        <p className="list__empty" role="status">
          {local
            ? 'Windows media controls don’t share a queue. It shows up when Spotify is the source.'
            : limited
              ? 'Spotify only shares the queue with Premium accounts, so it can’t be shown here.'
              : 'The queue isn’t available from Spotify right now.'}{' '}
          {!local && !limited && (
            <button type="button" className="linkbtn" onClick={() => void refreshQueue()}>
              Try again
            </button>
          )}
        </p>
      ) : queue.length === 0 ? (
        <p className="list__empty">{t('Nothing queued after this track.')}</p>
      ) : (
        queue.map((q, i) => (
          <div key={`${q.id}-${i}`} className="item">
            <Artwork url={q.artworkUrl} size={40} radius={7} />
            <div>
              <b>{q.title}</b>
              <span>{q.artists.join(', ')}</span>
            </div>
          </div>
        ))
      )}
      {recent && recent.length > 0 && (
        <>
          <h4>{t('Recently played')}</h4>
          {recent.slice(0, 8).map((q, i) => (
            <div key={`${q.id}-r${i}`} className="item item--dim">
              <Artwork url={q.artworkUrl} size={36} radius={6} />
              <div>
                <b>{q.title}</b>
                <span>{q.artists.join(', ')}</span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

const MOMENTS_PAGE = 60

function MomentsPanel() {
  const [items, setItems] = useState<SavedMoment[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [q, setQ] = useState('')
  const [shown, setShown] = useState(MOMENTS_PAGE)
  const [undo, setUndo] = useState<SavedMoment | null>(null)
  const toast = useUi((s) => s.toast)
  const load = (): void => {
    setFailed(false)
    window.lyra.moments.list().then(setItems, () => setFailed(true))
  }
  useEffect(load, [])
  useEffect(() => setShown(MOMENTS_PAGE), [q])
  useEffect(() => {
    if (!undo) return
    const t = setTimeout(() => setUndo(null), 6000)
    return () => clearTimeout(t)
  }, [undo])

  if (failed)
    return (
      <div className="list__blank" role="alert">
        <Icon name="alert" size={22} />
        <b>Couldn’t load your moments</b>
        <button type="button" className="pill" onClick={load}>
          Try again
        </button>
      </div>
    )
  if (items === null) return <p className="list__empty" role="status">Loading…</p>
  if (items.length === 0)
    return (
      <div className="list__blank">
        <Icon name="bookmark" size={22} />
        <b>No saved moments yet</b>
        <p>Hover a lyric line and tap the bookmark to keep it here. On a phone, long-press the line.</p>
      </div>
    )

  const found = searchMoments(items, q)
  const copy = (text: string, done: string): void =>
    void window.lyra.app.copy(text).then((ok) => toast(ok ? done : 'Couldn’t copy', ok ? 'info' : 'error'))

  return (
    <div className="list moments">
      <div className="moments__bar">
        <input
          type="search"
          className="moments__search"
          placeholder={`Search ${items.length} moment${items.length === 1 ? '' : 's'}`}
          aria-label="Search saved moments"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && q) {
              e.stopPropagation()
              setQ('')
            }
          }}
        />
        <IconButton icon="copy" label="Copy all as Markdown" size={14} onClick={() => copy(momentsToMarkdown(found), `Copied ${found.length} as Markdown`)} />
      </div>
      {undo && (
        <div className="moments__undo" role="status">
          <span>Moment removed</span>
          <button
            type="button"
            className="linkbtn"
            onClick={() => {
              const { id: _id, savedAt: _at, ...rest } = undo
              void window.lyra.moments.add(rest).then(setItems)
              setUndo(null)
            }}
          >
            Undo
          </button>
        </div>
      )}
      {found.length === 0 && <p className="list__empty">Nothing matches “{q}”.</p>}
      <ul className="moments__list" aria-label="Saved moments">
        {found.slice(0, shown).map((m) => (
          <li key={m.id}>
            <article className="moment">
              <blockquote>{m.text}</blockquote>
              <footer>
                <Artwork url={m.artworkUrl} size={28} radius={6} />
                <span>
                  {m.title} · {m.artist}
                </span>
                <IconButton icon="copy" label="Copy line with song" size={14} onClick={() => copy(momentCaption(m.text, m.title, m.artist), 'Copied')} />
                <IconButton
                  icon="trash"
                  label="Remove moment"
                  size={14}
                  onClick={() =>
                    void window.lyra.moments.remove(m.id).then((next) => {
                      setItems(next)
                      setUndo(m)
                    })
                  }
                />
              </footer>
            </article>
          </li>
        ))}
      </ul>
      {found.length > shown && (
        <button type="button" className="pill" onClick={() => setShown((n) => n + MOMENTS_PAGE)}>
          Show more ({found.length - shown})
        </button>
      )}
    </div>
  )
}
