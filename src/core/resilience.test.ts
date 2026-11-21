import { describe, expect, it } from 'vitest'
import { CircuitBreaker, backoffDelay, isTemporary, retry } from './resilience'
import { songKey } from './songKey'

describe('backoffDelay', () => {
  it('doubles and caps', () => {
    const r = () => 0.5 // jitter factor 1
    expect(backoffDelay(0, 1000, 10_000, 0.25, r)).toBe(1000)
    expect(backoffDelay(1, 1000, 10_000, 0.25, r)).toBe(2000)
    expect(backoffDelay(3, 1000, 10_000, 0.25, r)).toBe(8000)
    expect(backoffDelay(9, 1000, 10_000, 0.25, r)).toBe(10_000)
  })
  it('stays inside the jitter band', () => {
    for (let i = 0; i < 50; i++) {
      const d = backoffDelay(2, 1000)
      expect(d).toBeGreaterThanOrEqual(3000)
      expect(d).toBeLessThanOrEqual(5000)
    }
  })
})

describe('retry', () => {
  const noWait = async () => undefined
  it('retries a temporary failure and then succeeds', async () => {
    let calls = 0
    const r = await retry(async () => (++calls < 3 ? Promise.reject(new Error('boom')) : 'ok'), { retries: 3, wait: noWait })
    expect(r).toBe('ok')
    expect(calls).toBe(3)
  })
  it('gives up after the retries and throws the last error', async () => {
    let calls = 0
    await expect(retry(async () => Promise.reject(new Error(`e${++calls}`)), { retries: 2, wait: noWait })).rejects.toThrow('e3')
  })
  it('does not retry when shouldRetry says no', async () => {
    let calls = 0
    await expect(retry(async () => (calls++, Promise.reject(new Error('fatal'))), { shouldRetry: () => false, wait: noWait })).rejects.toThrow('fatal')
    expect(calls).toBe(1)
  })
  it('honours a delay the error asks for', async () => {
    const waits: number[] = []
    let calls = 0
    await retry(async () => (++calls < 2 ? Promise.reject(new Error('x')) : 1), { delayFor: () => 4321, wait: async (ms) => void waits.push(ms) })
    expect(waits).toEqual([4321])
  })
})

describe('CircuitBreaker', () => {
  it('opens after the threshold, allows one trial after the cool-down, closes on success', () => {
    let t = 0
    const b = new CircuitBreaker(2, 10_000, () => t)
    expect(b.canTry()).toBe(true)
    b.failure('a')
    expect(b.state).toBe('closed')
    b.failure('b')
    expect(b.state).toBe('open')
    expect(b.canTry()).toBe(false)
    expect(b.retryInSec).toBe(10)
    t = 10_001
    expect(b.state).toBe('half-open')
    expect(b.canTry()).toBe(true) // the trial
    expect(b.canTry()).toBe(false) // only one at a time
    b.success()
    expect(b.state).toBe('closed')
  })
  it('a failed trial re-opens it for a full cool-down', () => {
    let t = 0
    const b = new CircuitBreaker(1, 5000, () => t)
    b.failure()
    t = 5001
    expect(b.canTry()).toBe(true)
    b.failure('still down')
    expect(b.state).toBe('open')
    expect(b.retryInSec).toBe(5)
  })
  it('trip() waits exactly as asked', () => {
    let t = 1000
    const b = new CircuitBreaker(3, 30_000, () => t)
    b.trip(40, 'rate limited')
    expect(b.state).toBe('open')
    expect(b.retryInSec).toBe(30)
  })
})

describe('isTemporary', () => {
  it('knows temporary and permanent errors', () => {
    expect(isTemporary(Object.assign(new Error('x'), { kind: 'network' }))).toBe(true)
    expect(isTemporary(Object.assign(new Error('x'), { kind: 'server' }))).toBe(true)
    expect(isTemporary(Object.assign(new Error('x'), { kind: 'unknown', retryable: false }))).toBe(false)
  })
})

describe('songKey', () => {
  it('is the same across releases and sources', () => {
    const a = songKey('Daft Punk', 'Get Lucky (feat. Pharrell Williams)')
    expect(songKey('Daft Punk', 'Get Lucky')).toBe(a)
    expect(songKey('DAFT PUNK', 'Get Lucky - 2013 Remaster')).toBe(a)
    expect(songKey('Daft Punk, Pharrell Williams', 'get lucky')).toBe(a)
  })
  it('ignores accents and punctuation', () => {
    expect(songKey('Beyoncé', 'Halo!')).toBe(songKey('Beyonce', 'Halo'))
  })
  it('keeps different songs apart', () => {
    expect(songKey('A', 'One')).not.toBe(songKey('A', 'Two'))
  })
})
