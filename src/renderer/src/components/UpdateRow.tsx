import { useEffect, useState } from 'react'
import type { UpdateState } from '@shared/types'
import { Spinner } from './StateScreens'

/** "2 min ago", for the last successful check. */
function ago(thenMs: number, nowMs: number): string {
  const m = Math.round(Math.max(0, nowMs - thenMs) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`
}

/** "Updates" line in Settings → About: status plus the one action that makes sense right now, and the release notes once there is an update. */
export function UpdateRow() {
  const [u, setU] = useState<UpdateState>({ state: 'idle' })

  useEffect(() => {
    void window.lyra.update.get().then(setU)
    return window.lyra.update.onState(setU)
  }, [])

  const text =
    u.state === 'disabled'
      ? u.reason
      : u.state === 'checking'
        ? 'Checking for updates…'
        : u.state === 'none'
          ? `You’re up to date.${u.checkedAt ? ` Checked ${ago(u.checkedAt, Date.now())}.` : ''}`
          : u.state === 'downloading'
            ? `Downloading ${u.version ? `v${u.version}` : 'update'}… ${u.percent}%`
            : u.state === 'ready'
              ? `Version ${u.version} is ready.`
              : u.state === 'error'
                ? `${u.message}${u.willRetry ? ' Lyra will try again soon.' : ''}`
                : 'Updates are checked automatically.'

  const hasUpdate = u.state === 'downloading' || u.state === 'ready'
  const notes = hasUpdate ? u.notes : undefined
  const version = hasUpdate ? u.version : ''

  return (
    <div className="updaterow-wrap">
      <div className="updaterow">
        <span className="updaterow__text" data-state={u.state} role="status">
          {(u.state === 'checking' || u.state === 'downloading') && <Spinner size={11} />} {text}
        </span>
        {u.state === 'ready' ? (
          <button type="button" className="pill" onClick={() => void window.lyra.update.install()}>
            Restart to update
          </button>
        ) : u.state !== 'disabled' && u.state !== 'checking' && u.state !== 'downloading' ? (
          <button type="button" className="pill" onClick={() => void window.lyra.update.check()}>
            {u.state === 'error' ? 'Try again' : 'Check now'}
          </button>
        ) : null}
      </div>
      {u.state === 'downloading' && (
        <div className="updaterow__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={u.percent} aria-label="Update download">
          <i style={{ width: `${Math.min(100, Math.max(0, u.percent))}%` }} />
        </div>
      )}
      {notes && (
        <details className="updaterow__notes">
          <summary>What’s new{version ? ` in ${version}` : ''}</summary>
          <p>{notes}</p>
        </details>
      )}
    </div>
  )
}
