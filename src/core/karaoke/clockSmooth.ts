/**
 * The karaoke video as a steady clock. A YouTube embed reports its time only about four times a second and the
 * reports jitter a little; lyrics driven straight from them would stutter. This interpolates between reports and
 * absorbs small disagreements gradually (a slew) instead of jumping, but follows a real seek immediately.
 * Pure: the caller passes `at` (performance.now()), so it is unit tested with fake times.
 */

export interface SmoothOptions {
  /** a report further than this from our estimate is a seek or a stall: jump (seconds) */
  snapSec: number
  /** share of a small disagreement removed per report (0..1) */
  slew: number
}

export const DEFAULT_SMOOTH: SmoothOptions = { snapSec: 0.5, slew: 0.35 }

export class SmoothClock {
  private t = 0
  private at = 0
  private playing = false
  private rate = 1

  constructor(private readonly opts: SmoothOptions = DEFAULT_SMOOTH) {}

  /** Estimated media time in seconds at `at` (ms, monotonic). */
  now(at: number): number {
    return this.playing ? this.t + ((at - this.at) / 1000) * this.rate : this.t
  }

  /** The player reported `sec` at `at`. */
  report(sec: number, at: number): void {
    const est = this.now(at)
    const d = sec - est
    this.t = Math.abs(d) > this.opts.snapSec || !this.playing ? sec : est + d * this.opts.slew
    this.at = at
  }

  setPlaying(p: boolean, at: number): void {
    this.t = this.now(at)
    this.at = at
    this.playing = p
  }

  setRate(r: number, at: number): void {
    this.t = this.now(at)
    this.at = at
    this.rate = r > 0 ? r : 1
  }

  /** we asked for a seek: the new position is known now, without waiting for the report */
  seek(sec: number, at: number): void {
    this.t = Math.max(0, sec)
    this.at = at
  }

  reset(): void {
    this.t = 0
    this.at = 0
    this.playing = false
    this.rate = 1
  }

  isPlaying(): boolean {
    return this.playing
  }
  getRate(): number {
    return this.rate
  }
}

/** The tempo steps offered, restricted to what the player says it supports (empty when it cannot change speed). */
export function usableRates(available: readonly number[] | undefined, wanted: readonly number[] = [0.75, 0.85, 1]): number[] {
  if (!available || available.length < 2) return []
  const set = new Set(available.map((r) => Math.round(r * 100) / 100))
  const out = wanted.filter((r) => set.has(r))
  return out.includes(1) && out.length > 1 ? out : []
}
