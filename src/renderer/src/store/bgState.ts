import { create } from 'zustand'

/** Why no video is playing behind the lyrics (shown as a small note in the mini player). */
export interface BgReason {
  text: string
}

/** What the backdrop is currently showing, so the layout (cinema dock, wrong-video button) can adapt. */
export type VideoPhase = 'off' | 'searching' | 'loading' | 'live' | 'fallback' | 'failed'
export type VideoProblem = 'no-key' | 'none' | 'blocked' | 'timeout' | 'error' | 'offline'

export const useBgState = create<{
  /** where the video behind the lyrics is in its life: looked for, starting, playing, replaced by a clip, or given up */
  phase: VideoPhase
  problem: VideoProblem | null
  title: string
  channel: string
  /** the YouTube embed reports it is playing */
  ytReady: boolean
  /** the YouTube video behind the lyrics right now (shared with connected screens) */
  videoId: string | null
  setVideo(v: { phase: VideoPhase; problem?: VideoProblem | null; title?: string; channel?: string }): void
  media: 'none' | 'full' | 'mini'
  kind: string | null
  reason: BgReason | null
  /** a lyric video is being recorded: the mini player stops its own video so the export gets all the power */
  exporting: boolean
  setExporting(v: boolean): void
  set(v: { media: 'none' | 'full' | 'mini'; kind: string | null }): void
  setReason(r: BgReason | null): void
}>((set) => ({
  phase: 'off',
  problem: null,
  title: '',
  channel: '',
  ytReady: false,
  videoId: null,
  setVideo: (v) => set({ phase: v.phase, problem: v.problem ?? null, title: v.title ?? '', channel: v.channel ?? '' }),
  media: 'none',
  kind: null,
  reason: null,
  exporting: false,
  setExporting: (exporting) => set({ exporting }),
  set: (v) => set(v),
  setReason: (reason) => set({ reason })
}))
