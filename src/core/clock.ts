/**
 * The one song clock, and the drift correction that keeps a video on it.
 *
 * The music source (Spotify, Windows media session, Lyra's own player ...) reports "the song was at X ms when I looked
 * at time T". Everything else (lyrics, the progress bar, the background video) is told the position by interpolating
 * from that anchor, never by counting its own time. Media that loads late therefore just asks the clock where the song
 * is NOW and joins there.
 *
 * Pure functions + one small state machine, so they are unit tested without a player or a DOM.
 */

export interface ClockAnchor {
  /** song position at `sampledAt` */
  positionMs: number
  /** Date.now() when the position was read (already corrected for request latency by the source) */
  sampledAt: number
  isPlaying: boolean
  /** an ad / unknown item is playing: the song clock is not running even if the player says "playing" */
  isAdOrUnknown?: boolean
  durationMs?: number | null
}

/** Estimated true song position in ms. Never negative, never past the end; frozen while paused or during an ad. */
export function estimatePositionMs(a: ClockAnchor | null | undefined, now: number = Date.now()): number {
  if (!a) return 0
  const running = a.isPlaying && !a.isAdOrUnknown
  // a sampledAt slightly in the future (clock skew) must not run the clock backwards
  const elapsed = running ? Math.max(0, now - a.sampledAt) : 0
  const dur = a.durationMs && a.durationMs > 0 ? a.durationMs : Infinity
  return Math.max(0, Math.min(a.positionMs + elapsed, dur))
}

/** a video whose length differs from the song by more than this is not the same timeline: it just loops */
export const SYNC_LENGTH_TOLERANCE_SEC = 10

/** Can this video be locked to the song position (same length, give or take an intro/outro)? */
export function isTimelineSyncable(videoDurationSec: number | null | undefined, songDurationMs: number | null | undefined): boolean {
  if (!videoDurationSec || !songDurationMs || videoDurationSec <= 0 || songDurationMs <= 0) return false
  return Math.abs(videoDurationSec - songDurationMs / 1000) <= SYNC_LENGTH_TOLERANCE_SEC
}

/** Where in the video the given song position is (clamped just inside the clip). */
export function videoTargetSec(songPositionMs: number, videoDurationSec: number): number {
  const max = Math.max(0, videoDurationSec - 0.5)
  return Math.max(0, Math.min(songPositionMs / 1000, max))
}

export interface DriftConfig {
  /** drift (seconds) below which nothing is done */
  deadZoneSec: number
  /** once nudging, go back to normal speed below this */
  releaseSec: number
  /** with a working playbackRate nudge, only seek above this */
  seekWithRateSec: number
  /** without a rate nudge, seek above this */
  seekNoRateSec: number
  /** after a seek, ignore samples for this long (they still describe the old position) */
  seekCooldownMs: number
  /** the first sample after joining / resuming seeks if off by more than this */
  joinSec: number
  /** how far the speed is changed to catch up (YouTube only offers 0.25 steps; a <video> can use 0.05) */
  rateDelta: number
  /** seeks land a touch ahead, to make up for the time the seek itself takes */
  seekLeadSec: number
}

export const YT_DRIFT: DriftConfig = {
  deadZoneSec: 0.3,
  releaseSec: 0.12,
  seekWithRateSec: 2,
  seekNoRateSec: 1,
  seekCooldownMs: 3000,
  joinSec: 0.5,
  rateDelta: 0.25,
  seekLeadSec: 0.2
}

export const VIDEO_EL_DRIFT: DriftConfig = { ...YT_DRIFT, deadZoneSec: 0.15, releaseSec: 0.05, seekWithRateSec: 1.5, seekNoRateSec: 0.75, rateDelta: 0.05, seekLeadSec: 0.05 }

export interface DriftSample {
  nowMs: number
  /** the video's own current time */
  videoSec: number
  /** where the video should be, from the song clock */
  targetSec: number
  playing: boolean
  buffering: boolean
  /** the playback rate the video reports right now */
  rate: number
}

export interface DriftAction {
  seekToSec?: number
  rate?: number
}

const NONE: DriftAction = {}

/**
 * Keeps a video on the song clock. Feed it a sample whenever the video reports its time; it answers with the one
 * thing to do (or nothing). Rules:
 *  - nothing while paused or buffering (the numbers are meaningless); when playing resumes it re-joins
 *  - the first sample after joining seeks if the video is not already about right
 *  - big drift: a single seek, then a cooldown (no seek spam, even if the embed is slow to confirm)
 *  - small drift: nudge the playback speed, and put it back when the video has caught up
 *  - if the embed ignores rate changes, stop trying and fall back to seeking at a lower threshold
 */
export class DriftController {
  private joined = false
  private lastSeekAt = -Infinity
  private nudge = 1
  private pendingRate: number | null = null
  private rateChecks = 0
  rateSupported = true

  constructor(private readonly cfg: DriftConfig = YT_DRIFT) {}

  /** call when the song / video changes, or the video is paused: the next playing sample re-joins */
  reset(): void {
    this.joined = false
    this.lastSeekAt = -Infinity
    this.nudge = 1
    this.pendingRate = null
    this.rateChecks = 0
  }

  update(s: DriftSample): DriftAction {
    const c = this.cfg
    if (!s.playing || s.buffering) {
      this.joined = false // after a stall the position is unreliable: join again
      return NONE
    }
    const drift = s.videoSec - s.targetSec // + : video is ahead
    const abs = Math.abs(drift)

    // did the embed take our speed change?
    if (this.pendingRate !== null) {
      if (Math.abs(s.rate - this.pendingRate) < 0.01) this.pendingRate = null
      else if (++this.rateChecks >= 3) {
        this.rateSupported = false
        this.pendingRate = null
        this.nudge = 1
      }
    }

    if (!this.joined) {
      this.joined = true
      if (abs > c.joinSec) return this.seek(s, s.targetSec)
      return NONE
    }
    if (s.nowMs - this.lastSeekAt < c.seekCooldownMs) return NONE

    const seekAt = this.rateSupported ? c.seekWithRateSec : c.seekNoRateSec
    if (abs > seekAt) return this.seek(s, s.targetSec)
    if (!this.rateSupported) return NONE

    if (this.nudge !== 1) {
      const wanted = drift > 0 ? 1 - c.rateDelta : 1 + c.rateDelta
      if (abs < c.releaseSec) return this.setRate(1)
      if (wanted !== this.nudge) return this.setRate(wanted) // drift changed sign
      return NONE
    }
    if (abs > c.deadZoneSec) return this.setRate(drift > 0 ? 1 - c.rateDelta : 1 + c.rateDelta)
    return NONE
  }

  private seek(s: DriftSample, to: number): DriftAction {
    this.lastSeekAt = s.nowMs
    const out: DriftAction = { seekToSec: Math.max(0, to + this.cfg.seekLeadSec) }
    if (this.nudge !== 1) out.rate = this.setRate(1).rate
    return out
  }

  private setRate(r: number): DriftAction {
    this.nudge = r
    this.pendingRate = r
    this.rateChecks = 0
    return { rate: r }
  }
}
