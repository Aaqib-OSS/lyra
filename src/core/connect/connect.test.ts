import { createHmac, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hmacSha256Hex } from './hmac'
import { ClockOffset, backoffMs, followDecision, followPositionMs, pingDelayMs, sampleFrom } from './clockSync'
import { CODE_ALPHABET, CODE_LENGTH, CODE_TTL_MS, CommandGate, MAX_CODE_FAILURES, MAX_DEVICES, MAX_PEER_FAILURES, PEER_LOCK_MS, Pairing, normalizeCode, signCommand, type Device } from './pairing'
import { encode, parseClient, parseCommand, parseHost, MAX_CLIENT_BYTES } from './protocol'
import { ANCHOR_REFRESH_MS, SyncState } from './syncState'

describe('hmac', () => {
  it('matches node:crypto for short, block-sized and long inputs', () => {
    for (const [k, m] of [['k', 'm'], ['', ''], ['x'.repeat(64), 'y'.repeat(200)], ['x'.repeat(100), 'héllo wörld ♪'], [randomBytes(20).toString('hex'), randomBytes(500).toString('hex')]] as const) {
      expect(hmacSha256Hex(k, m)).toBe(createHmac('sha256', k).update(m).digest('hex'))
    }
  })
})

describe('protocol', () => {
  const nonce = 'a'.repeat(32)
  it('round-trips versioned messages and rejects bad ones', () => {
    const ok = parseClient(encode({ t: 'hello', deviceId: 'abc', name: 'Phone', cn: nonce }))
    expect(ok.ok && ok.msg.t).toBe('hello')
    expect(parseClient('not json')).toMatchObject({ ok: false, code: 'bad-message' })
    expect(parseClient(JSON.stringify({ v: 2, t: 'ping', id: 1, c0: 1 }))).toMatchObject({ ok: false, code: 'version' })
    expect(parseClient(JSON.stringify({ v: 1, t: 'pair', code: 'x', name: 'n', cn: 'zz' }))).toMatchObject({ ok: false })
    expect(parseClient(JSON.stringify({ v: 1, t: 'ping', id: 'x', c0: 1 }))).toMatchObject({ ok: false })
    expect(parseClient('x'.repeat(MAX_CLIENT_BYTES + 1))).toMatchObject({ ok: false })
    expect(parseClient(JSON.stringify({ v: 1, t: 'launch-missiles' }))).toMatchObject({ ok: false })
  })
  it('drops unknown fields', () => {
    const r = parseClient(JSON.stringify({ v: 1, t: 'ping', id: 1, c0: 2, evil: 'x' }))
    expect(r.ok && Object.keys(r.msg).sort()).toEqual(['c0', 'id', 't'])
  })
  it('parses and clamps commands', () => {
    expect(parseCommand('{"c":"volume","pct":900}')).toEqual({ c: 'volume', pct: 100 })
    expect(parseCommand('{"c":"seek","ms":-5}')).toEqual({ c: 'seek', ms: 0 })
    expect(parseCommand('{"c":"vibe","id":"neon"}')).toEqual({ c: 'vibe', id: 'neon' })
    expect(parseCommand('{"c":"vibe","id":"../x"}')).toBeNull()
    expect(parseCommand('{"c":"rm"}')).toBeNull()
    expect(parseCommand('nope')).toBeNull()
  })
  it('host messages need the version tag', () => {
    expect(parseHost(encode({ t: 'bye' })).ok).toBe(true)
    expect(parseHost('{"t":"bye"}')).toMatchObject({ ok: false, code: 'version' })
  })
})

