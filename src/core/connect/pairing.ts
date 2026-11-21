import { authInput, cmdInput, type ErrorCode, type Role } from './protocol'
import { hmacSha256Hex, safeEqual } from './hmac'

/**
 * Pairing and device registry (pure logic, injectable clock and randomness, no I/O).
 *
 * - A pairing code is short (8 characters, ~40 bits), lives 2 minutes, works once, and is killed after 5 wrong tries.
 *   "Party" codes may be used by many guests, give the viewer role only, and their devices expire with the party.
 * - Redeeming a code mints a per-device token (256 bits). The token is shown to the device once and is never sent
 *   again: every later connection proves it holds the token with an HMAC over fresh nonces.
 * - Any device can be revoked (the host forgets the token, so it can never authenticate again) or have its role changed.
 */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' // Crockford base32: no I, L, O, U
export const CODE_LENGTH = 8
export const CODE_TTL_MS = 120_000
export const PARTY_TTL_MS = 4 * 60 * 60 * 1000
export const MAX_CODE_FAILURES = 5
export const MAX_DEVICES = 12
export const MAX_FAILURES_PER_MINUTE = 10

export interface Device {
  id: string
  name: string
  role: Role
  token: string
  /** joined through a party code: removed when the party ends */
  guest: boolean
  createdAt: number
  lastSeen: number
  /** absolute expiry (guests only) */
  expiresAt?: number
}

export interface PairingCode {
  code: string
  role: Role
  expiresAt: number
  party: boolean
  failures: number
}

export interface PairingDeps {
  now: () => number
  /** n random bytes as lowercase hex */
  randomHex: (bytes: number) => string
  /** n random bytes */
  randomBytes: (n: number) => Uint8Array
}

export type Redeem = { ok: true; device: Device } | { ok: false; code: ErrorCode; msg: string }

/** Typed-in codes are forgiving: case, spaces, dashes, and the look-alikes O/I/L. */
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
}

export const formatCode = (code: string): string => `${code.slice(0, 4)}-${code.slice(4)}`

export class Pairing {
  private devices = new Map<string, Device>()
  private codes: PairingCode[] = []
  private failureTimes: number[] = []

  constructor(
    private readonly deps: PairingDeps,
    initial: Device[] = [],
    private readonly onChange: (devices: Device[]) => void = () => undefined
  ) {
    for (const d of initial) this.devices.set(d.id, d)
    this.sweep()
  }

  // ---- codes ---------------------------------------------------------------------------------------------------

  private randomCode(): string {
    let s = ''
    // 32 divides 256 evenly, so byte % 32 is unbiased
    for (const b of this.deps.randomBytes(CODE_LENGTH)) s += CODE_ALPHABET[b % 32]
    return s
  }

  /** A fresh code replaces the previous non-party code, so only one is ever on screen. */
  createCode(opts: { role?: Role; party?: boolean } = {}): PairingCode {
    const party = !!opts.party
    this.sweep()
    if (!party) this.codes = this.codes.filter((c) => c.party)
    const c: PairingCode = {
      code: this.randomCode(),
      // a code can never mint an overlay: that role exists only through addOverlay on the host
      role: party || opts.role === 'overlay' ? 'viewer' : (opts.role ?? 'viewer'),
      expiresAt: this.deps.now() + (party ? PARTY_TTL_MS : CODE_TTL_MS),
      party,
      failures: 0
    }
    this.codes.push(c)
    return c
  }

  activeCodes(): PairingCode[] {
    this.sweep()
    return this.codes.slice()
  }

  cancelCodes(): void {
    this.codes = []
  }

  redeem(input: string, name: string): Redeem {
    const now = this.deps.now()
    this.sweep()
    this.failureTimes = this.failureTimes.filter((t) => now - t < 60_000)
    if (this.failureTimes.length >= MAX_FAILURES_PER_MINUTE) return { ok: false, code: 'rate', msg: 'Too many wrong codes. Wait a minute.' }
    const typed = normalizeCode(input)
    const hit = this.codes.find((c) => typed.length === c.code.length && safeEqual(typed, c.code))
    if (!hit) {
      this.failureTimes.push(now)
      // a guess at any code counts against every live non-party code: 5 wrong tries and they are gone
      for (const c of this.codes) if (!c.party) c.failures++
      this.codes = this.codes.filter((c) => c.failures < MAX_CODE_FAILURES)
      return { ok: false, code: 'bad-code', msg: 'That code is not right.' }
    }
    if (this.devices.size >= MAX_DEVICES) return { ok: false, code: 'full', msg: `At most ${MAX_DEVICES} devices. Remove one first.` }
    if (!hit.party) this.codes = this.codes.filter((c) => c !== hit) // single use
    const device: Device = {
      id: this.deps.randomHex(8),
      name: cleanName(name),
      role: hit.role,
      token: this.deps.randomHex(32),
      guest: hit.party,
      createdAt: now,
      lastSeen: now,
      ...(hit.party ? { expiresAt: hit.expiresAt } : {})
    }
    this.devices.set(device.id, device)
    this.changed()
    return { ok: true, device }
  }

