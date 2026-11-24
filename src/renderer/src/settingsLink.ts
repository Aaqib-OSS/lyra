import { useUi } from '@/store/ui'

export const SETTINGS_OPEN_EVENT = 'lyra:settings-open'

export interface SettingsTarget {
  /** a section id of the Settings page: look, lyrics, general, share, about (bg and phone on Android) */
  tab?: string
  /** pre-fill the search box, e.g. a setting name */
  query?: string
}

/** Open Settings at a section (or with a search), also when the page is already open. Used by deep links from other screens. */
export function openSettings(target: SettingsTarget = {}): void {
  if (target.tab) sessionStorage.setItem('lyra.settingsTab', target.tab)
  if (target.query !== undefined) sessionStorage.setItem('lyra.settingsQuery', target.query)
  useUi.getState().setPanel('settings')
  window.dispatchEvent(new CustomEvent<SettingsTarget>(SETTINGS_OPEN_EVENT, { detail: target }))
}
