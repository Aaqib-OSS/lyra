import { describe, expect, it } from 'vitest'
import { canAutoReload, chooseStoreSource, decideSafeMode, migrate, nextCrashState, rotationMoves, scrubText, shouldRotate } from './reliability'

describe('scrubText', () => {
  it('redacts bearer tokens, token params and auth codes', () => {
    expect(scrubText('Authorization: Bearer abc.DEF-123_x')).toBe('Authorization: Bearer [redacted]')
    expect(scrubText('GET /cb?code=SECRET123&state=xyz&ok=1')).toBe('GET /cb?code=[redacted]&state=[redacted]&ok=1')
    expect(scrubText('{"refresh_token":"abcdefghij"}')).not.toContain('abcdefghij')
    expect(scrubText('http://192.168.1.20:8080/?token=abc12345')).not.toContain('abc12345')
  })
  it('redacts API keys, e-mails and the OS user name', () => {
    expect(scrubText('url AIzaSyA1234567890123456789012345678901234')).toBe('url [redacted-key]')
    expect(scrubText('mail me at jane.doe@example.com')).toBe('mail me at [email]')
    expect(scrubText('C:\\Users\\Dhruv\\AppData\\Roaming\\Lyra')).toBe('C:\\Users\\<user>\\AppData\\Roaming\\Lyra')
    expect(scrubText('/home/jane/.config/lyra')).toBe('/home/<user>/.config/lyra')
    expect(scrubText('in /opt/jane/x', '/opt/jane')).toBe('in <home>/x')
  })
  it('hides LAN addresses but keeps loopback and ordinary text', () => {
    expect(scrubText('ws://192.168.0.5:9000')).toBe('ws://[lan-ip]:9000')
    expect(scrubText('127.0.0.1:5221')).toBe('127.0.0.1:5221')
    expect(scrubText('Lyra 0.27.1 started, Electron 44')).toBe('Lyra 0.27.1 started, Electron 44')
  })
})

describe('log rotation', () => {
  it('shifts files up, oldest first', () => {
    expect(rotationMoves('lyra.log', 3)).toEqual([
      { from: 'lyra.2.log', to: 'lyra.3.log' },
      { from: 'lyra.1.log', to: 'lyra.2.log' },
      { from: 'lyra.log', to: 'lyra.1.log' }
    ])
  })
  it('rotates at the cap', () => {
    expect(shouldRotate(999, 1000)).toBe(false)
    expect(shouldRotate(1000, 1000)).toBe(true)
  })
})

describe('chooseStoreSource', () => {
  it('uses the file when it parses', () => {
    expect(chooseStoreSource('{"a":1}', '{"a":0}')).toMatchObject({ source: 'primary', value: { a: 1 }, primaryCorrupt: false })
  })
  it('falls back to the backup when the file is corrupt, and flags it', () => {
    const r = chooseStoreSource('{"a":', '{"a":0}')
    expect(r).toMatchObject({ source: 'backup', value: { a: 0 }, primaryCorrupt: true })
  })
  it('falls back to defaults when both are unusable; a missing file is not corruption', () => {
    expect(chooseStoreSource('nope', 'also nope')).toMatchObject({ source: 'defaults', primaryCorrupt: true })
    expect(chooseStoreSource(null, null)).toMatchObject({ source: 'defaults', primaryCorrupt: false })
    expect(chooseStoreSource('123', null).source).toBe('defaults')
  })
  it('tolerates a BOM', () => {
    expect(chooseStoreSource('\uFEFF{"a":1}', null).source).toBe('primary')
  })
})

describe('migrate', () => {
  const steps = { 1: (d: Record<string, unknown>) => ({ ...d, b: 2 }), 2: (d: Record<string, unknown>) => ({ ...d, c: 3 }) }
  it('runs every step in order', () => {
    expect(migrate({ a: 1 }, 1, 3, steps)).toEqual({ data: { a: 1, b: 2, c: 3 }, version: 3, failed: false })
  })
  it('is a no-op when current, and skips missing steps', () => {
    expect(migrate({ a: 1 }, 3, 3, steps).data).toEqual({ a: 1 })
    expect(migrate({ a: 1 }, 0, 1, steps)).toEqual({ data: { a: 1 }, version: 1, failed: false })
  })
  it('stops at the failing step', () => {
    const r = migrate({ a: 1 }, 1, 3, { 1: () => { throw new Error('x') } })
    expect(r).toMatchObject({ version: 1, failed: true })
  })
})

describe('safe mode', () => {
  it('counts unfinished starts and resets after a healthy one', () => {
    let s = nextCrashState(null)
    expect(decideSafeMode(s)).toBe(false)
    s = nextCrashState(s) // previous start never became ok
    expect(s.crashes).toBe(1)
    expect(decideSafeMode(s)).toBe(false)
    s = nextCrashState(s)
    expect(s.crashes).toBe(2)
    expect(decideSafeMode(s)).toBe(true)
    expect(nextCrashState({ crashes: 2, ok: true })).toEqual({ crashes: 0, ok: false })
  })
  it('can be forced and survives a garbage marker', () => {
    expect(decideSafeMode({ crashes: 0, ok: false }, true)).toBe(true)
    expect(nextCrashState('junk' as never)).toEqual({ crashes: 0, ok: false })
    expect(nextCrashState({ crashes: 'x' as never, ok: false }).crashes).toBe(1)
  })
})

describe('canAutoReload', () => {
  it('allows 3 reloads a minute, then stops the loop', () => {
    expect(canAutoReload([], 100_000)).toBe(true)
    expect(canAutoReload([90_000, 95_000, 99_000], 100_000)).toBe(false)
    expect(canAutoReload([10_000, 95_000, 99_000], 100_000)).toBe(true)
  })
})
