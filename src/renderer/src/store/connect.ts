import { create } from 'zustand'
import type { ConnectStatus } from '@shared/ipc'
import { effectiveVibe } from '@/hooks/useVibe'
import { useBgState } from './bgState'
import { useOffsets } from './offsets'
import { usePlayer } from './player'
import { useSettings } from './settings'
import { useUi } from './ui'

/**
 * Devices (Lyra Connect), renderer side: the status shown in Settings, plus the publisher that tells the host
 * process what this window shows (vibe, video, lyric offset) so paired screens can match it. Song, position and
 * lyrics need no help from here: the main process already has them.
 */
const EMPTY: ConnectStatus = { enabled: false, running: false, noNetwork: false, url: null, party: false, devices: [], codes: [] }

export const useConnect = create<{ status: ConnectStatus; set(s: ConnectStatus): void }>((set) => ({ status: EMPTY, set: (status) => set({ status }) }))

let timer: ReturnType<typeof setTimeout> | undefined
let last = ''

function publish(): void {
  if (!useConnect.getState().status.running) return
  const s = useSettings.getState().settings
  const track = usePlayer.getState().snapshot?.track
  const view = {
    vibe: effectiveVibe(s, useUi.getState().vibeNow).vibe,
    mode: s.vibeMode,
    videoId: useBgState.getState().videoId,
    offsetMs: (s.lyricOffsetMs || 0) + (track ? (useOffsets.getState().map[track.id] ?? 0) : 0)
  }
  const key = JSON.stringify(view)
  if (key === last) return
  last = key
  window.lyra.connect.publishView(view)
}

const soon = (): void => {
  clearTimeout(timer)
  timer = setTimeout(publish, 150) // several stores often change together: send once
}

/** Start listening to the host's status and reporting this window's look. Returns a cleanup. */
export function initConnect(): () => void {
  const api = window.lyra.connect
  void api.status().then((st) => {
    useConnect.getState().set(st)
    soon()
  })
  const offs = [
    api.onChange((st) => {
      const wasRunning = useConnect.getState().status.running
      useConnect.getState().set(st)
      if (st.running && !wasRunning) {
        last = ''
        soon()
      }
    }),
    useSettings.subscribe(soon),
    useUi.subscribe(soon),
    useBgState.subscribe(soon),
    useOffsets.subscribe(soon),
    usePlayer.subscribe((s, p) => s.snapshot?.track?.id !== p.snapshot?.track?.id && soon())
  ]
  return () => offs.forEach((f) => f())
}
