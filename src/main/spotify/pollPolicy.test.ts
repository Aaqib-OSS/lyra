import { describe, expect, it } from 'vitest'
import { authFailureAction, backoffMs, nextPollDelay, retryAfterSec } from './pollPolicy'
import { parseTokenRecord } from './tokenRecord'

const base = { hasTrack: false, isPlaying: false, background: false, positionNowMs: 0, durationMs: 0, idleForMs: 0 }

describe('nextPollDelay', () => {
  it('polls fast while playing and wakes at the track end', () => {
    const p = { ...base, hasTrack: true, isPlaying: true, durationMs: 200_000 }
    expect(nextPollDelay({ ...p, positionNowMs: 10_000 })).toBe(3_000)
    expect(nextPollDelay({ ...p, positionNowMs: 199_000 })).toBe(1_400)
    expect(nextPollDelay({ ...p, positionNowMs: 199_900 })).toBe(500)
    expect(nextPollDelay({ ...p, positionNowMs: 10_000, background: true })).toBe(8_000)
  })
  it('backs off the longer nothing plays, and never exceeds a minute hidden', () => {
    expect(nextPollDelay(base)).toBe(5_000)
    expect(nextPollDelay({ ...base, idleForMs: 2 * 60_000 })).toBe(10_000)
    expect(nextPollDelay({ ...base, idleForMs: 30 * 60_000 })).toBe(30_000)
    expect(nextPollDelay({ ...base, idleForMs: 30 * 60_000, background: true })).toBe(60_000)
  })
  it('polls a paused track a little slower than an active one', () => {
    expect(nextPollDelay({ ...base, hasTrack: true })).toBe(6_000)
  })
})

describe('backoff and retry-after', () => {
  it('grows, caps at ~30 s and stays within jitter', () => {
    expect(backoffMs(1, () => 0.5)).toBe(4_000)
    expect(backoffMs(3, () => 0.5)).toBe(16_000)
    expect(backoffMs(99, () => 1)).toBeLessThanOrEqual(36_000)
    expect(backoffMs(0, () => 0.5)).toBe(4_000)
  })
  it('clamps Retry-After', () => {
    expect(retryAfterSec(undefined)).toBe(10)
    expect(retryAfterSec(3.2)).toBe(4)
    expect(retryAfterSec(86_400)).toBe(300)
    expect(retryAfterSec(NaN)).toBe(10)
  })
})

describe('authFailureAction', () => {
  it('only signs out for a rejected grant', () => {
    expect(authFailureAction('revoked')).toBe('sign-out')
    expect(authFailureAction('invalid-client')).toBe('sign-out')
    expect(authFailureAction('network')).toBe('retry')
    expect(authFailureAction('unknown')).toBe('retry')
  })
})

describe('parseTokenRecord', () => {
  const ok = { accessToken: 'a', refreshToken: 'r', expiresAt: 1, clientId: 'c' }
  it('accepts a full record and drops extras', () => {
    expect(parseTokenRecord(JSON.stringify({ ...ok, extra: 1 }))).toEqual(ok)
  })
  it('rejects broken ones', () => {
    for (const bad of ['', 'null', '[]', '{"accessToken":"a"}', JSON.stringify({ ...ok, expiresAt: 'x' }), JSON.stringify({ ...ok, refreshToken: '' })])
      expect(parseTokenRecord(bad)).toBeNull()
  })
})
