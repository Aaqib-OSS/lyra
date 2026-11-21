import { beforeEach, describe, expect, it } from 'vitest'
import { setPlatform, type CorePlatform } from '../platform'
import { PersistentCache, cacheStats, clearAllCaches, registerCacheClearer, resetCacheRegistry } from './persistentCache'
import { sameLength, trackCacheKey } from './trackCacheKey'

const stores = new Map<string, object>()
const noop = () => undefined

function install(): void {
  setPlatform({
    fetch: () => Promise.reject(new Error('no network')),
    store: <T extends object>(name: string, defaults: T) => ({
      get: () => (stores.get(name) as T) ?? (stores.set(name, structuredClone(defaults)), stores.get(name) as T),
      set: (v: T) => void stores.set(name, structuredClone(v)) // a real store serialises: no shared references
    }),
    blobCache: () => ({ read: () => null, write: noop }),
    secret: () => ({ available: () => false, load: () => null, save: noop, clear: noop }),
    log: () => ({ debug: noop, info: noop, warn: noop, error: noop }),
    appVersion: 'test'
  } satisfies CorePlatform)
}

let t = 1_000_000
const now = () => t
const make = (over: Partial<ConstructorParameters<typeof PersistentCache<string | null>>[0]> = {}) =>
  new PersistentCache<string | null>({ name: 'c.json', version: 1, maxEntries: 10, ttl: (v) => (v === null ? 1000 : 10_000), now, ...over })

beforeEach(() => {
  stores.clear()
  resetCacheRegistry()
  install()
  t = 1_000_000
})

describe('PersistentCache', () => {
  it('returns what was set, and survives a "restart" (new instance, same file)', () => {
    make().set('a', 'x')
    expect(make().get('a')).toBe('x')
  })

  it('expires by per-value TTL: a miss (null) goes stale sooner than a hit', () => {
    const c = make()
    c.set('hit', 'x')
    c.set('miss', null)
    t += 2000
    expect(c.get('miss')).toBeUndefined()
    expect(c.get('hit')).toBe('x')
    expect(c.getStale('miss')).toBeNull() // negative entries are real entries; stale readers may still use them
    t += 9000
    expect(c.get('hit')).toBeUndefined()
    expect(c.getStale('hit')).toBe('x')
  })

  it('caches negative results: null is a hit, not a miss', async () => {
    const c = make()
    let calls = 0
    const f = async () => (calls++, null)
    expect(await c.getOrFetch('k', f)).toBeNull()
    expect(await c.getOrFetch('k', f)).toBeNull()
    expect(calls).toBe(1)
  })

  it('accept() rejects a value that does not fit the request', () => {
    const c = make()
    c.set('a', 'x')
    expect(c.get('a', () => false)).toBeUndefined()
    expect(c.get('a', () => true)).toBe('x')
  })

  it('evicts least recently used beyond the cap', () => {
    const c = make({ maxEntries: 5 })
    for (const k of ['a', 'b', 'c', 'd', 'e']) {
      c.set(k, k)
      t += 10
    }
    t += 10
    c.get('a') // a becomes the most recently used
    t += 10
    c.set('f', 'f') // over the cap: drop down to 90% (4 entries)
    expect(c.stats().entries).toBe(4)
    expect(c.get('a')).toBe('a')
    expect(c.get('f')).toBe('f')
    expect(c.get('b')).toBeUndefined()
  })

  it('de-duplicates concurrent fetches', async () => {
    const c = make()
    let calls = 0
    const f = async () => {
      calls++
      await Promise.resolve()
      return 'v'
    }
    const [x, y, z] = await Promise.all([c.getOrFetch('k', f), c.getOrFetch('k', f), c.getOrFetch('k', f)])
    expect([x, y, z]).toEqual(['v', 'v', 'v'])
    expect(calls).toBe(1)
    expect(await c.getOrFetch('k', f)).toBe('v')
    expect(calls).toBe(1)
  })

  it('does not store a result flagged cache:false, and a failed fetch can be retried', async () => {
    const c = make()
    let calls = 0
    expect(await c.getOrFetch('k', async () => (calls++, { value: 'tmp', cache: false as const }))).toBe('tmp')
    expect(c.get('k')).toBeUndefined()
    await expect(c.getOrFetch('k', async () => { throw new Error('boom') })).rejects.toThrow('boom')
    expect(await c.getOrFetch('k', async () => 'ok')).toBe('ok')
  })

  it('drops a file of another version when there is no migration', () => {
    stores.set('c.json', { v: 0, entries: { a: { at: t, used: t, value: 'old' } } })
    const c = make()
    expect(c.get('a')).toBeUndefined()
    expect(stores.get('c.json')).toMatchObject({ v: 1, entries: {} })
  })

  it('migrates an older file when a migration is given', () => {
    stores.set('c.json', { v: 0, entries: { a: { at: t, used: t, value: 'old' } } })
    const c = make({ migrate: (old) => Object.fromEntries(Object.entries(old).map(([k, s]) => [k, { ...s, value: `${s.value}+` }])) as never })
    expect(c.get('a')).toBe('old+')
    expect(stores.get('c.json')).toMatchObject({ v: 1 })
  })

  it('survives a corrupt file', () => {
    stores.set('c.json', { nonsense: true })
    const c = make()
    expect(c.get('a')).toBeUndefined()
    c.set('a', 'x')
    expect(c.get('a')).toBe('x')
  })

  it('clear() empties memory and disk', () => {
    const c = make()
    c.set('a', 'x')
    c.clear()
    expect(c.get('a')).toBeUndefined()
    expect(make().get('a')).toBeUndefined()
  })
})

describe('registry', () => {
  it('clearAllCaches clears every cache and extra clearers, and cacheStats reports them', () => {
    const a = make({ name: 'a.json' })
    const b = make({ name: 'b.json' })
    a.set('k', '1')
    b.set('k', '2')
    b.set('j', '3')
    let cleared = false
    registerCacheClearer('lyrics', () => (cleared = true))
    expect(cacheStats().map((s) => s.entries).sort()).toEqual([1, 2])
    expect(clearAllCaches()).toEqual({ cleared: 3 })
    expect(a.get('k')).toBeUndefined()
    expect(b.get('j')).toBeUndefined()
    expect(cleared).toBe(true)
  })
})

describe('trackCacheKey', () => {
  it('is the same for the same song from different players / releases', () => {
    const a = trackCacheKey({ id: 'spotify:1', artists: ['Daft Punk'], title: 'Get Lucky (feat. Pharrell Williams)' })
    const b = trackCacheKey({ id: 'smtc:9', artists: ['Daft Punk'], title: 'Get Lucky' })
    expect(a).toBe(b)
  })

  it('falls back to the player id when nothing is left to identify the song', () => {
    expect(trackCacheKey({ id: 'x1', artists: [], title: '' })).toBe('id:x1')
  })

  it('sameLength tolerates small drift but rejects another version', () => {
    expect(sameLength(200_000, 203_000)).toBe(true)
    expect(sameLength(200_000, 420_000)).toBe(false)
    expect(sameLength(0, 420_000)).toBe(true)
  })
})
