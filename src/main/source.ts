import { EventEmitter } from 'node:events'
import type {
  CommandResult,
  ConnectionStatus,
  PlaybackSnapshot,
  PlayerCommand,
  QueueItem,
  RecentItem
} from '@shared/types'

/**
 * A playback backend. Spotify is the only real one today; the interface is what
 * a future provider (Apple Music, local player, ...) would implement.
 * Emits: 'snapshot' (PlaybackSnapshot), 'status' (ConnectionStatus).
 */
export abstract class PlaybackSource extends EventEmitter {
  abstract readonly kind: 'spotify' | 'demo' | 'smtc' | 'mpris'
  protected status: ConnectionStatus = { state: 'disconnected' }
  protected snapshot: PlaybackSnapshot | null = null

  abstract start(): void
  abstract stop(): void
  abstract command(cmd: PlayerCommand): Promise<CommandResult>
  abstract isLiked(trackId: string): Promise<boolean | null>
  abstract setLiked(trackId: string, liked: boolean): Promise<CommandResult>
  abstract queue(): Promise<QueueItem[] | null>
  abstract recent(): Promise<RecentItem[] | null>
  /** Hint that the window is hidden / visible so pollers can slow down. */
  setBackground(_hidden: boolean): void {
    /* optional */
  }

  /** The machine woke from sleep / was unlocked: refresh now instead of waiting out a stale timer. */
  wake(): void {
    /* optional */
  }

  getStatus(): ConnectionStatus {
    return this.status
  }
  getSnapshot(): PlaybackSnapshot | null {
    return this.snapshot
  }

  protected setStatus(s: ConnectionStatus): void {
    this.status = { ...s, source: this.kind }
    this.emit('status', this.status)
  }
  protected setSnapshot(s: PlaybackSnapshot): void {
    this.snapshot = s
    this.emit('snapshot', s)
  }
}
