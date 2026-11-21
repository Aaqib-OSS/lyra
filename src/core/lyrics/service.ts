import { parseImported, parseLrc, stripLrc } from '@shared/lrc'
import type { LyricsResult, SourceHealth, Track } from '@shared/types'
import { logger, platform, type BlobCache, type Store } from '../platform'
import { CircuitBreaker, backoffDelay, isTemporary, sleep } from '../resilience'
import { trackKey } from '../songKey'
import { rememberTrack } from '../trackIndex'
import { demoLyrics } from '../demo/lyrics'
import { LrcLibProvider } from './lrclib'
import { PublicDomainLyricsProvider } from './public-domain'
import { LyricsProviderError, type LyricsCandidate, type LyricsProvider, type LyricsQuery } from './provider'

const log = logger('lyrics')

const FOUND_TTL = 30 * 24 * 3600_000
const NONE_TTL = 12 * 3600_000
/** an old copy is still better than nothing when the services cannot be reached (offline, outage) */
const STALE_MAX = 365 * 24 * 3600_000
/** a failure is shared for a moment so several screens asking at once do not each hit the services again */
const ERROR_HOLD_MS = 15_000
const MAX_DISK_ENTRIES = 600
const MAX_IMPORTS = 300
const MAX_IMPORT_CHARS = 200_000

interface CacheEntry {
  at: number
  result: LyricsResult
}

interface Pin {
  provider: string
  id: string
}

interface Imported {
  text: string
  at: number
  name: string
}

const NO_KEY = '|'

export class LyricsService {
  private pinStore: Store<{ pins: Record<string, Pin> }> | null = null
  private importStore: Store<{ items: Record<string, Imported> }> | null = null
  private readonly memory = new Map<string, CacheEntry>()
  private readonly inflight = new Map<string, Promise<LyricsResult>>()
  private readonly held = new Map<string, { at: number; result: LyricsResult }>()
  private readonly breakers = new Map<string, CircuitBreaker>()
  private blob: BlobCache | null = null
  private lastCall = 0

  constructor(
    private readonly providers: LyricsProvider[] = [new LrcLibProvider(), new PublicDomainLyricsProvider()],
    private readonly now: () => number = Date.now,
    private readonly wait: (ms: number) => Promise<void> = (ms) => sleep(ms)
  ) {}

  private breaker(id: string): CircuitBreaker {
    let b = this.breakers.get(id)
    if (!b) this.breakers.set(id, (b = new CircuitBreaker(3, 30_000, this.now)))
    return b
  }

  /** What Settings shows: is each lyrics service working, slow or down (and when we will try it again). */
  health(): SourceHealth[] {
    return this.providers.map((p) => {
      const b = this.breaker(p.id)
      return { id: p.id, name: p.name, state: b.state === 'open' ? 'down' : b.state === 'half-open' ? 'slow' : 'ok', lastError: b.lastError, retryInSec: b.retryInSec, lastOkAt: b.lastOk }
    })
  }

  // ---------- identity: the song, not the player's track id ----------

  private key(track: Track): string {
    rememberTrack(track)
    const k = trackKey(track)
    return k === NO_KEY ? track.id : k
  }

  // ---------- cache ----------

  private disk(): BlobCache {
    return (this.blob ??= platform().blobCache('lyrics-cache', MAX_DISK_ENTRIES))
  }

  private readCache(track: Track, stale = false): LyricsResult | null {
    const now = this.now()
    for (const id of [`k:${this.key(track)}`, track.id]) {
      const entry = this.memory.get(id) ?? this.readDisk(id)
      if (!entry) continue
      const ttl = stale ? STALE_MAX : entry.result.status === 'none' ? NONE_TTL : FOUND_TTL
      if (now - entry.at > ttl) continue
      this.memory.set(id, entry)
      return { ...entry.result, trackId: track.id }
    }
    return null
  }

  private readDisk(id: string): CacheEntry | null {
    try {
      const raw = this.disk().read(id)
      return raw ? (JSON.parse(raw) as CacheEntry) : null
    } catch {
      return null
    }
  }

  private writeCache(track: Track, result: LyricsResult): void {
    if (result.status === 'error') return // never cache failures
    const id = `k:${this.key(track)}`
    const entry = { at: this.now(), result }
    this.memory.set(id, entry)
    try {
      this.disk().write(id, JSON.stringify(entry))
    } catch (e) {
      log.warn('cache write failed', e)
    }
  }

  // ---------- lyrics the user brought ----------

  private imports(): Store<{ items: Record<string, Imported> }> {
    return (this.importStore ??= platform().store<{ items: Record<string, Imported> }>('user-lyrics.json', { items: {} }))
  }

