import { useEffect, useRef, useState } from 'react'
import type { YoutubeVideo } from '@shared/types'
import { useBackgroundVersion } from '@/hooks/useBackground'
import { useTranslation } from '@/i18n'
import { videoWhy } from '@/lib/whyText'
import { usePlayer } from '@/store/player'
import { useUi } from '@/store/ui'
import { IconButton } from './Controls'

/** "Wrong video?" — pick another YouTube video for this song (only shown while a YouTube video is playing behind the lyrics). */
export function VideoPicker() {
  const track = usePlayer((s) => s.snapshot?.track ?? null)
  const bump = useBackgroundVersion((s) => s.bump)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<YoutubeVideo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const toast = useUi((s) => s.toast)
  const { t } = useTranslation()

  useEffect(() => {
    setOpen(false)
    setItems(null)
  }, [track?.id])

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent): void => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', away)
    return () => window.removeEventListener('mousedown', away)
  }, [open])

  if (!track) return null

  const toggle = (): void => {
    const next = !open
    setOpen(next)
    if (next && !items) {
      setError(null)
      void window.lyra.background
        .youtubeCandidates(track)
        .then((r) => {
          setItems(r.items)
          if (r.error) setError(r.error)
        })
        .catch(() => setError('Couldn’t load other videos. Check your connection and reopen this list'))
    }
  }
  const choose = (id: string | null): void => {
    void window.lyra.background.youtubeChoose(track.id, id).then(() => {
      setOpen(false)
      bump()
    })
  }

  const reset = (): void => {
    void window.lyra.choices.clear(track).then(() => {
      setOpen(false)
      setItems(null)
      bump()
      toast(t('Back to automatic for this song'))
    })
  }

  return (
    <div className="vpick" ref={box}>
      <IconButton icon="refresh" label="Wrong video? Pick another" active={open} onClick={toggle} />
      {open && (
        <div className="vpick__pop" role="menu">
          <strong>Pick the right video</strong>
          {!items && !error && <small>Loading…</small>}
          {error && <small>{error}</small>}
          {items?.length === 0 && !error && <small>No other embeddable videos found.</small>}
          {items?.map((v) => {
            const why = videoWhy(v.why)
            return (
              <button key={v.videoId} type="button" role="menuitem" onClick={() => choose(v.videoId)}>
                <span>
                  {v.best && <b className="badge badge--best">{t('Best match')}</b>} {v.title}
                </span>
                <small>{v.channel}</small>
                {why.length > 0 && <small className="vpick__why">{why.map((w) => t(w)).join(' · ')}</small>}
              </button>
            )
          })}
          {items?.some((v) => v.why) && <small className="vpick__note">{t('Ranked by title, artist, channel and length. Best match is what Lyra plays on its own.')}</small>}
          <button type="button" className="vpick__auto" onClick={() => choose(null)}>
            Use Lyra’s automatic pick
          </button>
          <button type="button" className="vpick__auto" onClick={reset}>
            {t('Reset my choices for this song')}
          </button>
        </div>
      )}
    </div>
  )
}
