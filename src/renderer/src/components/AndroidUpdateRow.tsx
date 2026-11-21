import { useCallback, useEffect, useState } from 'react'
import type { AndroidUpdateStatus } from '@shared/ipc'
import { Spinner } from './StateScreens'

const mb = (n: number): string => `${(n / 1048576).toFixed(1)} MB`

/**
 * Android only: "Updates" in Settings → About. Shows the update prompt (version, size, release notes) with the one
 * action that fits the phase, plus channel / Wi-Fi settings. Everything is decided natively; this only displays it.
 * Reuses the existing row / switch / segmented styles.
 */
export function AndroidUpdateRow() {
  const api = window.lyra.android?.appUpdate
  const [u, setU] = useState<AndroidUpdateStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [showNotes, setShowNotes] = useState(false)

  const run = useCallback(async (f: () => Promise<AndroidUpdateStatus>): Promise<void> => {
    setBusy(true)
    try {
      setU(await f())
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void api?.status().then(setU)
  }, [api])

  // follow a running download
  const phase = u?.phase
  useEffect(() => {
    if (phase !== 'downloading' && phase !== 'verifying' && phase !== 'installing') return
    const t = setInterval(() => void api?.status().then(setU), 1500)
    return () => clearInterval(t)
  }, [phase, api])

  if (!api || !u) return null
  if (!u.enabled) {
    return (
      <div className="updaterow">
        <span className="updaterow__text">{u.disabledReason}</span>
      </div>
    )
  }

  const up = u.update
  const size = up && up.sizeBytes > 0 ? ` (${mb(up.sizeBytes)})` : ''
  const text =
    note ??
    (u.phase === 'checking'
      ? 'Checking for updates…'
      : u.phase === 'available' && up
        ? `Update available: v${up.version}${size}${up.prerelease ? ' (beta)' : ''}`
        : u.phase === 'downloading' && up
          ? `Downloading v${up.version}… ${up.sizeBytes > 0 ? Math.min(100, Math.round((u.downloadedBytes / up.sizeBytes) * 100)) : 0}%`
          : u.phase === 'verifying'
            ? 'Checking the download…'
            : u.phase === 'ready' && up
              ? `v${up.version} is downloaded and verified.`
              : u.phase === 'installing'
                ? 'Installing…'
                : u.phase === 'error'
                  ? (u.error ?? 'The update failed.')
                  : 'You’re up to date.')

  const install = async (): Promise<void> => {
    setBusy(true)
    try {
      const r = await api.install()
      setU(r.state)
      setNote(r.status === 'started' ? null : r.message)
    } finally {
      setBusy(false)
    }
  }

  const set = (s: Parameters<typeof api.setSettings>[0]): void => void run(() => api.setSettings(s))

  return (
    <>
      <div className="updaterow">
        <span className="updaterow__text" data-state={u.phase}>
          {(u.phase === 'checking' || u.phase === 'downloading' || u.phase === 'verifying') && <Spinner size={11} />} {text}
        </span>
        {u.phase === 'ready' ? (
          <button type="button" className="pill" disabled={busy} onClick={() => void install()}>
            Install
          </button>
        ) : u.phase === 'available' || (u.phase === 'error' && up) ? (
          <button type="button" className="pill" disabled={busy} onClick={() => void run(() => api.download())}>
            Download
          </button>
        ) : u.phase === 'idle' || u.phase === 'error' ? (
          <button
            type="button"
            className="pill"
            disabled={busy}
            onClick={() => {
              setNote(null)
              void run(() => api.check())
            }}
          >
            Check now
          </button>
        ) : null}
      </div>
      {up && up.notes && (
        <>
          <button type="button" className="pill" onClick={() => setShowNotes(!showNotes)}>
            {showNotes ? 'Hide release notes' : 'Release notes'}
          </button>
          {showNotes && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 200, overflow: 'auto' }}>{up.notes}</pre>}
        </>
      )}
      <div className="srow">
        <div className="srow__label">
          <span>Update channel</span>
          <small>Beta gets pre-releases first</small>
        </div>
        <div className="srow__ctl">
          <div className="seg" role="radiogroup" aria-label="Update channel">
            {(['stable', 'beta'] as const).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={u.channel === c} className={u.channel === c ? 'is-on' : ''} onClick={() => set({ channel: c })}>
                {c === 'stable' ? 'Stable' : 'Beta'}
              </button>
            ))}
          </div>
        </div>
      </div>
      {(
        [
          ['autoCheck', 'Check automatically', 'About twice a day'],
          ['unmeteredOnly', 'Download on Wi-Fi only', 'Saves mobile data'],
          ['autoInstall', 'Install automatically', 'Only when nothing is playing (Android 12+)']
        ] as const
      ).map(([key, label, hint]) => (
        <div className="srow" key={key}>
          <div className="srow__label">
            <span>{label}</span>
            <small>{hint}</small>
          </div>
          <div className="srow__ctl">
            <button type="button" role="switch" aria-checked={u[key]} aria-label={label} className="switch" onClick={() => set({ [key]: !u[key] })}>
              <i />
            </button>
          </div>
        </div>
      ))}
    </>
  )
}