describe('clock offset', () => {
  it('recovers a known offset from a symmetric exchange', () => {
    // host clock is 5000 ahead; 20 ms each way; host takes 2 ms
    const c0 = 1000
    const s1 = c0 + 20 + 5000
    const s2 = s1 + 2
    const c3 = c0 + 20 + 2 + 20
    const s = sampleFrom(c0, s1, s2, c3)!
    expect(s.offset).toBeCloseTo(5000, 5)
    expect(s.rtt).toBe(40)
  })
  it('prefers the lowest round trip (jitter only ever adds delay)', () => {
    const c = new ClockOffset()
    c.add({ offset: 5100, rtt: 200, at: 1000 }) // a queued, asymmetric sample
    c.add({ offset: 5001, rtt: 8, at: 1100 })
    c.add({ offset: 4900, rtt: 150, at: 1200 })
    expect(c.offset(1300)).toBe(5001)
    expect(c.uncertaintyMs(1300)).toBe(4)
  })
  it('ignores impossible samples and old ones age out', () => {
    expect(sampleFrom(1000, 1000, 1000, 900)).toBeNull()
    expect(sampleFrom(0, 0, 0, 60_000)).toBeNull()
    const c = new ClockOffset(8, 1000)
    c.add({ offset: 10, rtt: 5, at: 0 })
    c.add({ offset: 20, rtt: 50, at: 5000 })
    expect(c.offset(5100)).toBe(20)
  })
  it('follows the host position through the offset and freezes when paused', () => {
    const c = new ClockOffset()
    c.add({ offset: 5000, rtt: 10, at: 0 })
    const play = { playing: true, positionMs: 10_000, at: 105_000 }
    expect(followPositionMs(play, c, 200_000, 100_500)).toBe(10_500) // local 100500 = host 105500
    expect(followPositionMs({ ...play, playing: false }, c, 200_000, 100_500)).toBe(10_000)
    expect(followPositionMs(play, c, 10_200, 100_500)).toBe(10_200) // never past the end
    expect(followPositionMs(null, c, 1000, 0)).toBe(0)
  })
  it('re-seeks only when clearly off, and not in a storm', () => {
    expect(followDecision(10_000, 10_200, 0, 100_000).action).toBe('none')
    expect(followDecision(10_000, 11_000, 0, 100_000).action).toBe('seek')
    expect(followDecision(10_000, 11_000, 99_000, 100_000).action).toBe('none')
  })
  it('pings fast at first, then slowly; backoff grows and caps', () => {
    expect(pingDelayMs(0)).toBeLessThan(pingDelayMs(8))
    expect(pingDelayMs(8)).toBeLessThan(pingDelayMs(20))
    expect(backoffMs(0, 0.5)).toBe(500)
    expect(backoffMs(3, 0.5)).toBe(4000)
    expect(backoffMs(20, 0.5)).toBe(15_000)
    expect(backoffMs(20, 0.999)).toBeLessThanOrEqual(15_000 * 1.25)
  })
})

function makePairing(start = 1_000_000) {
  let t = start
  let n = 0
  let saved: Device[] = []
  const p = new Pairing(
    {
      now: () => t,
      randomHex: (b) => (++n).toString(16).padStart(b * 2, '0'),
      randomBytes: (b) => Uint8Array.from({ length: b }, (_, i) => (i * 7 + n++) & 255)
    },
    [],
    (d) => (saved = d)
  )
  return { p, tick: (ms: number) => (t += ms), saved: () => saved }
}

