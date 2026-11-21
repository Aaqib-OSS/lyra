import { logger, platform, type Store } from '../platform'

/**
 * A small persistent cache for lookups that cost network (video picks, clip searches).
 *
 *  - memory layer in front of the host Store (the host store writes atomically: temp file + rename, debounced)
 *  - TTL per value (so a miss can expire sooner than a hit: negative caching is just caching a "nothing found" value)
 *  - size cap with least-recently-used eviction
 *  - versioned file: a different version is migrated (`migrate`) or safely dropped, never half-read
 *  - in-flight de-duplication in `getOrFetch`, so two screens asking at once cost one request
 */

const log = logger('cache')

interface Slot<T> {
  /** when it was fetched (TTL counts from here) */
  at: number
  /** when it was last read or written (LRU order) */
  used: number
  value: T
}

interface Doc<T> {
  v: number
  entries: Record<string, Slot<T>>
}

export interface CacheOptions<T> {
  /** file name of the host store, e.g. 'video-cache.json' */
  name: string
  /** bump when the shape of T changes */
  version: number
  maxEntries: number
  /** how long a value stays fresh, in ms (return a short time for misses) */
  ttl(value: T): number
  /** upgrade the entries of an older file; return null to drop them */
  migrate?(oldEntries: Record<string, Slot<unknown>>, fromVersion: number): Record<string, Slot<T>> | null
  now?: () => number
}

export interface CacheStats {
  name: string
  entries: number
  maxEntries: number
}

export class PersistentCache<T> {
  private store: Store<Doc<T>> | null = null
  private mem: Map<string, Slot<T>> | null = null
  private readonly inflight = new Map<string, Promise<T>>()
  private readonly now: () => number

  constructor(private readonly opts: CacheOptions<T>) {
    this.now = opts.now ?? Date.now
    registerCache(this)
  }

  get name(): string {
    return this.opts.name
  }

  /** Load the file once (lazily, so the platform may be installed after import time). */
  private slots(): Map<string, Slot<T>> {
    if (this.mem) return this.mem
    const m = new Map<string, Slot<T>>()
    try {
      this.store = platform().store<Doc<T>>(this.opts.name, { v: this.opts.version, entries: {} })
      const doc = this.store.get() as Partial<Doc<T>> | undefined
      let entries: Record<string, Slot<T>> | null = null
      if (doc && typeof doc.entries === 'object' && doc.entries) {
        if (doc.v === this.opts.version) entries = doc.entries
        else if (this.opts.migrate && typeof doc.v === 'number') entries = this.opts.migrate(doc.entries as Record<string, Slot<unknown>>, doc.v)
      }
      for (const [k, s] of Object.entries(entries ?? {})) {
        if (s && typeof s.at === 'number') m.set(k, { at: s.at, used: typeof s.used === 'number' ? s.used : s.at, value: s.value })
      }
      if (doc?.v !== this.opts.version) this.persist(m) // write the migrated (or emptied) file under the new version
    } catch (e) {
      log.warn(`${this.opts.name}: unreadable, starting empty`, (e as Error).message)
    }
    return (this.mem = m)
  }

  private persist(m: Map<string, Slot<T>>): void {
    try {
      this.store ??= platform().store<Doc<T>>(this.opts.name, { v: this.opts.version, entries: {} })
      this.store.set({ v: this.opts.version, entries: Object.fromEntries(m) })
    } catch (e) {
      log.warn(`${this.opts.name}: write failed`, (e as Error).message)
    }
  }

  /** A fresh value, or undefined. `accept` can reject a value that does not fit this request (e.g. wrong duration). */
  get(key: string, accept?: (v: T) => boolean): T | undefined {
    const m = this.slots()
    const s = m.get(key)
    if (!s) return undefined
    if (this.now() - s.at > this.opts.ttl(s.value)) return undefined
    if (accept && !accept(s.value)) return undefined
    s.used = this.now() // LRU touch is memory-only; it reaches the disk with the next write
    return s.value
  }

  /** The value even if it has expired (for "better an old answer than an error" when offline). */
  getStale(key: string, accept?: (v: T) => boolean): T | undefined {
    const s = this.slots().get(key)
    if (!s || (accept && !accept(s.value))) return undefined
    return s.value
  }

  set(key: string, value: T): void {
    const m = this.slots()
    const t = this.now()
    m.set(key, { at: t, used: t, value })
    if (m.size > this.opts.maxEntries) {
      // drop the least recently used down to 90% so we do not evict on every single write
      const keep = Math.floor(this.opts.maxEntries * 0.9)
      const doomed = [...m.entries()].sort((a, b) => a[1].used - b[1].used).slice(0, m.size - keep)
      for (const [k] of doomed) m.delete(k)
    }
    this.persist(m)
  }

  delete(key: string): void {
    if (this.slots().delete(key)) this.persist(this.mem!)
  }

  clear(): void {
    this.slots().clear()
    this.inflight.clear()
    this.persist(this.mem!)
  }

  /**
   * Cached value, or run `fetcher` once (concurrent callers share the promise). The fetcher returns the value to
   * store, or `{ value, cache: false }` for a result that must not be remembered (errors, partial answers).
   */
  getOrFetch(key: string, fetcher: () => Promise<T | { value: T; cache: false }>, accept?: (v: T) => boolean): Promise<T> {
    const hit = this.get(key, accept)
    if (hit !== undefined) return Promise.resolve(hit)
    const running = this.inflight.get(key)
    if (running) return running
    const p = (async () => {
      const r = await fetcher()
      if (r && typeof r === 'object' && 'cache' in r && (r as { cache: unknown }).cache === false) return (r as { value: T }).value
      this.set(key, r as T)
      return r as T
    })().finally(() => {
      if (this.inflight.get(key) === p) this.inflight.delete(key)
    })
    this.inflight.set(key, p)
    return p
  }

  stats(): CacheStats {
    return { name: this.opts.name, entries: this.slots().size, maxEntries: this.opts.maxEntries }
  }
}

// ---------- registry: one place to clear or inspect every cache (Settings → "Clear cache") ----------

const caches = new Set<PersistentCache<any>>()
const clearers = new Map<string, () => void>()

function registerCache(c: PersistentCache<any>): void {
  caches.add(c)
}

/** For caches that are not a PersistentCache (the lyrics blob cache). */
export function registerCacheClearer(id: string, fn: () => void): void {
  clearers.set(id, fn)
}

/** Forget everything cached (video picks, clip searches, lyrics). Pinned choices and imported lyrics are NOT touched. */
export function clearAllCaches(): { cleared: number } {
  let cleared = 0
  for (const c of caches) {
    try {
      cleared += c.stats().entries
      c.clear()
    } catch (e) {
      log.warn('clear failed', (e as Error).message)
    }
  }
  for (const [id, fn] of clearers) {
    try {
      fn()
    } catch (e) {
      log.warn(`clear ${id} failed`, (e as Error).message)
    }
  }
  return { cleared }
}

export function cacheStats(): CacheStats[] {
  return [...caches].map((c) => c.stats())
}

/** Test helper: forget registered caches (a fresh test platform means fresh caches). */
export function resetCacheRegistry(): void {
  caches.clear()
  clearers.clear()
}
