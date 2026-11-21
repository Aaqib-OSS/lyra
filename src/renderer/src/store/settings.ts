import { create } from 'zustand'
import { DEFAULT_SETTINGS, type Settings } from '@shared/types'

interface SettingsStore {
  settings: Settings
  loaded: boolean
  init(): Promise<void>
  set(patch: Partial<Settings>): void
}

/**
 * How the lyrics and the screen are arranged is designed per vibe and per device, not chosen by the listener:
 * the saved values of the old layout / typeface / size / spacing / animation / rim-light settings are ignored.
 */
const lockLook = (s: Settings): Settings => ({
  ...s,
  lyricFont: DEFAULT_SETTINGS.lyricFont,
  lyricFontSize: DEFAULT_SETTINGS.lyricFontSize,
  lineSpacing: DEFAULT_SETTINGS.lineSpacing,
  lyricAnimation: DEFAULT_SETTINGS.lyricAnimation,
  fullLayout: DEFAULT_SETTINGS.fullLayout,
  rimLight: true
})

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  async init() {
    set({ settings: lockLook(await window.lyra.settings.get()), loaded: true })
    window.lyra.settings.onChange((s) => set({ settings: lockLook(s) }))
  },
  set(patch) {
    set({ settings: { ...get().settings, ...patch } }) // optimistic; main echoes the sanitised value back
    void window.lyra.settings.set(patch)
  }
}))
