import type { PlayInfo } from './protocol'

/**
 * NTP-style clock-offset estimation between this device and the host.
 *
 * One exchange: client sends at c0, host receives at s1 and answers at s2, client receives at c3.
 *   offset = ((s1 - c0) + (s2 - c3)) / 2     host clock minus client clock
 *   rtt    = (c3 - c0) - (s2 - s1)
 * Network jitter is mostly one-sided (queues only add delay), so the sample with the SMALLEST round trip is the most
 * trustworthy. We keep a short window and use the best one, which is what makes the sync tight on Wi-Fi.
 */
export interface OffsetSample {
  offset: number
  rtt: number
  at: number
}

export function sampleFrom(c0: number, s1: number, s2: number, c3: number): OffsetSample | null {
  const rtt = c3 - c0 - (s2 - s1)
  if (!Number.isFinite(rtt) || rtt < 0 || rtt > 10_000) return null // a clock jumped or the answer was ancient
  return { offset: (s1 - c0 + (s2 - c3)) / 2, rtt, at: c3 }
}

export class ClockOffset {
  private samples: OffsetSample[] = []
  constructor(
    private readonly window = 8,
    /** samples older than this are not trusted (clocks drift) */
    private readonly maxAgeMs = 120_000
  ) {}

  add(s: OffsetSample | null): void {
    if (!s) return
    this.samples.push(s)
    if (this.samples.length > this.window) this.samples.shift()
  }

  private fresh(now: number): OffsetSample[] {
    const f = this.samples.filter((s) => now - s.at <= this.maxAgeMs)
    return f.length ? f : this.samples
  }

  /** host minus client, from the lowest-rtt recent sample; 0 until the first exchange */
  offset(now: number = Date.now()): number {
    const f = this.fresh(now)
    if (!f.length) return 0
    let best = f[0]!
    for (const s of f) if (s.rtt < best.rtt) best = s
    return best.offset
  }

  /** rtt of the sample in use; Infinity when unknown */
  rtt(now: number = Date.now()): number {
    const f = this.fresh(now)
    return f.length ? Math.min(...f.map((s) => s.rtt)) : Infinity
  }

  get ready(): boolean {
    return this.samples.length > 0
  }

  /** how far the estimate can be wrong: half the best round trip */
  uncertaintyMs(now: number = Date.now()): number {
    const r = this.rtt(now)
    return Number.isFinite(r) ? r / 2 : Infinity
  }

  /** host time -> this device's clock */
  toLocal(hostTime: number, now: number = Date.now()): number {
    return hostTime - this.offset(now)
  }

  reset(): void {
    this.samples = []
  }
}

/** Where the song is NOW on this device, given the host's anchor and our offset. Frozen while paused. */
export function followPositionMs(play: PlayInfo | null, clock: ClockOffset, durationMs: number, now: number = Date.now()): number {
  if (!play) return 0
  const hostNow = now + clock.offset(now)
  const elapsed = play.playing ? Math.max(0, hostNow - play.at) : 0
  const pos = play.positionMs + elapsed
  return Math.max(0, durationMs > 0 ? Math.min(pos, durationMs) : pos)
}

export interface FollowDecision {
  action: 'none' | 'seek'
  targetMs: number
}

/**
 * Should a local media element (video / audio / the lyric timeline) be re-seeked to stay on the host's clock?
 * Below the tolerance nothing happens, so we never stutter over normal jitter. A cooldown stops seek storms.
 */
export function followDecision(localMs: number, targetMs: number, lastSeekAt: number, now: number = Date.now(), toleranceMs = 350, cooldownMs = 3000): FollowDecision {
  if (Math.abs(localMs - targetMs) <= toleranceMs || now - lastSeekAt < cooldownMs) return { action: 'none', targetMs }
  return { action: 'seek', targetMs }
}

/** Ping cadence: a quick burst after connecting for a good first estimate, then slow to save battery. */
export function pingDelayMs(sentSoFar: number): number {
  if (sentSoFar < 6) return 150
  if (sentSoFar < 12) return 1000
  return 10_000
}

/** Reconnect backoff with jitter: 0.5s, 1s, 2s ... capped at 15s. `rand` in [0,1). */
export function backoffMs(attempt: number, rand: number = Math.random()): number {
  const base = Math.min(15_000, 500 * 2 ** Math.max(0, attempt))
  return Math.round(base * (0.75 + rand * 0.5))
}
