import { requestMode, useUi } from '@/store/ui'

/** Open the keys panel (the one `?` opens); in the small widgets that first opens the expanded player (the panel needs room). */
export function openShortcuts(): void {
  const ui = useUi.getState()
  if (ui.mode === 'compact' || ui.mode === 'minimal') requestMode('mini')
  ui.setPanel('keys')
}
