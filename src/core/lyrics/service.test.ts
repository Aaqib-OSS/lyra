import { beforeEach, describe, expect, it } from 'vitest'
import type { Track } from '@shared/types'
import { setPlatform, type CorePlatform } from '../platform'
import { LyricsService } from './service'
import { LyricsProviderError, type LyricsProvider, type ProviderResult } from './provider'

function memoryPlatform(): CorePlatform {
  const blobs = new Map<string, string>()
  const stores = new Map<string, object>()
  const noop = () => undefined
  return {
    fetch: () => Promise.reject(new Error('no network in tests')),
    store: <T extends object>(name: string, defaults: T) => ({
      get: () => (stores.get(name) as T) ?? (stores.set(name, structuredClone(defaults)), stores.get(name) as T),
      set: (v: T) => void stores.set(name, v)
    }),
    blobCache: () => ({ read: (k) => blobs.get(k) ?? null, write: (k, v) => void blobs.set(k, v) }),
    secret: () => ({ available: () => false, load: () => null, save: noop, clear: noop }),
    log: () => ({ debug: noop, info: noop, warn: noop, error: noop }),
    appVersion: 'test'
  }
}

// a believable synced lyric for track() below: right song, right length, enough lines, timestamps inside the song
const LRC = Array.from({ length: 12 }, (_, i) => `[${String(Math.floor((10 + i * 14) / 60)).padStart(2, '0')}:${String((10 + i * 14) % 60).padStart(2, '0')}.00]line ${i + 1}`).join('\n')
const MATCHED = { title: 'Song', artist: 'Artist', durationMs: 180_000 }
const found = (text = LRC): ProviderResult => ({ kind: 'found', synced: text, matched: MATCHED })

class Fake implements LyricsProvider {
  calls = 0
  byIdCalls = 0
  constructor(
    readonly id: string,
    private readonly script: (n: number) => ProviderResult | Error,
    readonly name = id
  ) {}
  async fetch(): Promise<ProviderResult> {
    const r = this.script(this.calls++)
    if (r instanceof Error) throw r
    return r
  }
  async byId(): Promise<ProviderResult> {
    this.byIdCalls++
    return found('[00:01.00]pinned one\n[00:02.00]pinned two')
  }
}

const net = (m = 'offline') => new LyricsProviderError(m, 'network')
const track = (id = 'spotify:1', title = 'Song', artist = 'Artist'): Track =>
  ({ id, uri: `spotify:track:${id}`, title, artists: [artist], album: 'Al', durationMs: 180_000, artworkUrl: null, explicit: false, webUrl: null, releaseYear: 2020 }) as Track

let clock = 1_000_000
const svc = (...p: LyricsProvider[]) => new LyricsService(p, () => clock, async () => undefined)

beforeEach(() => {
  setPlatform(memoryPlatform())
  clock = 1_000_000
})

describe('LyricsService resilience', () => {
  it('falls through to the next provider when one fails, and caches the answer', async () => {
    const a = new Fake('a', () => net())
    const b = new Fake('b', () => found())
    const s = svc(a, b)
    const r = await s.get(track())
    expect(r.status).toBe('synced')
    expect(r.provider).toBe('b')
    await s.get(track())
    expect(b.calls).toBe(1) // second time came from the cache
  })

  it('retries a temporary network failure once before giving up on a provider', async () => {
    const a = new Fake('a', (n) => (n === 0 ? net() : found()))
    const r = await svc(a).get(track())
    expect(r.status).toBe('synced')
    expect(a.calls).toBe(2)
  })

  it('puts a failing provider on hold (circuit breaker) so it is not hammered', async () => {
    const a = new Fake('a', () => net())
    const s = svc(a)
    for (let i = 0; i < 3; i++) await s.get(track(`id${i}`, `Song ${i}`))
    const callsAfterThree = a.calls
    const r = await s.get(track('idX', 'Another'))
    expect(a.calls).toBe(callsAfterThree) // skipped while resting
    expect(r.status).toBe('error')
    expect(r.error?.retryInSec).toBeGreaterThan(0)
    expect(s.health()[0]!.state).toBe('down')
  })

  it('never says "no lyrics" when a service was down, and does not remember it', async () => {
    const a = new Fake('a', () => net())
    const b = new Fake('b', () => ({ kind: 'none' }))
    const s = svc(a, b)
    const r = await s.get(track())
    expect(r.status).toBe('error')
    // later the service is back and has the lyrics
    const s2 = svc(new Fake('a', () => found()), b)
    expect((await s2.get(track())).status).toBe('synced')
  })

  it('a complete "not found" is remembered', async () => {
    const a = new Fake('a', () => ({ kind: 'none' }))
    const s = svc(a)
    expect((await s.get(track())).status).toBe('none')
    await s.get(track())
    expect(a.calls).toBe(1)
  })

  it('serves an old copy when the services cannot be reached (stale-if-error)', async () => {
    const good = new Fake('a', () => found())
    const s = svc(good)
    await s.get(track())
    clock += 40 * 24 * 3600_000 // the cached copy is now past its freshness
    const bad = new Fake('a', () => net())
    const s2 = new LyricsService([bad], () => clock, async () => undefined)
    const r = await s2.get(track())
    expect(r.status).toBe('synced')
    expect(r.stale).toBe(true)
  })
})

