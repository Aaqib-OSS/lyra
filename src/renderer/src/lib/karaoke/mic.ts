import { centsFromNearestNote, detectPitch, rms } from './pitch'
import type { Frame } from './score'

/**
 * The singer's microphone, read about 20 times a second: is the voice there, and which note is it on. No echo
 * cancelling, noise gate or auto gain (they would eat the singing). A short calibration listens to the room first; the
 * voice must be clearly louder than that. Nothing leaves the device: the stream feeds an analyser, and only when the
 * user turns "record my voice" on does a MediaRecorder keep a copy, in memory, until the user saves it or leaves.
 */
export interface Mic {
  /** level of the voice, 0..1, for the meter */
  level(): number
  /** the room as measured (rms) */
  ambient(): number
  /** name of the device in use, when the browser tells */
  label: string
  /** start calling back with a reading; returns stop */
  watch(cb: (f: { rms: number; voiced: boolean; cents: number | null; hz: number | null }) => void): () => void
  /** listen for a moment and set the threshold from the room */
  calibrate(ms: number): Promise<number>
  /** called once when the microphone goes away (unplugged, permission withdrawn) */
  onLost(cb: () => void): void
  /** keep a copy of the voice in memory (opus); `stopRecording` resolves with it, or null when nothing was kept */
  startRecording(maxBytes?: number): boolean
  stopRecording(): Promise<Blob | null>
  stop(): void
}

export type MicProblem = 'denied' | 'missing' | 'busy' | 'unsupported' | 'other'

/** What went wrong when the microphone could not be opened, in terms the user can act on. */
export function classifyMicError(e: unknown): MicProblem {
  const name = (e as { name?: string } | null)?.name ?? ''
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') return 'missing'
  if (name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError') return 'busy'
  if (name === 'TypeError' || name === 'NotSupportedError') return 'unsupported'
  return 'other'
}

export const MIC_PROBLEM_TEXT: Record<MicProblem, string> = {
  denied: 'Microphone access is blocked. Allow it in the system privacy settings (Microphone) and try again.',
  missing: 'No microphone was found. Plug one in, or sing along without a score.',
  busy: 'The microphone is in use by another app. Close that app and try again.',
  unsupported: 'This device cannot give Lyra a microphone.',
  other: 'The microphone could not be opened.'
}

export async function openMic(): Promise<Mic> {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no media devices'), { name: 'NotSupportedError' })
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
  const ctx = new AudioContext()
  // a context made without a user gesture can start suspended: a silent meter that looks like a dead microphone
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
  const src = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  src.connect(analyser)
  const buf = new Float32Array(analyser.fftSize)
  let gate = 0.02
  let room = 0
  let lastLevel = 0
  let lost: (() => void) | null = null
  let stopped = false
  const track = stream.getAudioTracks()[0]
  const fireLost = (): void => {
    if (stopped) return
    const cb = lost
    lost = null
    cb?.()
  }
  track?.addEventListener('ended', fireLost)

  let rec: MediaRecorder | null = null
  let chunks: Blob[] = []
  let bytes = 0

  const read = (): { rms: number; voiced: boolean; cents: number | null; hz: number | null } => {
    analyser.getFloatTimeDomainData(buf)
    const r = rms(buf)
    lastLevel = r
    const voiced = r > gate
    let cents: number | null = null
    let hz: number | null = null
    if (voiced) {
      const p = detectPitch(buf, ctx.sampleRate)
      if (p && p.clarity >= 0.8) {
        hz = p.hz
        cents = centsFromNearestNote(p.hz)
      }
    }
    return { rms: r, voiced, cents, hz }
  }

  return {
    label: track?.label ?? '',
    level: () => Math.min(1, lastLevel * 6),
    ambient: () => room,
    onLost(cb) {
      lost = cb
    },
    watch(cb) {
      const id = window.setInterval(() => {
        // an ended track (unplugged) delivers silence forever: tell the screen instead of scoring it
        if (track && track.readyState === 'ended') fireLost()
        cb(read())
      }, 50)
      return () => window.clearInterval(id)
    },
    async calibrate(ms) {
      const samples: number[] = []
      const t0 = performance.now()
      while (performance.now() - t0 < ms) {
        analyser.getFloatTimeDomainData(buf)
        samples.push(rms(buf))
        await new Promise((r) => setTimeout(r, 50))
      }
      samples.sort((a, b) => a - b)
      room = samples[Math.floor(samples.length * 0.9)] ?? 0
      // capped: singing during the calibration, or a loud room, must not push the gate above a normal voice
      gate = Math.min(0.06, Math.max(0.012, room * 2.2))
      return gate
    },
    startRecording(maxBytes = 20 * 1024 * 1024) {
      if (rec || typeof MediaRecorder === 'undefined') return false
      try {
        const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported(m))
        rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : { audioBitsPerSecond: 64000 })
      } catch {
        rec = null
        return false
      }
      chunks = []
      bytes = 0
      rec.ondataavailable = (e) => {
        if (!e.data.size) return
        bytes += e.data.size
        // a size limit: past it the take stops growing (a 20 MB opus file is over an hour of singing)
        if (bytes > maxBytes) {
          if (rec && rec.state !== 'inactive') rec.stop()
          return
        }
        chunks.push(e.data)
      }
      rec.start(1000)
      return true
    },
    stopRecording() {
      const r = rec
      rec = null
      if (!r) return Promise.resolve(null)
      return new Promise((resolve) => {
        const done = (): void => resolve(chunks.length ? new Blob(chunks, { type: r.mimeType || 'audio/webm' }) : null)
        if (r.state === 'inactive') return done()
        r.onstop = done
        try {
          r.stop()
        } catch {
          done()
        }
      })
    },
    stop() {
      stopped = true
      if (rec && rec.state !== 'inactive') {
        try {
          rec.stop()
        } catch {
          /* already stopped */
        }
      }
      stream.getTracks().forEach((t) => t.stop())
      void ctx.close().catch(() => undefined)
    }
  }
}

export type { Frame }
