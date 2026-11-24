import { GLOBAL_SHORTCUTS, LOCAL_SHORTCUTS, effectiveAccel } from '@shared/shortcuts'
import { useSettings } from '@/store/settings'

const pretty = (accel: string): string => accel.replace('Control', 'Ctrl').replace('Super', 'Win').replace(/\+/g, ' + ')

const SEEK = [
  { keys: 'Click or drag the bar', label: 'Jump to a spot (hover shows the time)' },
  { keys: '← / →  on the bar', label: 'Seek 5 s (Shift: 15 s)' },
  { keys: 'PgUp / PgDn  on the bar', label: 'Seek 30 s' },
  { keys: 'Home / End  on the bar', label: 'Start / end of the song' },
  { keys: 'Scroll over the volume', label: 'Louder / quieter' }
]

/** Press ? anywhere: every key Lyra answers to, with the global shortcuts as you set them. */
export function KeysPanel() {
  const overrides = useSettings((s) => s.settings.shortcuts)
  return (
    <div className="keys">
      <h4>In the app</h4>
      <dl>
        {LOCAL_SHORTCUTS.map((k) => (
          <div key={k.keys}>
            <dt>
              <kbd>{k.keys}</kbd>
            </dt>
            <dd>{k.label}</dd>
          </div>
        ))}
        {SEEK.map((k) => (
          <div key={k.keys}>
            <dt>
              <kbd>{k.keys}</kbd>
            </dt>
            <dd>{k.label}</dd>
          </div>
        ))}
      </dl>
      <h4>Anywhere on your PC</h4>
      <dl>
        {GLOBAL_SHORTCUTS.map((g) => (
          <div key={g.id}>
            <dt>
              <kbd>{pretty(effectiveAccel(g.id, overrides))}</kbd>
            </dt>
            <dd>{g.label}</dd>
          </div>
        ))}
      </dl>
      <p className="list__hint">Change the global ones in Settings. Press <kbd>?</kbd> again or Esc to close.</p>
    </div>
  )
}