describe('your own lyrics and your choices', () => {
  it('pasted lyrics win over services and can be removed', async () => {
    const a = new Fake('a', () => found())
    const s = svc(a)
    const t = track()
    const r = s.importText(t, '[00:01.00]my line\n[00:05.00]another')
    expect('error' in r).toBe(false)
    const got = await s.get(t)
    expect(got.imported).toBe(true)
    expect(got.lines[0]!.text).toBe('my line')
    expect(a.calls).toBe(0)
    s.clearImport(t)
    expect((await s.get(t)).imported).toBeUndefined()
  })

  it('rejects text that is not lyrics', () => {
    const s = svc(new Fake('a', () => found()))
    expect('error' in s.importText(track(), '   ')).toBe(true)
  })

  it('remembers a picked match for the SONG, even when another player reports a different id', async () => {
    const a = new Fake('a', () => ({ kind: 'none' }))
    const s = svc(a)
    await s.choose(track('spotify:1'), 'a', '42')
    const fromWindows = await s.get(track('smtc:xyz', 'Song (Remastered 2011)', 'Artist'))
    expect(a.byIdCalls).toBe(1) // fetched once when chosen; the other player's id then hits the song-level cache
    expect(a.calls).toBe(0) // and no automatic search ran
    expect(fromWindows.pinned).toBe(true)
    expect(fromWindows.lines[0]!.text).toBe('pinned one')
  })
})

describe('synced lyrics always win', () => {
  const plainRes = (): ProviderResult => ({ kind: 'found', plain: 'just words\nno timing', matched: MATCHED })

  it('keeps asking the next service when the first one only has plain text', async () => {
    const a = new Fake('a', () => plainRes())
    const b = new Fake('b', () => found())
    const r = await svc(a, b).get(track())
    expect(r.status).toBe('synced')
    expect(r.provider).toBe('b')
    expect(a.calls).toBe(1)
  })

  it('uses plain text only when no service has it synced', async () => {
    const a = new Fake('a', () => plainRes())
    const b = new Fake('b', () => ({ kind: 'none' }))
    const r = await svc(a, b).get(track())
    expect(r.status).toBe('plain')
    expect(r.plain).toContain('just words')
  })

  it('a plain result is replaced when a synced one appears on a later check', async () => {
    let round = 0
    const a = new Fake('a', () => (round++ === 0 ? plainRes() : found()))
    const s = svc(a)
    const first = await s.get(track())
    expect(first.status).toBe('plain')
    const second = await s.get(track(), true) // what the UI does a few seconds later
    expect(second.status).toBe('synced')
    // and the synced one is what is remembered
    expect((await s.get(track())).status).toBe('synced')
  })

  it('plain text expires sooner than synced (so a synced entry is looked for again tomorrow)', async () => {
    const a = new Fake('a', () => plainRes())
    const s = svc(a)
    await s.get(track())
    clock += 25 * 3600_000
    await s.get(track())
    expect(a.calls).toBe(2)
  })
})
