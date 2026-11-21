import { useEffect, useState } from 'react'
import { useConnect } from '@/store/connect'

/**
 * Settings > Devices: pair phones, tablets, TVs and other PCs on the same network, see who is connected, choose
 * what each may do, and remove any with one click. Self-contained; Settings only mounts it.
 */
function Countdown({ until }: { until: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const s = Math.max(0, Math.round((until - now) / 1000))
  return <>{s >= 3600 ? `${Math.floor(s / 3600)} h left` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} left`}</>
}

export function DevicesPanel() {
  const status = useConnect((s) => s.status)
  const [busy, setBusy] = useState(false)
  const api = window.lyra.connect
  const run = (p: Promise<unknown>): void => {
    setBusy(true)
    void p.finally(() => setBusy(false))
  }
  const oneTime = status.codes.find((c) => !c.party)
  const party = status.codes.find((c) => c.party)

  return (
    <>
      <div className="srow">
        <div className="srow__label">
          <span>Connect other screens</span>
          <small>Same Wi-Fi, no internet needed. Phones, tablets, TVs and other PCs show your song, lyrics, video and look in time with this PC, and paired ones can control it. Off by default</small>
        </div>
        <div className="srow__ctl">
          <button type="button" role="switch" aria-checked={status.enabled} aria-label="Connect other screens" className="switch" disabled={busy} onClick={() => run(api.setEnabled(!status.enabled))}>
            <i />
          </button>
        </div>
      </div>

      {status.noNetwork && <p className="hint">This PC is not on a Wi-Fi or Ethernet network, so there is nothing to connect to yet.</p>}

      {status.running && (
        <>
          <div className="tvlink">
            {oneTime?.qr ? <img src={oneTime.qr} width={150} height={150} alt="Pairing QR code" /> : <div style={{ width: 150, height: 150 }} />}
            <div>
              {oneTime ? (
                <>
                  <p className="hint">
                    Scan with the new device&apos;s camera, or open <b>{status.url?.replace('http://', '')}</b> and type the code:
                  </p>
                  <code style={{ fontSize: '1.4em', letterSpacing: '.12em' }}>{oneTime.display}</code>
                  <p className="hint">
                    Works once. <Countdown until={oneTime.expiresAt} />
                  </p>
                </>
              ) : (
                <p className="hint">Make a code, then scan it on the device you want to add.</p>
              )}
              <button type="button" className="pill" disabled={busy} onClick={() => run(api.newCode('viewer'))}>
                Add a viewer
              </button>{' '}
              <button type="button" className="pill" disabled={busy} onClick={() => run(api.newCode('controller'))}>
                Add a controller
              </button>
              <p className="hint">A viewer only watches. A controller can also play, pause, skip, seek, change volume and vibe.</p>
            </div>
          </div>

          <div className="srow">
            <div className="srow__label">
              <span>Party mode</span>
              <small>One code for a group: guests scan it and watch the same song together (viewers only). Guests are removed when the party ends</small>
            </div>
            <div className="srow__ctl">
              <button type="button" className="pill" disabled={busy} onClick={() => run(api.party(!status.party))}>
                {status.party ? 'End party' : 'Start party'}
              </button>
            </div>
          </div>
          {party?.qr && (
            <div className="tvlink">
              <img src={party.qr} width={150} height={150} alt="Party QR code" />
              <div>
                <code style={{ fontSize: '1.4em', letterSpacing: '.12em' }}>{party.display}</code>
                <p className="hint">
                  Shared code. <Countdown until={party.expiresAt} />
                </p>
              </div>
            </div>
          )}

          <div className="health" role="list" aria-label="Connected devices">
            {status.devices.length === 0 && <p className="hint">No devices yet.</p>}
            {status.devices.map((d) => (
              <div key={d.id} className="health__row" data-state={d.online ? 'ok' : 'slow'} role="listitem">
                <i className="health__dot" />
                <span>
                  {d.name}
                  {d.guest ? ' (guest)' : ''}
                </span>
                <small>{d.online ? 'connected' : 'offline'}</small>
                {!d.guest && (
                  <select aria-label={`Role of ${d.name}`} value={d.role} disabled={busy} onChange={(e) => run(api.setRole(d.id, e.target.value as 'viewer' | 'controller'))}>
                    <option value="viewer">Viewer</option>
                    <option value="controller">Controller</option>
                  </select>
                )}
                <button type="button" className="pill" disabled={busy} onClick={() => run(api.revoke(d.id))}>
                  Disconnect
                </button>
              </div>
            ))}
          </div>
          <p className="hint">Devices stay paired until you disconnect them. Traffic stays on your local network and is not encrypted: pair only on a network you trust.</p>
        </>
      )}
    </>
  )
}