  // ---- registry ------------------------------------------------------------------------------------------------

  list(): Device[] {
    this.sweep()
    return [...this.devices.values()]
  }

  get(id: string): Device | null {
    this.sweep()
    return this.devices.get(id) ?? null
  }

  revoke(id: string): boolean {
    const had = this.devices.delete(id)
    if (had) this.changed()
    return had
  }

  /**
   * A view-only device for an OBS browser source, which cannot scan a QR code. The host creates it directly (no code, no
   * redeem step), so its token never travels over the network: the overlay page gets it in the link's URL fragment and
   * proves it with the usual HMAC handshake. Revoking the device kills the link. Returns null when the registry is full.
   */
  addOverlay(name = 'OBS overlay'): Device | null {
    this.sweep()
    if (this.devices.size >= MAX_DEVICES) return null
    const now = this.deps.now()
    const device: Device = { id: this.deps.randomHex(8), name: cleanName(name), role: 'overlay', token: this.deps.randomHex(32), guest: false, createdAt: now, lastSeen: now }
    this.devices.set(device.id, device)
    this.changed()
    return device
  }

  setRole(id: string, role: Role): boolean {
    const d = this.devices.get(id)
    if (!d) return false
    // overlay is fixed at creation: an overlay link can never be upgraded, and no other device can become one
    if (d.role === 'overlay' || role === 'overlay') return false
    // guests of a party stay viewers: a shared code must never be a way to get control
    d.role = d.guest ? 'viewer' : role
    this.changed()
    return true
  }

  rename(id: string, name: string): void {
    const d = this.devices.get(id)
    if (d) {
      d.name = cleanName(name)
      this.changed()
    }
  }

  touch(id: string): void {
    const d = this.devices.get(id)
    if (d) d.lastSeen = this.deps.now() // not persisted on every touch: saved with the next change
  }

  /** Party over: guests go, paired (non-guest) devices stay. */
  endParty(): string[] {
    this.codes = this.codes.filter((c) => !c.party)
    const gone = [...this.devices.values()].filter((d) => d.guest).map((d) => d.id)
    for (const id of gone) this.devices.delete(id)
    if (gone.length) this.changed()
    return gone
  }

  revokeAll(): string[] {
    const ids = [...this.devices.keys()]
    this.devices.clear()
    this.codes = []
    if (ids.length) this.changed()
    return ids
  }

  // ---- authentication ------------------------------------------------------------------------------------------

  /** Proof a client sends in `auth`: HMAC(token, auth input). */
  static proof(token: string, cn: string, sn: string): string {
    return hmacSha256Hex(token, authInput('auth', cn, sn))
  }

  /** Key both sides derive for the session's command MACs. */
  static sessionKey(token: string, cn: string, sn: string): string {
    return hmacSha256Hex(token, authInput('sess', cn, sn))
  }

  verifyProof(deviceId: string, cn: string, sn: string, proof: string): Device | null {
    const d = this.get(deviceId)
    if (!d) return null
    return safeEqual(Pairing.proof(d.token, cn, sn), proof) ? d : null
  }

  private sweep(): void {
    const now = this.deps.now()
    this.codes = this.codes.filter((c) => c.expiresAt > now)
    let removed = false
    for (const d of [...this.devices.values()]) {
      if (d.expiresAt && d.expiresAt <= now) {
        this.devices.delete(d.id)
        removed = true
      }
    }
    if (removed) this.changed()
  }

  private changed(): void {
    this.onChange([...this.devices.values()])
  }
}

function cleanName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const n = name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40)
  return n || 'Device'
}

/** Per-connection command verifier: strictly increasing counter + MAC under the session key. */
export class CommandGate {
  private last = 0
  constructor(private readonly sessionKey: string) {}

  check(n: number, b: string, mac: string): 'ok' | 'replay' | 'bad-proof' {
    if (!safeEqual(hmacSha256Hex(this.sessionKey, cmdInput(n, b)), mac)) return 'bad-proof'
    if (n <= this.last) return 'replay'
    this.last = n
    return 'ok'
  }
}

/** Client-side helper: sign a command body. */
export const signCommand = (sessionKey: string, n: number, b: string): string => hmacSha256Hex(sessionKey, cmdInput(n, b))