  /** Save lyrics the user pasted or dropped (LRC, SRT or plain text) for this song. They always win over any service. */
  importText(track: Track, text: string, name = 'pasted'): LyricsResult | { error: string } {
    const parsed = parseImported(text)
    if (parsed.kind === 'empty') return { error: 'That doesn’t look like lyrics. Paste the words, or an .lrc / .srt file.' }
    if (text.length > MAX_IMPORT_CHARS) return { error: 'That is too long to be lyrics (limit 200,000 characters).' }
    const items = { ...this.imports().get().items, [this.key(track)]: { text, at: this.now(), name: name.slice(0, 80) } }
    const keys = Object.keys(items)
    if (keys.length > MAX_IMPORTS) for (const k of keys.sort((a, b) => items[a]!.at - items[b]!.at).slice(0, keys.length - MAX_IMPORTS)) delete items[k]
    this.imports().set({ items })
    this.held.delete(track.id)
    return this.fromImported(track, items[this.key(track)]!)!
  }

  clearImport(track: Track): void {
    const items = { ...this.imports().get().items }
    delete items[this.key(track)]
    this.imports().set({ items })
  }

  private fromImported(track: Track, it: Imported | undefined): LyricsResult | null {
    if (!it) return null
    const p = parseImported(it.text)
    if (p.kind === 'synced') return { trackId: track.id, status: 'synced', provider: 'you', lines: p.lines, imported: true, pinned: true, wordSynced: p.lines.some((l) => l.words && l.words.length > 1) }
    if (p.kind === 'plain') return { trackId: track.id, status: 'plain', provider: 'you', lines: [], plain: p.plain, imported: true, pinned: true }
    return null
  }

  // ---------- the main entry ----------

  async get(track: Track, force = false): Promise<LyricsResult> {
    if (track.id.startsWith('demo:')) return demoLyrics(track.id)
    // Podcasts / local files have no catalog lyrics.
    if (track.uri.startsWith('spotify:episode:') || track.uri.startsWith('spotify:local:'))
      return { trackId: track.id, status: 'none', provider: 'none', lines: [] }

    // 1) lyrics the user brought win over everything
    const mine = this.fromImported(track, this.imports().get().items[this.key(track)])
    if (mine) return mine

    // 2) a match the user picked manually (remembered for the song, whatever player it came from)
    const pins = this.pins().pins
    const pin = pins[this.key(track)] ?? pins[track.id]
    if (pin) {
      const cached = this.readCache(track)
      if (cached && !force) return cached
      const pinned = await this.fetchPinned(track, pin)
      if (pinned) return pinned
    }

    if (!force) {
      const cached = this.readCache(track)
      if (cached) return cached
      const hold = this.held.get(track.id)
      if (hold && this.now() - hold.at < ERROR_HOLD_MS) return hold.result
    }
    const pending = this.inflight.get(track.id)
    if (pending) return pending
    const p = this.lookup(track).finally(() => this.inflight.delete(track.id))
    this.inflight.set(track.id, p)
    return p
  }

  private pins(): { pins: Record<string, Pin> } {
    return (this.pinStore ??= platform().store<{ pins: Record<string, Pin> }>('lyrics-pins.json', { pins: {} })).get()
  }

  private async fetchPinned(track: Track, pin: Pin): Promise<LyricsResult | null> {
    const provider = this.providers.find((p) => p.id === pin.provider)
    const b = this.breaker(pin.provider)
    if (!provider?.byId || !b.canTry()) return null
    try {
      const r = await provider.byId(pin.id, AbortSignal.timeout(15_000))
      b.success()
      if (r.kind !== 'found') return null
      const result = { ...this.build(track.id, provider.id, r), pinned: true }
      this.writeCache(track, result)
      return result
    } catch (e) {
      b.failure((e as Error).message)
      log.warn('pinned lookup failed', (e as Error).message)
      return null
    }
  }

  private queryFor(track: Track): LyricsQuery {
    return { trackId: track.id, title: track.title, artist: track.artists[0] ?? '', album: track.album, durationMs: track.durationMs }
  }

  /** Ranked alternatives so the user can fix a wrong match. */
  async candidates(track: Track): Promise<{ items: Array<LyricsCandidate & { provider: string }>; error?: string }> {
    const items: Array<LyricsCandidate & { provider: string }> = []
    let error: string | undefined
    for (const p of this.providers) {
      if (!p.candidates) continue
      const b = this.breaker(p.id)
      if (!b.canTry()) {
        error = `${p.name} is resting for ${b.retryInSec || 1}s after errors.`
        continue
      }
      try {
        for (const c of await p.candidates(this.queryFor(track), AbortSignal.timeout(30_000))) items.push({ ...c, provider: p.id })
        b.success()
      } catch (e) {
        b.failure((e as Error).message)
        error = (e as Error).message
        log.warn(`${p.id} candidates failed`, error)
      }
    }
    return { items, error: items.length === 0 ? error : undefined }
  }

  /** Pin a specific provider entry to this song (remembered across restarts and across players). */
  async choose(track: Track, provider: string, id: string): Promise<LyricsResult> {
    const store = (this.pinStore ??= platform().store<{ pins: Record<string, Pin> }>('lyrics-pins.json', { pins: {} }))
    store.set({ pins: { ...store.get().pins, [this.key(track)]: { provider, id }, [track.id]: { provider, id } } })
    this.clearImport(track) // choosing a service match replaces anything you pasted before
    const result = await this.fetchPinned(track, { provider, id })
    return result ?? { trackId: track.id, status: 'none', provider, lines: [] }
  }

