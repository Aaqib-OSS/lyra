import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { createHash } from 'node:crypto'
import type { CommandResult, PlaybackSnapshot, PlayerCommand, QueueItem, RecentItem, Track } from '@shared/types'
import { PlaybackSource } from '../source'
import { createLogger } from '../logger'
import { PLAYERCTL_FORMAT, parsePlayerctlLine, playerctlArgs, type MprisState } from './parse'

const log = createLogger('mpris')

/**
 * Linux playback source: whatever MPRIS player is running (Spotify, VLC, browsers...), read through `playerctl`.
 * GROUNDWORK: not selected anywhere yet (the source picker, settings text and packaging are still Windows-only, and it has
 * never run on a real Linux desktop). Needs `playerctl` installed; says so in the status message when it is missing.
 * macOS has no equivalent CLI: the private MediaRemote framework would need a signed native helper (see docs/platforms-research.md).
 */
export class MprisSource extends PlaybackSource {
  readonly kind = 'mpris' as const
  private proc: ChildProcessWithoutNullStreams | null = null
  private stopped = true
  private restartTimer: NodeJS.Timeout | null = null
  private failures = 0

  start(): void {
    if (process.platform !== 'linux') {
      this.setStatus({ state: 'offline', message: 'MPRIS media controls are only available on Linux.' })
      return
    }
    this.stopped = false
    this.setStatus({ state: 'local', message: 'Linux media player · MPRIS' })
    this.spawnFollower()
  }

  stop(): void {
    this.stopped = true
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = null
    this.proc?.kill()
    this.proc = null
  }

  private spawnFollower(): void {
    const proc = spawn('playerctl', ['--follow', 'metadata', '--format', PLAYERCTL_FORMAT])
    this.proc = proc
    createInterface({ input: proc.stdout }).on('line', (l) => this.onLine(l))
    proc.on('error', (e: NodeJS.ErrnoException) => {
      const missing = e.code === 'ENOENT'
      this.onExit(missing ? 'playerctl is not installed (sudo apt install playerctl)' : e.message, proc, missing)
    })
    proc.on('exit', (code) => this.onExit(`playerctl exited (${code})`, proc, false))
  }

  private onExit(why: string, from: ChildProcessWithoutNullStreams, missing: boolean): void {
    if (from !== this.proc) return
    this.proc = null
    if (this.stopped) return
    this.failures++
    log.warn(why)
    this.setStatus({ state: 'offline', message: `${why}. Retrying…`, retryInSec: missing ? 30 : 3 })
    this.restartTimer = setTimeout(() => !this.stopped && this.spawnFollower(), missing ? 30_000 : Math.min(15_000, 3000 * this.failures))
  }

  private onLine(raw: string): void {
    const m = parsePlayerctlLine(raw)
    if (!m) return
    this.failures = 0
    if (this.status.state !== 'local') this.setStatus({ state: 'local', message: 'Linux media player · MPRIS' })
    this.setSnapshot(this.toSnapshot(m))
  }

  private toSnapshot(m: MprisState): PlaybackSnapshot {
    const base = {
      sampledAt: Date.now(),
      device: { id: null, name: m.player ? `${m.player} · Linux` : 'Linux', type: 'Computer', volumePercent: null, supportsVolume: false },
      shuffle: false,
      repeat: 'off' as const
    }
    if (m.idle) return { ...base, track: null, isPlaying: false, positionMs: 0, isAdOrUnknown: false }
    const id = 'mpris:' + createHash('sha1').update(`${m.title}|${m.artist}|${m.album}|${Math.round(m.durationMs / 1000)}`).digest('hex').slice(0, 16)
    const track: Track = {
      id,
      uri: id,
      title: m.title,
      artists: m.artist ? [m.artist] : [],
      album: m.album,
      releaseYear: null,
      durationMs: m.durationMs,
      artworkUrl: m.artUrl,
      explicit: false,
      webUrl: null
    }
    return { ...base, track, isPlaying: m.playing, positionMs: m.positionMs, isAdOrUnknown: false }
  }

  async command(cmd: PlayerCommand): Promise<CommandResult> {
    const args = playerctlArgs(cmd)
    if (!args) return { ok: false, reason: 'unsupported', error: 'This player can’t do that through the Linux media controls.' }
    return new Promise((resolve) => {
      execFile('playerctl', args, { timeout: 4000 }, (err) => resolve(err ? { ok: false, reason: 'offline', error: 'playerctl could not reach a player.' } : { ok: true }))
    })
  }

  async isLiked(): Promise<boolean | null> {
    return null
  }
  async setLiked(): Promise<CommandResult> {
    return { ok: false, reason: 'unsupported', error: 'Likes are not available for Linux players yet.' }
  }
  async queue(): Promise<QueueItem[] | null> {
    return null
  }
  async recent(): Promise<RecentItem[] | null> {
    return null
  }
}
