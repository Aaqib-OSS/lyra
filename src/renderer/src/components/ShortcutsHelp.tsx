import { useEffect, useRef } from 'react'
import { GLOBAL_SHORTCUTS, LOCAL_SHORTCUTS, effectiveAccel } from '@shared/shortcuts'
import { useSettings } from '@/store/settings'
import { requestMode, useUi } from '@/store/ui'

const pretty = (accel: string): string => accel.replace(/Control/g, 'Ctrl').replace(/Super/g, 'Win')

/** Open the keys sheet; in the small widgets that first opens the expanded player (the sheet needs room). */
export function openShortcuts(): void {
  const ui = useUi.getState()
  if (ui.mode === 'compact' || ui.mode === 'minimal') requestMode('mini')
  ui.setHelp(true)
}

/** Every key in one place: the ones inside Lyra, and the system-wide ones (as the user has set them). */
export function ShortcutsHelp() {
  const setHelp = useUi((s) => s.setHelp)
  const enabled = useSettings((s) => s.settings.globalShortcuts)
  const overrides = useSettings((s) => s.settings.shortcuts)
  const close = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    close.current?.focus()
    // Esc closes this sheet only (capture + stop: the app's own Esc ladder must not also run)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' && e.key !== '?') return
      e.preventDefault()
      e.stopImmediatePropagation()
      setHelp(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      before?.focus?.()
    }
  }, [setHelp])

  return (
    <div className="keyhelp" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" data-nodrag onClick={(e) => e.target === e.currentTarget && setHelp(false)}>
      <div className="keyhelp__card">
        <header>
          <h2>Keyboard shortcuts</h2>
          <button type="button" ref={close} className="btn" onClick={() => setHelp(false)}>
            Close
          </button>
        </header>
        <h3>Inside Lyra</h3>
        <dl className="keys">
          {LOCAL_SHORTCUTS.map((k) => (
            <div key={k.keys}>
              <dt>{k.label}</dt>
              <dd>
                <kbd>{k.keys}</kbd>
              </dd>
            </div>
          ))}
        </dl>
        <h3>
          Anywhere on the PC <small>{enabled ? '' : '(off in Settings)'}</small>
        </h3>
        <dl className={`keys ${enabled ? '' : 'is-off'}`}>
          {GLOBAL_SHORTCUTS.map((k) => (
            <div key={k.id}>
              <dt>{k.label}</dt>
              <dd>
                <kbd>{pretty(effectiveAccel(k.id, overrides))}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