describe('pairing', () => {
  it('makes short codes from the unambiguous alphabet', () => {
    const { p } = makePairing()
    const c = p.createCode()
    expect(c.code).toHaveLength(CODE_LENGTH)
    for (const ch of c.code) expect(CODE_ALPHABET).toContain(ch)
  })
  it('is forgiving about case, dashes and look-alikes', () => {
    expect(normalizeCode('ab-cd 0o1il')).toBe('ABCD00111')
  })
  it('redeems once, mints a device with a token, and a code cannot be reused', () => {
    const { p, saved } = makePairing()
    const c = p.createCode({ role: 'controller' })
    const r = p.redeem(c.code.toLowerCase(), 'My Phone')
    expect(r.ok && r.device.role).toBe('controller')
    expect(r.ok && r.device.token).toHaveLength(64)
    expect(saved()).toHaveLength(1)
    expect(p.redeem(c.code, 'Again')).toMatchObject({ ok: false, code: 'bad-code' })
  })
  it('codes expire after two minutes', () => {
    const { p, tick } = makePairing()
    const c = p.createCode()
    tick(CODE_TTL_MS + 1)
    expect(p.redeem(c.code, 'x')).toMatchObject({ ok: false })
  })
  it('burns the code after repeated wrong guesses', () => {
    const { p } = makePairing()
    const c = p.createCode()
    for (let i = 0; i < MAX_CODE_FAILURES; i++) expect(p.redeem('ZZZZZZZZ', 'x').ok).toBe(false)
    expect(p.redeem(c.code, 'x')).toMatchObject({ ok: false })
  })
  it('rate-limits guessing across codes', () => {
    const { p } = makePairing()
    let last: unknown
    for (let i = 0; i < 22; i++) {
      p.createCode() // a fresh code each time so only the global limiter can stop us
      last = p.redeem('ZZZZZZZZ', 'x')
    }
    expect(last).toMatchObject({ code: 'rate' })
  })
  it('locks out one peer address after a few misses without hurting another', () => {
    const { p, tick } = makePairing()
    const c = p.createCode()
    for (let i = 0; i < MAX_PEER_FAILURES; i++) expect(p.redeem('ZZZZZZZZ', 'x', '192.168.1.50')).toMatchObject({ code: expect.stringMatching(/bad-code|rate/) })
    // the locked peer is refused even with the right code, and the code was not burned by it
    expect(p.redeem(c.code, 'x', '192.168.1.50')).toMatchObject({ ok: false, code: 'rate' })
    expect(p.redeem(c.code, 'Phone', '192.168.1.60')).toMatchObject({ ok: true })
    tick(PEER_LOCK_MS + 1)
    expect(p.redeem(p.createCode().code, 'Back', '192.168.1.50')).toMatchObject({ ok: true })
  })
  it('one peer cannot burn the live code', () => {
    const { p } = makePairing()
    const c = p.createCode()
    for (let i = 0; i < 30; i++) p.redeem('ZZZZZZZZ', 'x', '192.168.1.50')
    expect(p.redeem(c.code, 'Phone', '192.168.1.60')).toMatchObject({ ok: true })
  })
  it('only one one-time code is live at a time', () => {
    const { p } = makePairing()
    const a = p.createCode()
    p.createCode()
    expect(p.redeem(a.code, 'x')).toMatchObject({ ok: false })
  })
  it('authenticates by proof; wrong token, wrong nonce, and revoked devices fail', () => {
    const { p } = makePairing()
    const r = p.redeem(p.createCode().code, 'Phone')
    if (!r.ok) throw new Error('pair failed')
    const cn = 'c'.repeat(32)
    const sn = 's'.repeat(32)
    expect(p.verifyProof(r.device.id, cn, sn, Pairing.proof(r.device.token, cn, sn))).not.toBeNull()
    expect(p.verifyProof(r.device.id, cn, sn, Pairing.proof('0'.repeat(64), cn, sn))).toBeNull()
    expect(p.verifyProof(r.device.id, cn, 'x'.repeat(32), Pairing.proof(r.device.token, cn, sn))).toBeNull() // replayed proof, new nonce
    expect(p.verifyProof('nope', cn, sn, Pairing.proof(r.device.token, cn, sn))).toBeNull()
    expect(p.revoke(r.device.id)).toBe(true)
    expect(p.verifyProof(r.device.id, cn, sn, Pairing.proof(r.device.token, cn, sn))).toBeNull()
  })
  it('party codes are reusable, viewer-only, and their guests go when the party ends', () => {
    const { p } = makePairing()
    const own = p.redeem(p.createCode({ role: 'controller' }).code, 'Mine')
    const party = p.createCode({ party: true, role: 'controller' })
    expect(party.role).toBe('viewer')
    const g1 = p.redeem(party.code, 'G1')
    const g2 = p.redeem(party.code, 'G2')
    expect(g1.ok && g2.ok).toBe(true)
    if (g1.ok) {
      p.setRole(g1.device.id, 'controller')
      expect(p.get(g1.device.id)!.role).toBe('viewer')
    }
    expect(p.endParty()).toHaveLength(2)
    expect(p.list().map((d) => d.name)).toEqual([own.ok ? 'Mine' : ''])
  })
  it('party guests expire on their own', () => {
    const { p, tick } = makePairing()
    const g = p.redeem(p.createCode({ party: true }).code, 'G')
    tick(5 * 60 * 60 * 1000)
    expect(g.ok && p.get(g.device.id)).toBeNull()
  })
  it('caps the number of devices and cleans names', () => {
    const { p } = makePairing()
    for (let i = 0; i < MAX_DEVICES; i++) expect(p.redeem(p.createCode().code, `d${i}`).ok).toBe(true)
    expect(p.redeem(p.createCode().code, 'one too many')).toMatchObject({ code: 'full' })
    const q = makePairing().p
    const r = q.redeem(q.createCode().code, '<script>alert(1)</script>\n')
    expect(r.ok && r.device.name).toBe('scriptalert(1)/script')
  })
  it('survives a restart: devices come back from storage', () => {
    const a = makePairing()
    const r = a.p.redeem(a.p.createCode().code, 'Phone')
    const b = new Pairing({ now: () => 1_000_001, randomHex: () => 'ab', randomBytes: (n) => new Uint8Array(n) }, a.saved())
    expect(r.ok && b.get(r.device.id)?.name).toBe('Phone')
  })
})

