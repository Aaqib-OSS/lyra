/**
 * Pure polling decisions for the Spotify source (no Electron, so they are unit tested).
 * Costs matter: every poll is a request against Spotify's rate limit, so we slow down when nothing happens
 * and when the window is hidden, and snap back to fast the moment something changes.
 */

export interface DelayInput {
  hasTrack: boolean
  isPlaying: boolean
  background: boolean
  /** estimated position now (ms) and the track length, to wake right after the track ends */
  positionNowMs: number
  durationMs: number
  /** how long nothing has been playing (ms); 0 while playing */
  idleForMs: number
}

const MIN = 60_000

/** How long to wait before the next poll. */
export function nextPollDelay(i: DelayInput): number {
  if (i.hasTrack && i.isPlaying) {
    const base = i.background ? 8_000 : 3_000
    const remaining = i.durationMs - i.positionNowMs
    // wake right after the track ends so the next one is noticed quickly
    return remaining > 0 ? Math.max(500, Math.min(base, remaining + 400)) : base
  }
  // idle or paused: the longer it stays that way the less often we ask
  const stage = i.idleForMs < MIN ? 0 : i.idleForMs < 5 * MIN ? 1 : i.idleForMs < 15 * MIN ? 2 : 3
  const nothing = [5_000, 10_000, 20_000, 30_000][stage]!
  const paused = [6_000, 10_000, 15_000, 30_000][stage]!
  const v = i.hasTrack ? paused : nothing
  return i.background ? Math.min(60_000, v * 2) : v
}

/** Exponential backoff after failures, with +-20% jitter. `rand` is injectable for tests. */
export function backoffMs(failures: number, rand: () => number = Math.random): number {
  const base = Math.min(30_000, 2_000 * 2 ** Math.min(Math.max(failures, 1), 4))
  return Math.round(base * (0.8 + rand() * 0.4))
}

export const MAX_RETRY_AFTER_SEC = 300

/** Retry-After from a 429, clamped to something sane (a missing header means 10 s). */
export function retryAfterSec(raw: number | undefined): number {
  if (!raw || !Number.isFinite(raw) || raw <= 0) return 10
  return Math.min(MAX_RETRY_AFTER_SEC, Math.ceil(raw))
}

/**
 * What a token failure means. Only a rejected refresh token (or client) is a real sign-out; a network error or a
 * transient accounts-server problem (very common right after wake from sleep) must just be retried.
 */
export function authFailureAction(kind: string): 'sign-out' | 'retry' {
  return kind === 'revoked' || kind === 'invalid-client' ? 'sign-out' : 'retry'
}
