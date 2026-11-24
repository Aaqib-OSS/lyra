import { create } from 'zustand'
import type { ViewMode, Vibe } from '@shared/types'

export type Panel = 'none' | 'queue' | 'moments' | 'settings' | 'lyrics' | 'keys'
export interface Toast {
  id: number
  message: string
  kind: 'info' | 'error'
}

interface UiStore {
  mode: ViewMode
  panel: Panel
  distractionFree: boolean
  /** the keyboard shortcuts sheet (`?`) */
  /** an action chosen in the widget's menu that needs the roomy player: it runs once that player is on screen */
  pending: 'karaoke' | 'studio' | null
  toasts: Toast[]
  /** the vibe chosen for the current song by cycle / smart mode (never saved) */
  vibeNow: Vibe | null
  vibeWhy: string
  setVibeNow(v: Vibe | null, why?: string): void
  setMode(mode: ViewMode): void
  setPending(p: UiStore['pending']): void
  setPanel(p: Panel): void
  togglePanel(p: Exclude<Panel, 'none'>): void
  toggleDistractionFree(): void
  toast(message: string, kind?: Toast['kind']): void
  dismissToast(id: number): void
}

let toastId = 0

export const useUi = create<UiStore>((set, get) => ({
  mode: 'compact',
  panel: 'none',
  distractionFree: false,
  pending: null,
  toasts: [],
  vibeNow: null,
  vibeWhy: '',
  setVibeNow: (vibeNow, why = '') => set({ vibeNow, vibeWhy: why }),
  setMode(mode) {
    set({ mode, panel: mode === 'compact' || mode === 'minimal' ? 'none' : get().panel })
  },
  setPending: (pending) => set({ pending }),
  setPanel: (panel) => set({ panel }),
  togglePanel: (p) => set({ panel: get().panel === p ? 'none' : p }),
  toggleDistractionFree: () => set({ distractionFree: !get().distractionFree }),
  toast(message, kind = 'info') {
    const id = ++toastId
    set({ toasts: [...get().toasts.filter((t) => t.message !== message).slice(-2), { id, message, kind }] })
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 6000 : 3000)
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) })
}))

/** Ask the main process to change window mode; the echo from main updates `mode`. */
export const requestMode = (mode: ViewMode): void => {
  void window.lyra.window.setMode(mode)
}