  /** Forget a manual pick (or pasted lyrics) and go back to automatic matching. */
  async clearPin(track: Track): Promise<LyricsResult> {
    const store = (this.pinStore ??= platform().store<{ pins: Record<string, Pin> }>('lyrics-pins.json', { pins: {} }))
    const pins = { ...store.get().pins }
    delete pins[this.key(track)]
    delete pins[track.id]
    store.set({ pins })
    this.clearImport(track)
    return this.get(track, true)
  }

  // ---------- the lookup chain ----------

  /**
   * Ask one service, dependably: a rate limit is waited out (short ones) or puts the service on hold (long ones);
   * a network blip or 5xx is retried with backoff; everything is reported to the service's circuit breaker.
   */
  private async askProvider(provider: LyricsProvider, q: LyricsQuery) {
    const b = this.breaker(provider.id)
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await provider.fetch(q, AbortSignal.timeout(20_000))
        b.success()
        return r
      } catch (e) {
        const pe = e instanceof LyricsProviderError ? e : null
        if (pe?.kind === 'rate-limit') {
          const wait = pe.retryAfterSec ?? 30
          if (attempt >= 2 || wait > 45) {
            b.trip(wait, pe.message)
            throw e
          }
          log.info(`${provider.id} rate limited; waiting ${wait}s (attempt ${attempt + 1})`)
          await this.wait((wait + 1) * 1000)
          continue
        }
        if (isTemporary(e) && attempt < 1 && pe?.retryable !== false) {
          const delay = backoffDelay(attempt, 700, 3000)
          log.info(`${provider.id} failed (${(e as Error).message}); retrying in ${delay} ms`)
          await this.wait(delay)
          continue
        }
        b.failure((e as Error).message)
        throw e
      }
    }
  }

  private async lookup(track: Track): Promise<LyricsResult> {
    // Be a polite client: space out requests when skipping through tracks quickly.
    const gap = this.lastCall + 400 - this.now()
    if (gap > 0) await this.wait(gap)
    this.lastCall = this.now()

    const q = this.queryFor(track)
    let firstError: LyricsProviderError | null = null
    let skipped = 0
    let failed = 0

    for (const provider of this.providers) {
      if (!this.breaker(provider.id).canTry()) {
        skipped++
        continue // resting after errors: the next service in the chain gets a turn
      }
      try {
        const r = await this.askProvider(provider, q)
        if (r.kind !== 'found') continue
        const result = this.build(track.id, provider.id, r)
        this.writeCache(track, result)
        this.held.delete(track.id)
        return result
      } catch (e) {
        failed++
        firstError ??= e instanceof LyricsProviderError ? e : new LyricsProviderError((e as Error).message, 'unknown')
        log.warn(`${provider.id} failed`, (e as Error).message)
      }
    }

    // Not found anywhere, but only a COMPLETE answer may say "no lyrics" (and be remembered): if a service was down or
    // resting we do not know, so we serve an older copy if we have one, or report a temporary problem.
    if (failed === 0 && skipped === 0) {
      const none: LyricsResult = { trackId: track.id, status: 'none', provider: this.providers[0]?.id ?? 'none', lines: [] }
      this.writeCache(track, none)
      this.held.delete(track.id)
      return none
    }
    const stale = this.readCache(track, true)
    if (stale && stale.status !== 'none') return { ...stale, stale: true }
    const rest = Math.max(0, ...this.providers.map((p) => this.breaker(p.id).retryInSec))
    const err = firstError ?? new LyricsProviderError('The lyrics services are resting after errors. Lyra will try again shortly.', 'network')
    const result: LyricsResult = {
      trackId: track.id,
      status: 'error',
      provider: this.providers[0]?.id ?? 'none',
      lines: [],
      error: { kind: err.kind, message: err.message, retryable: err.retryable, retryInSec: rest || undefined }
    }
    this.held.set(track.id, { at: this.now(), result })
    return result
  }

  private build(trackId: string, provider: string, r: Extract<Awaited<ReturnType<LyricsProvider['fetch']>>, { kind: 'found' }>): LyricsResult {
    if (r.instrumental) return { trackId, status: 'instrumental', provider, lines: [], matched: r.matched }
    const lines = r.synced ? parseLrc(r.synced) : []
    if (lines.length > 0) {
      return { trackId, status: 'synced', provider, lines, matched: r.matched, wordSynced: lines.some((l) => l.words && l.words.length > 1) }
    }
    const plain = r.plain ?? (r.synced ? stripLrc(r.synced) : '')
    if (plain.trim()) return { trackId, status: 'plain', provider, lines: [], plain: plain.trim(), matched: r.matched }
    return { trackId, status: 'none', provider, lines: [] }
  }
}

export const lyricsService = new LyricsService()
