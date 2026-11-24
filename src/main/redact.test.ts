import { describe, expect, it } from 'vitest'
import { redact } from './redact'

describe('redact', () => {
  it('hides bearer and refresh tokens', () => {
    expect(redact('Authorization: Bearer abc.DEF-123_x')).toBe('Authorization: Bearer [redacted]')
    expect(redact('{"refresh_token":"AQD-secret_1"}')).not.toContain('AQD-secret_1')
  })

  it('hides OAuth callback and API-key query values', () => {
    const out = redact('GET /callback?code=AQBsecret&state=xyz and https://www.googleapis.com/youtube/v3/search?part=snippet&key=SECRETKEY')
    expect(out).not.toContain('AQBsecret')
    expect(out).not.toContain('xyz')
    expect(out).not.toContain('SECRETKEY')
    expect(out).toContain('part=snippet')
  })

  it('hides a Google API key even without ?key=', () => {
    const k = 'AIza' + 'A'.repeat(35)
    expect(redact(`failed for ${k}`)).toBe('failed for [redacted]')
  })

  it('hides the secrets in a Connect overlay link fragment', () => {
    const out = redact('opened http://pc:47813/overlay#d=device123&t=tokenABC')
    expect(out).not.toContain('device123')
    expect(out).not.toContain('tokenABC')
  })

  it('hides the Windows account name, plain and JSON-escaped', () => {
    expect(redact('C:\\Users\\Alice\\AppData\\Roaming\\Lyra')).toBe('C:\\Users\\<user>\\AppData\\Roaming\\Lyra')
    expect(redact(JSON.stringify({ p: 'C:\\Users\\Alice\\x' }))).not.toContain('Alice')
  })

  it('leaves ordinary text alone', () => {
    expect(redact('lyrics found for Song Title by Artist')).toBe('lyrics found for Song Title by Artist')
  })
})
