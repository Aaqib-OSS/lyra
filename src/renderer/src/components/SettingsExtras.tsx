import { useState } from 'react'
import { DEFAULT_SETTINGS, type Settings } from '@shared/types'
import { changedFromDefault, exportSettings, parseSettingsImport } from '@shared/settingsIo'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'

const TAB_NAMES: Record<string, string> = { look: 'Look', lyrics: 'Lyrics & video', general: 'Player', share: 'Connect', phone: 'Phone', about: 'About' }

/** Everything that is not on its default, each with its own Reset: the quickest way to see "what did I change?". */
export function ChangedList({ onShow }: { onShow(tab: string): void }) {
  const s = useSettings((x) => x.settings)
  const set = useSettings((x) => x.set)
  const items = changedFromDefault(s)
  const reset = (key: keyof Settings): void => {
    set({ [key]: structuredClone(DEFAULT_SETTINGS[key]) } as Partial<Settings>)
    if (key === 'defaultMode') void window.lyra.window.setMode(DEFAULT_SETTINGS.defaultMode)
  }
  return (
    <section aria-labelledby="changed-title">
      <h4 id="changed-title">Changed from the defaults</h4>
      {items.length === 0 ? (
        <p className="hint" role="status">Nothing changed. Every setting is on its default.</p>
      ) : (
        <>
          <p className="hint">These are the settings you changed. Reset puts one back; “Show” opens the section that holds it.</p>
          <ul className="changed" aria-label="Settings that differ from the defaults">
            {items.map((c) => (
              <li key={c.key} className="srow">
                <div className="srow__label">
                  <span>{c.label}</span>
                  <small>
                    {c.value} · {TAB_NAMES[c.tab] ?? c.tab}
                  </small>
                </div>
                <div className="srow__ctl">
                  <button type="button" className="pill" onClick={() => onShow(c.tab)} aria-label={`Show ${c.label}`}>
                    Show
                  </button>
                  <button type="button" className="pill" onClick={() => reset(c.key)} aria-label={`Reset ${c.label} to its default`}>
                    Reset
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** Copy the settings as text (to keep or move to another PC) and paste them back in. */
export function BackupSection() {
  const s = useSettings((x) => x.settings)
  const set = useSettings((x) => x.set)
  const toast = useUi((x) => x.toast)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  const copy = async (): Promise<void> => {
    const out = exportSettings(s)
    let ok = false
    try {
      ok = await window.lyra.app.copy(out)
    } catch {
      /* fall through to the browser clipboard */
    }
    if (!ok) {
      try {
        await navigator.clipboard.writeText(out)
        ok = true
      } catch {
        ok = false
      }
    }
    toast(ok ? 'Settings copied. Your account id, window place and per-song picks are not included.' : 'Couldn’t copy the settings', ok ? undefined : 'error')
  }

  const apply = (): void => {
    const r = parseSettingsImport(text)
    if (!r.ok) return setError(r.error)
    set(r.patch)
    setError('')
    setText('')
    setOpen(false)
    toast(`Imported ${r.count} setting${r.count === 1 ? '' : 's'}`)
  }

  return (
    <section aria-labelledby="backup-title">
      <h4 id="backup-title">Back up or move settings</h4>
      <div className="srow">
        <div className="srow__label">
          <span>Copy my settings</span>
          <small>As plain text you can keep or paste on another PC. Leaves out your account id, window place and what you picked for single songs.</small>
        </div>
        <div className="srow__ctl">
          <button type="button" className="pill" onClick={() => void copy()}>
            Copy
          </button>
        </div>
      </div>
      <div className="srow">
        <div className="srow__label">
          <span>Import settings</span>
          <small>Paste text copied from Lyra. Only settings Lyra knows are used, and each value is checked.</small>
        </div>
        <div className="srow__ctl">
          <button type="button" className="pill" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? 'Cancel' : 'Import'}
          </button>
        </div>
      </div>
      {open && (
        <div className="importbox">
          <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Settings text to import" aria-invalid={!!error} rows={5} spellCheck={false} placeholder="Paste the settings text here" />
          {error && (
            <small role="alert" style={{ color: 'var(--danger, #ff8a8a)' }}>
              {error}
            </small>
          )}
          <button type="button" className="pill" disabled={!text.trim()} onClick={apply}>
            Apply
          </button>
        </div>
      )}
    </section>
  )
}
