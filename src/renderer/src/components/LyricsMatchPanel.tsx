import { useEffect, useRef, useState } from 'react'
import { isImportError } from '@shared/lrc'
import type { LyricsCandidateInfo } from '@shared/types'
import { formatTime } from '@/lib/format'
import { useLyrics } from '@/store/lyrics'
import { usePlayer } from '@/store/player'
import { useUi } from '@/store/ui'
import { useTranslation } from '@/i18n'
import { lyricsWhy } from '@/lib/whyText'
import { Icon } from './Icon'
import { Spinner } from './StateScreens'

/** Lets the user fix a wrong automatic lyrics match by picking another entry. */
export function LyricsMatchPanel() {
  const track = usePlayer((s) => s.snapshot?.track ?? null)
  const state = useLyrics((s) => s.state)
  const apply = useLyrics((s) => s.apply)
  const toast = useUi((s) => s.toast)
  const { t } = useTranslation()
  const [items, setItems] = useState<LyricsCandidateInfo[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const draftRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!track) return
    let live = true
    setItems(null)
    setFailed(null)
    window.lyra.lyrics
      .candidates(track)
      .then((r) => {
        if (!live) return
        setItems(r.items)
        setFailed(r.error ?? null)
      })
      .catch(() => live && setFailed('Couldn’t reach the lyrics service.'))
    return () => {
      live = false
    }
  }, [track?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!track) return <p className="list__empty">Play a song first.</p>
  const current = state.phase === 'ready' ? state.result : null

  const pick = async (c: LyricsCandidateInfo): Promise<void> => {
    setBusy(`${c.provider}:${c.id}`)
    try {
      apply(await window.lyra.lyrics.choose(track, c.provider, c.id))
      toast('Lyrics updated — remembered for this song')
      useUi.getState().setPanel('none')
    } catch {
      toast('Couldn’t load that entry. Try another.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const useMine = async (text: string | null): Promise<void> => {
    setSaving(true)
    try {
      const r = text === null ? await window.lyra.lyrics.importFile(track) : await window.lyra.lyrics.importText(track, text)
      if (r === null) return // cancelled
      if (isImportError(r)) return void toast(r.error, 'error')
      apply(r)
      setDraft('')
      toast('Your lyrics are saved for this song')
    } finally {
      setSaving(false)
    }
  }

  const reset = async (): Promise<void> => {
    apply(await window.lyra.lyrics.clearPin(track))
    toast('Back to automatic matching')
  }

  const resetChoices = async (): Promise<void> => {
    await window.lyra.choices.clear(track)
    apply(await window.lyra.lyrics.get(track))
    toast(t('Back to automatic for this song'))
  }

  return (
    <div className="list">
      <h4>Your own lyrics</h4>
      {current?.imported ? (
        <div className="mylyrics__on">
          <span>
            <b>Using your lyrics</b> for this song
          </span>
          <button type="button" className="pill" onClick={() => void reset()}>
            Remove
          </button>
        </div>
      ) : (
        <div className="mylyrics">
          <textarea
            ref={draftRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Paste lyrics here: plain words, or a timed .lrc / .srt"
            aria-label="Paste your own lyrics"
          />
          <div className="mylyrics__row">
            <button type="button" className="pill pill--primary" disabled={saving || draft.trim() === ''} onClick={() => void useMine(draft)}>
              Use these lyrics
            </button>
            <button type="button" className="pill" disabled={saving} onClick={() => void useMine(null)}>
              Choose a file…
            </button>
          </div>
          <span className="mylyrics__hint">Or drop a .lrc, .srt or .txt file anywhere on the window. Remembered for this song, even in another player.</span>
        </div>
      )}

      <h4>Playing</h4>
      <div className="item item--now">
        <div>
          <b>{track.title}</b>
          <span>
            {track.artists.join(', ')} · {formatTime(track.durationMs)}
          </span>
        </div>
      </div>

      {current?.matched && (
        <>
          <h4>Current match</h4>
          <div className="item">
            <div>
              <b>{current.matched.title}</b>
              <span>
                {current.matched.artist} · {formatTime(current.matched.durationMs)}
                {current.pinned ? ' · your pick' : ''}
              </span>
            </div>
          </div>
          {current.pinned && (
            <button type="button" className="linkbtn" onClick={() => void reset()}>
              Reset to automatic
            </button>
          )}
        </>
      )}

      <h4>Other matches</h4>
      {items === null && (
        <p className="list__empty">
          <Spinner size={12} /> Searching…
        </p>
      )}
      {failed && <p className="list__empty">{failed}</p>}
      {items?.length === 0 && !failed && <p className="list__empty">No alternatives found for this song.</p>}
      {items?.map((c) => {
        const key = `${c.provider}:${c.id}`
        const near = Math.abs(c.durationMs - track.durationMs) <= 3000
        const why = lyricsWhy(c.why)
        return (
          <button key={key} type="button" className="candidate" disabled={busy !== null} onClick={() => void pick(c)}>
            <div>
              <b>{c.title}</b>
              <span>
                {c.artist}
                {c.album ? ` · ${c.album}` : ''}
              </span>
              {why.length > 0 && <span className="candidate__why">{why.map((w) => t(w)).join(' · ')}</span>}
            </div>
            <div className="candidate__meta">
              <span className={near ? 'ok' : ''}>{formatTime(c.durationMs)}</span>
              {c.best && <span className="badge badge--best">{t('Best match')}</span>}
              <span className={`badge${c.synced && !c.instrumental ? ' badge--synced' : ''}`}>{c.instrumental ? t('instrumental') : c.synced ? t('synced') : t('plain')}</span>
              {busy === key && <Spinner size={12} />}
            </div>
          </button>
        )
      })}
      <p className="list__hint">
        <Icon name="alert" size={12} />
        <span>
          {t('Why this lyrics? Entries are ranked by same song, then synced to the music, then closest length. Your pick is remembered for this song.')}
        </span>
      </p>
      <button type="button" className="linkbtn" onClick={() => void resetChoices()}>
        {t('Reset my choices for this song')}
      </button>
    </div>
  )
}
