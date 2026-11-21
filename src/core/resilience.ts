/**
 * Small, dependency-free tools that make network-backed features dependable. Pure (no Electron, no fetch), so they
 * are unit-tested and shared by lyrics, videos and anything that talks to a service that may be slow or down.
 */

/** Exponential backoff with jitter: 0 -> base, 1 -> 2*base, ... capped at max. `rand` is injectable for tests. */
export function backoffDelay(attempt: number, base = 800, max = 30_000, jitter = 0.25, rand: () => number = Math.random): number {
  const raw = Math.min(max, base * 2 ** Math.max(0, attempt))
  return Math.round(raw * (1 - jitter + rand() * jitter * 2))
}

export const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('aborted'))
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(signal.reason ?? new Error('aborted'))), { once: true })
  })

export interface RetryOptions {
  /** extra attempts after the first (default 2) */
  retries?: number
  baseMs?: number
  maxMs?: number
  /** return false to give up straight away (default: retry everything) */
  shouldRetry?(error: unknown, attempt: number): boolean
  /** a delay the error itself asks for (for example a Retry-After), in ms */
  delayFor?(error: unknown): number | undefined
  onRetry?(error: unknown, attempt: number, delayMs: number): void
  signal?: AbortSignal
  /** injectable for tests */
  wait?(ms: number, signal?: AbortSignal): Promise<void>
}

/** Run `fn`, retrying temporary failures with backoff. Throws the last error when every attempt failed. */
export async function retry<T>(fn: (attempt: number) => Promise<T>, o: RetryOptions = {}): Promise<T> {
  const retries = o.retries ?? 2
  const wait = o.wait ?? sleep
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt)
    } catch (e) {
      if (o.signal?.aborted || attempt >= retries || (o.shouldRetry && !o.shouldRetry(e, attempt))) throw e
      const delay = o.delayFor?.(e) ?? backoffDelay(attempt, o.baseMs, o.maxMs)
      o.onRetry?.(e, attempt + 1, delay)
      await wait(delay, o.signal)
    }
  }
}

export type CircuitState = 'closed' | 'open' | 'half-open'

/**
 * A circuit breaker for one service. After `threshold` failures in a row it opens: calls are skipped (and the next
 * service in the chain is used) for `cooldownMs`; then ONE trial call is let through (half-open). A success closes
 * it again. This stops us hammering a service that is down and keeps the app quick while it is.
 */
export class CircuitBreaker {
  private failures = 0
  private openedAt = 0
  private trial = false
  lastError = ''
  lastOk = 0

  constructor(
    private readonly threshold = 3,
    private readonly cooldownMs = 30_000,
    private readonly now: () => number = Date.now
  ) {}

  get state(): CircuitState {
    if (this.failures < this.threshold) return 'closed'
    return this.now() - this.openedAt >= this.cooldownMs ? 'half-open' : 'open'
  }

  /** Seconds until a trial call is allowed again (0 when calls are allowed). */
  get retryInSec(): number {
    return this.state === 'open' ? Math.ceil((this.openedAt + this.cooldownMs - this.now()) / 1000) : 0
  }

  /** May a call go out now? In half-open state only one trial at a time. */
  canTry(): boolean {
    const s = this.state
    if (s === 'closed') return true
    if (s === 'open') return false
    if (this.trial) return false
    this.trial = true
    return true
  }

  success(): void {
    this.failures = 0
    this.trial = false
    this.lastOk = this.now()
    this.lastError = ''
  }

  failure(message = ''): void {
    this.failures++
    this.trial = false
    this.lastError = message
    // every failure at or past the threshold (re)starts the cool-down, including a failed trial call
    if (this.failures >= this.threshold) this.openedAt = this.now()
  }

  /** a deliberate wait (for example a rate limit asking for 40 s) opens the circuit for exactly that long */
  trip(forSec: number, message = ''): void {
    this.failures = Math.max(this.failures, this.threshold)
    this.openedAt = this.now() - Math.max(0, this.cooldownMs - forSec * 1000)
    this.trial = false
    this.lastError = message
  }
}

/** Is this error one of those that a second try can fix (network drop, timeout, 5xx)? */
export function isTemporary(e: unknown): boolean {
  const kind = (e as { kind?: string }).kind
  if (kind === 'network' || kind === 'server' || kind === 'rate-limit') return true
  if (kind === 'unknown' && (e as { retryable?: boolean }).retryable === false) return false
  const name = (e as { name?: string }).name
  return name === 'TimeoutError' || name === 'TypeError' || kind === undefined
}
