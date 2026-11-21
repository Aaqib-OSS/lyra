/**
 * Lyra Connect wire protocol, version 1. Spec: docs/connect-protocol.md (keep the two in step).
 *
 * Small JSON messages over one WebSocket. Pure functions only, so the desktop host, the web viewer, the Android
 * apps and the tests all use the same rules. Nothing here touches the network.
 */
export const PROTOCOL_VERSION = 1
export const SERVICE_TYPE = '_lyra-connect._tcp'
export const DEFAULT_PORT = 47813

/** a client may only speak small messages; the host may send lyrics and artwork */
export const MAX_CLIENT_BYTES = 4 * 1024
export const MAX_HOST_BYTES = 768 * 1024
export const HEARTBEAT_MS = 5000
/** a silent peer is dropped after this long */
export const DEAD_AFTER_MS = 20_000

/**
 * viewer: watches. controller: watches and commands. overlay: the narrowest role, for an OBS browser source: it can read
 * only what is playing, the song clock, lyrics, art and the vibe (no video choice, no device list, no commands). It is
 * never minted by a pairing code, only by the host creating a revocable overlay link (Pairing.addOverlay).
 */
export type Role = 'viewer' | 'controller' | 'overlay'
export const ROLES: readonly Role[] = ['viewer', 'controller', 'overlay']

/** what the host tells a paired client about the song, everything needed to show it without asking again */
export interface NowInfo {
  id: string
  /** stable per-song identity (core/songKey), the key of the user's per-song choices */
  key: string
  title: string
  artists: string[]
  album?: string
  durationMs: number
}

/** Song clock anchor. `at` is HOST time (ms epoch); the client converts with its clock offset. */
export interface PlayInfo {
  playing: boolean
  positionMs: number
  at: number
  volume?: number
}

export interface ChoicesInfo {
  video?: { videoId: string }
  lyrics?: { provider: string; id: string }
  offsetMs?: number
}

export interface LyricLine {
  /** start time in ms (0 for unsynced text) */
  t: number
  x: string
}

export interface VideoInfo {
  /** YouTube id every device plays locally, in sync; null = show the cover art instead */
  id: string | null
}

export interface ViewInfo {
  /** the vibe in effect on the host (data-vibe) */
  vibe: string
  mode?: 'fixed' | 'cycle' | 'smart'
  video: VideoInfo
  /** the lyric timing shift in effect for this song on the host (global + per-song nudge), ms */
  offsetMs?: number
}

export type ErrorCode = 'version' | 'bad-message' | 'bad-code' | 'expired' | 'unknown-device' | 'bad-proof' | 'forbidden' | 'rate' | 'full' | 'replay'

export interface DeviceSummary {
  id: string
  name: string
  role: Role
  online: boolean
}

/** Messages the host sends. */
export type HostMsg =
  | { t: 'challenge'; sn: string }
  | { t: 'paired'; deviceId: string; token: string; role: Role; sn: string }
  | { t: 'ready'; role: Role; name: string; host: number; vibes: string[]; party: boolean }
  | { t: 'now'; now: NowInfo | null; choices?: ChoicesInfo }
  | { t: 'play'; play: PlayInfo }
  | { t: 'view'; view: ViewInfo }
  | { t: 'lyrics'; id: string; status: string; synced: boolean; lines: LyricLine[] }
  | { t: 'art'; id: string; src: string | null }
  | { t: 'pong'; id: number; c0: number; s1: number; s2: number }
  | { t: 'devices'; devices: DeviceSummary[] }
  | { t: 'err'; code: ErrorCode; msg: string }
  | { t: 'bye'; why?: string }

/** Messages a client sends. Before `ready` only pair / hello / auth / ping are accepted. */
export type ClientMsg =
  | { t: 'pair'; code: string; name: string; cn: string }
  | { t: 'hello'; deviceId: string; name: string; cn: string }
  | { t: 'auth'; proof: string }
  | { t: 'ping'; id: number; c0: number }
  | { t: 'cmd'; n: number; b: string; mac: string }
  | { t: 'bye' }

/** Commands a controller can send (JSON-encoded as the `b` string of a `cmd`, which is what the mac covers). */
export type CommandBody =
  | { c: 'play' }
  | { c: 'pause' }
  | { c: 'toggle' }
  | { c: 'next' }
  | { c: 'prev' }
  | { c: 'seek'; ms: number }
  | { c: 'volume'; pct: number }
  | { c: 'vibe'; id: string }

