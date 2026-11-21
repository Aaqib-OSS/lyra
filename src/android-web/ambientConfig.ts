import { useSettings } from '@/store/settings'
import { rpc } from './rpc'

/**
 * Mirrors the ambient settings to the phone's native side, which needs them without a web page: opening the ambient
 * screen when the charger is plugged in, the native always-on lyrics view, the screen saver and the lock-screen card.
 */
let last = ''

function push(): void {
  const s = useSettings.getState().settings
  const cfg = {
    style: s.ambientStyle,
    trigger: s.ambientTrigger,
    brightness: s.ambientBrightness,
    auto: s.ambientAutoBrightness,
    clock: s.ambientClock,
    shift: s.ambientPixelShift,
    cardOff: s.ambientCardWhenOff
  }
  const json = JSON.stringify(cfg)
  if (json === last) return
  last = json
  void rpc('ambientConfig', json).catch(() => {
    last = '' // try again on the next change
  })
}

export function startAmbientConfig(): void {
  useSettings.subscribe(push)
  push()
}
