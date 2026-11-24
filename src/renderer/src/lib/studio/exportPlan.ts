import type { LyricLine } from '@shared/types'
import type { Fps, Quality } from './encodePolicy'

/**
 * Pure helpers around an export that the dialog shows: platform presets, size and time estimates, the lyrics as
 * .lrc / .srt files, and a text that explains a failure. No Electron, no DOM: all of it is tested.
 */

export type Shape = '9:16' | '4:5' | '1:1' | '16:9'

export interface PlatformPreset {
  id: 'reels' | 'tiktok' | 'shorts' | 'youtube' | 'feed'
  label: string
  ratio: Shape
  quality: Quality
  fps: Fps
  /** the longest video the platform takes (seconds), 0 = no practical limit */
  maxSeconds: number
  hint: string
}

export const PLATFORM_PRESETS: readonly PlatformPreset[] = [
  { id: 'reels', label: 'Instagram Reels', ratio: '9:16', quality: '1080p', fps: 30, maxSeconds: 90, hint: '9:16, 1080p, 30 fps, up to 90 s' },
  { id: 'tiktok', label: 'TikTok', ratio: '9:16', quality: '1080p', fps: 30, maxSeconds: 600, hint: '9:16, 1080p, 30 fps' },
  { id: 'shorts', label: 'YouTube Shorts', ratio: '9:16', quality: '1080p', fps: 60, maxSeconds: 60, hint: '9:16, 1080p, 60 fps, up to 60 s' },
  { id: 'youtube', label: 'YouTube', ratio: '16:9', quality: '1080p', fps: 60, maxSeconds: 0, hint: '16:9, 1080p, 60 fps' },
  { id: 'feed', label: 'Instagram feed', ratio: '4:5', quality: '1080p', fps: 30, maxSeconds: 60, hint: '4:5, 1080p, 30 fps' }
]

/** The preset that matches these settings exactly, or null. */
export function platformOf(ratio: Shape, quality: Quality, fps: Fps): PlatformPreset['id'] | null {
  return PLATFORM_PRESETS.find((p) => p.ratio === ratio && p.quality === quality && p.fps === fps)?.id ?? null
}

/** Is the chosen part longer than the platform takes? Returns the platform's limit in seconds, or 0. */
export function overLimit(preset: PlatformPreset | undefined, partSeconds: number): number {
  return preset && preset.maxSeconds > 0 && partSeconds > preset.maxSeconds + 0.5 ? preset.maxSeconds : 0
}

/** File size in bytes of a video with this bitrate (video + 192 kbit/s sound) for this many seconds, plus the closing card. */
export function estimateBytes(videoBitrate: number, seconds: number, endCardSeconds = 2.8): number {
  return Math.round(((videoBitrate + 192_000) * (seconds + endCardSeconds)) / 8)
}

/** "12 MB", "1.4 GB" */
export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  return `${Math.max(1, Math.round(n / 1024 ** 2))} MB`
}

/** m:ss (or h:mm:ss from an hour on) */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}

/**
 * How long is left? From the share done and the time spent on it. Null while too little is known to say (the first
 * seconds, or no progress), so the dialog shows nothing instead of a wild guess.
 */
export function remainingSeconds(elapsedSeconds: number, doneFraction: number): number | null {
  if (!(doneFraction > 0.03) || elapsedSeconds < 3 || doneFraction >= 1) return null
  return Math.max(0, (elapsedSeconds / doneFraction) * (1 - doneFraction))
}

/** A rough total time for the whole export, for the setup screen: "about 3 min". */
export function estimateDuration(partSeconds: number, method: 'smooth' | 'instant' | 'file'): { seconds: number; text: string } {
  // smooth: the song plays once in real time, then the video is drawn at about 2x real time on a typical PC
  // instant: real time; file: drawn at about 3x real time
  const seconds = method === 'smooth' ? partSeconds * 1.5 + 8 : method === 'instant' ? partSeconds + 6 : partSeconds / 3 + 5
  const min = Math.round(seconds / 60)
  return { seconds, text: seconds < 50 ? 'under a minute' : `about ${Math.max(1, min)} min` }
}

/** Has the drive enough room? Needs the video plus a safety margin (the temporary pictures live in the temp folder, not here). */
export function enoughSpace(freeBytes: number | null | undefined, neededBytes: number): boolean {
  if (freeBytes === null || freeBytes === undefined) return true
  return freeBytes >= neededBytes * 1.2 + 50 * 1024 * 1024
}

const pad = (n: number, w = 2): string => String(Math.floor(n)).padStart(w, '0')

/** [mm:ss.xx] for .lrc */
export function lrcStamp(ms: number): string {
  const t = Math.max(0, Math.round(ms / 10))
  return `${pad(t / 6000)}:${pad((t % 6000) / 100)}.${pad(t % 100)}`
}