export function encode(m: HostMsg | ClientMsg): string {
  return JSON.stringify({ v: PROTOCOL_VERSION, ...m })
}

export type Parsed<T> = { ok: true; msg: T } | { ok: false; code: ErrorCode; why: string }

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const str = (x: unknown, max: number): x is string => typeof x === 'string' && x.length > 0 && x.length <= max
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const NONCE = /^[0-9a-f]{16,64}$/
const HEX64 = /^[0-9a-f]{64}$/

/** Parse + validate one message a CLIENT sent. Never throws; unknown fields are dropped. */
export function parseClient(raw: string): Parsed<ClientMsg> {
  if (raw.length > MAX_CLIENT_BYTES) return { ok: false, code: 'bad-message', why: 'too large' }
  let o: unknown
  try {
    o = JSON.parse(raw)
  } catch {
    return { ok: false, code: 'bad-message', why: 'not json' }
  }
  if (!isObj(o) || typeof o.t !== 'string') return { ok: false, code: 'bad-message', why: 'no type' }
  if (o.v !== PROTOCOL_VERSION) return { ok: false, code: 'version', why: `speaks v${String(o.v)}, host speaks v${PROTOCOL_VERSION}` }
  const bad = (why: string): Parsed<ClientMsg> => ({ ok: false, code: 'bad-message', why })
  switch (o.t) {
    case 'pair':
      if (!str(o.code, 16) || !str(o.name, 40) || typeof o.cn !== 'string' || !NONCE.test(o.cn)) return bad('pair')
      return { ok: true, msg: { t: 'pair', code: o.code, name: o.name, cn: o.cn } }
    case 'hello':
      if (!str(o.deviceId, 64) || !str(o.name, 40) || typeof o.cn !== 'string' || !NONCE.test(o.cn)) return bad('hello')
      return { ok: true, msg: { t: 'hello', deviceId: o.deviceId, name: o.name, cn: o.cn } }
    case 'auth':
      if (typeof o.proof !== 'string' || !HEX64.test(o.proof)) return bad('auth')
      return { ok: true, msg: { t: 'auth', proof: o.proof } }
    case 'ping':
      if (!num(o.id) || !num(o.c0)) return bad('ping')
      return { ok: true, msg: { t: 'ping', id: o.id, c0: o.c0 } }
    case 'cmd':
      if (!num(o.n) || !Number.isInteger(o.n) || !str(o.b, 512) || typeof o.mac !== 'string' || !HEX64.test(o.mac)) return bad('cmd')
      return { ok: true, msg: { t: 'cmd', n: o.n, b: o.b, mac: o.mac } }
    case 'bye':
      return { ok: true, msg: { t: 'bye' } }
    default:
      return bad('unknown type')
  }
}

/** Parse the body of a verified command. Numbers are clamped to sane ranges. */
export function parseCommand(b: string): CommandBody | null {
  let o: unknown
  try {
    o = JSON.parse(b)
  } catch {
    return null
  }
  if (!isObj(o) || typeof o.c !== 'string') return null
  switch (o.c) {
    case 'play':
    case 'pause':
    case 'toggle':
    case 'next':
    case 'prev':
      return { c: o.c }
    case 'seek':
      return num(o.ms) ? { c: 'seek', ms: Math.max(0, Math.round(o.ms)) } : null
    case 'volume':
      return num(o.pct) ? { c: 'volume', pct: Math.max(0, Math.min(100, Math.round(o.pct))) } : null
    case 'vibe':
      return str(o.id, 24) && /^[a-z]+$/.test(o.id) ? { c: 'vibe', id: o.id } : null
    default:
      return null
  }
}

/** Parse a message the HOST sent (used by clients). Lenient on extra fields, strict on the type tag. */
export function parseHost(raw: string): Parsed<HostMsg> {
  let o: unknown
  try {
    o = JSON.parse(raw)
  } catch {
    return { ok: false, code: 'bad-message', why: 'not json' }
  }
  if (!isObj(o) || typeof o.t !== 'string') return { ok: false, code: 'bad-message', why: 'no type' }
  if (o.v !== PROTOCOL_VERSION) return { ok: false, code: 'version', why: `host speaks v${String(o.v)}` }
  return { ok: true, msg: o as unknown as HostMsg }
}

/** What both sides MAC. Strings are joined with `|`. */
export const authInput = (kind: 'auth' | 'sess', cn: string, sn: string): string => `lyra1|${kind}|${cn}|${sn}`
export const cmdInput = (n: number, b: string): string => `${n}|${b}`