describe('command gate', () => {
  const key = 'k'.repeat(64)
  it('accepts signed, increasing commands only', () => {
    const g = new CommandGate(key)
    const b = '{"c":"play"}'
    expect(g.check(1, b, signCommand(key, 1, b))).toBe('ok')
    expect(g.check(1, b, signCommand(key, 1, b))).toBe('replay')
    expect(g.check(2, b, signCommand(key, 1, b))).toBe('bad-proof')
    expect(g.check(3, '{"c":"next"}', signCommand(key, 3, b))).toBe('bad-proof')
    expect(g.check(3, b, signCommand('other', 3, b))).toBe('bad-proof')
    expect(g.check(4, b, signCommand(key, 4, b))).toBe('ok')
  })
})

describe('sync state', () => {
  const song = { id: 's1', key: 'a|b', title: 'T', artists: ['A'], durationMs: 200_000 }
  it('says nothing when nothing changed', () => {
    const s = new SyncState()
    expect(s.setNow(song)).not.toBeNull()
    expect(s.setNow(song)).toBeNull()
    expect(s.setPlay({ playing: true, positionMs: 1000, at: 10_000 }, 10_000)).not.toBeNull()
    // five seconds later the host reports the position the anchor already predicts
    expect(s.setPlay({ playing: true, positionMs: 6000, at: 15_000 }, 15_000)).toBeNull()
  })
  it('re-sends on pause, seek and when the anchor is stale', () => {
    const s = new SyncState()
    s.setPlay({ playing: true, positionMs: 0, at: 0 }, 0)
    expect(s.setPlay({ playing: false, positionMs: 3000, at: 3000 }, 3000)).not.toBeNull()
    expect(s.setPlay({ playing: false, positionMs: 90_000, at: 4000 }, 4000)).not.toBeNull() // seek while paused
    expect(s.setPlay({ playing: false, positionMs: 90_000, at: 5000 }, 5000)).toBeNull()
    expect(s.setPlay({ playing: false, positionMs: 90_000, at: 5000 + ANCHOR_REFRESH_MS }, 5000 + ANCHOR_REFRESH_MS + 1)).not.toBeNull()
  })
  it('drops late lyrics / art for a song that is already over and clears them on a new song', () => {
    const s = new SyncState()
    s.setNow(song)
    expect(s.setLyrics({ id: 's1', status: 'synced', synced: true, lines: [{ t: 0, x: 'hi' }] })).not.toBeNull()
    expect(s.setLyrics({ id: 'old', status: 'synced', synced: true, lines: [] })).toBeNull()
    s.setNow({ ...song, id: 's2' })
    expect(s.snapshot().some((m) => m.t === 'lyrics')).toBe(false)
  })
  it('only forwards small, safe artwork', () => {
    const s = new SyncState()
    s.setNow(song)
    expect(s.setArt('s1', 'javascript:alert(1)')).toMatchObject({ src: null })
    const s2 = new SyncState()
    s2.setNow(song)
    expect(s2.setArt('s1', 'https://x.test/a.jpg')).toMatchObject({ src: 'https://x.test/a.jpg' })
    expect(s2.setArt('s1', 'data:image/png;base64,' + 'A'.repeat(400_000))).toMatchObject({ src: null })
  })
  it('a joining client gets the whole picture', () => {
    const s = new SyncState()
    s.setNow(song, { offsetMs: 250 })
    s.setView({ vibe: 'neon', video: { id: 'abcdefghijk' } })
    s.setPlay({ playing: true, positionMs: 5, at: 5 }, 5)
    expect(s.snapshot().map((m) => m.t)).toEqual(['now', 'view', 'play'])
  })
})