/** hh:mm:ss,mmm for .srt */
export function srtStamp(ms: number): string {
  const t = Math.max(0, Math.round(ms))
  return `${pad(t / 3_600_000)}:${pad((t % 3_600_000) / 60_000)}:${pad((t % 60_000) / 1000)},${pad(t % 1000, 3)}`
}

/** The part [startMs, endMs] of the lyrics with times counted from the start of the video (what a video editor needs). */
export function linesInPart(lines: readonly LyricLine[], startMs: number, endMs: number, offsetMs = 0): Array<{ start: number; end: number; text: string }> {
  const out: Array<{ start: number; end: number; text: string }> = []
  const sorted = [...lines].filter((l) => l.text.trim()).sort((a, b) => a.timeMs - b.timeMs)
  for (let i = 0; i < sorted.length; i++) {
    const l = sorted[i]!
    const begin = l.timeMs + offsetMs
    const next = sorted[i + 1]
    // a line stays until the next one starts, but never longer than 6 s (a long instrumental gap shows nothing)
    const natural = Math.min(l.endMs !== undefined ? l.endMs + offsetMs : Infinity, next ? next.timeMs + offsetMs : Infinity, begin + 6000)
    const finish = Math.max(begin + 600, natural)
    if (finish <= startMs || begin >= endMs) continue
    out.push({ start: Math.max(0, begin - startMs), end: Math.min(endMs, finish) - startMs, text: l.text.trim() })
  }
  return out
}

export function toLrc(lines: readonly LyricLine[], startMs: number, endMs: number, offsetMs = 0): string {
  return linesInPart(lines, startMs, endMs, offsetMs).map((l) => `[${lrcStamp(l.start)}]${l.text}`).join('\n') + '\n'
}

export function toSrt(lines: readonly LyricLine[], startMs: number, endMs: number, offsetMs = 0): string {
  return (
    linesInPart(lines, startMs, endMs, offsetMs)
      .map((l, i) => `${i + 1}\n${srtStamp(l.start)} --> ${srtStamp(l.end)}\n${l.text}\n`)
      .join('\n')
  )
}

/** What to tell the user in plain words when an export fails; the raw message stays in the diagnostics. */
export function friendlyError(message: string): { title: string; advice: string } {
  const m = message.toLowerCase()
  if (/enospc|no space|disk is full|not enough space|full/.test(m)) return { title: 'The disk is full', advice: 'Free some space on that drive (or pick another folder) and try again.' }
  if (/eperm|eacces|permission|denied|ebusy|being used/.test(m)) return { title: 'Lyra can not write to that place', advice: 'Pick another folder, such as Videos, and make sure the file is not open in another program.' }
  if (/no sound|system sound|did not provide/.test(m)) return { title: 'No sound arrived', advice: 'Make sure the song plays out loud on this PC (not muted, the right output device) and try again.' }
  if (/lyrics screen/.test(m)) return { title: 'The lyrics screen could not be filmed', advice: 'Try “Simple layout”, or restart Lyra and try again.' }
  if (/youtube/.test(m)) return { title: 'The background video can not be used', advice: 'Pick “Cover colours” or another video, then try again.' }
  if (/can not encode|encode|encoder|codec/.test(m)) return { title: 'This PC can not make that video', advice: 'Pick a lower quality (720p) or 30 fps and try again.' }
  if (/jump to the start|play a song/.test(m)) return { title: 'The song did not start', advice: 'Press play in Lyra, wait until the song is playing, and try again.' }
  return { title: 'The video could not be finished', advice: 'Try again with a lower quality. If it keeps failing, copy the details below and send them with a bug report.' }
}

export interface DiagnosticsInput {
  error: string
  options: Record<string, unknown>
  platform: string
  cores?: number
  memoryGb?: number
  version?: string
  at?: Date
}

/** A short plain-text report the user can paste into a bug report. Holds no song names, paths or personal data. */
export function buildDiagnostics(d: DiagnosticsInput): string {
  const o = Object.entries(d.options)
    .map(([k, v]) => `  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join('\n')
  const err = d.error.replace(/[A-Za-z]:\\[^\s"']+/g, '<path>').replace(/\/(?:Users|home)\/[^\s"']+/g, '<path>').slice(0, 600)
  return [`Lyra export problem${d.version ? ` (Lyra ${d.version})` : ''}`, `When: ${(d.at ?? new Date()).toISOString()}`, `System: ${d.platform}, ${d.cores ?? '?'} cores, ${d.memoryGb ?? '?'} GB (reported)`, `Error: ${err}`, 'Settings:', o].join('\n')
}
