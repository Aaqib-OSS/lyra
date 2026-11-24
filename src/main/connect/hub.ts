import { createServer, request as httpRequest, type IncomingMessage, type Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { EventEmitter } from 'node:events'
import {
  DEAD_AFTER_MS,
  DEFAULT_PORT,
  HEARTBEAT_MS,
  MAX_CLIENT_BYTES,
  encode,
  parseClient,
  parseCommand,
  type ChoicesInfo,
  type CommandBody,
  type DeviceSummary,
  type ErrorCode,
  type HostMsg,
  type LyricLine,
  type NowInfo,
  type PlayInfo,
  type Role,
  type ViewInfo
} from '@core/connect/protocol'
import { CommandGate, Pairing, formatCode, type Device } from '@core/connect/pairing'
import { SyncState } from '@core/connect/syncState'
import { messageForRole } from '@core/connect/roleView'
import { acceptUpgrade, type WsConn } from './ws'
import { hostAllowed, isLocalPeer, originAllowed } from './net'
import { buildManifest } from './pwa'

/**
 * The Lyra Connect host: one small HTTP + WebSocket server, bound ONLY to the PC's LAN address.
 *
 *  - GET /        the viewer page (static, contains no data and no secrets)
 *  - GET /overlay the OBS / stream overlay page (static too; it authenticates over the WS with an overlay-role link)
 *  - GET /manifest.webmanifest, /icon.png   the viewer's installable-app bits (static)
 *  - WS  /ws      the protocol (docs/connect-protocol.md). Nothing is served to a connection that has not paired.
 *
 * Off by default; nothing listens until the user turns Devices on. Everything else (what is shown, who may do what)
 * lives in core/connect and is unit tested; this class is the thin socket layer around it.
 */
export interface Advertiser {
  start(info: { instance: string; host: string; ip: string; port: number; txt: Record<string, string> }): void
  stop(): void
}

export interface HubDeps {
  pairing: Pairing
  viewerHtml: string
  /** the stream overlay page served at /overlay; when absent the route 404s */
  overlayHtml?: string
  /** the app icon for the installable viewer (PNG bytes and edge length), or null */
  icon?: () => { png: Buffer; size: number } | null
  lanIp: () => string | null
  /** name of the network card the address belongs to ("Wi-Fi"), for the panel */
  lanName?: () => string | null
  /** auto-stop: ms without a connected device before the host turns itself off (0 or absent: never) */
  idleStopMs?: () => number
  /** how often the LAN address is re-read to notice a network change (default: the heartbeat) */
  watchMs?: number
  /** preferred port; if taken the OS picks another */
  port?: number
  hostName: () => string
  vibes: string[]
  onCommand: (cmd: CommandBody, from: Device) => void
  advertiser?: Advertiser
  log?: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void }
  now?: () => number
  randomHex: (bytes: number) => string
}

interface Session {
  conn: WsConn
  stage: 'new' | 'challenged' | 'ready'
  cn?: string
  sn?: string
  helloDeviceId?: string
  device?: Device
  gate?: CommandGate
  lastHeard: number
  peer: string
  messages: number
  pingTokens: number
  pingAt: number
  cmdTokens: number
  cmdAt: number
}

export interface HubStatus {
  running: boolean
  ip: string | null
  port: number
  url: string | null
  party: boolean
  /** the network card the address belongs to */
  network: string | null
  /** the host is switched on but has no address to serve on (offline, or between networks) */
  waiting: boolean
}

/** What "Check this setup" reports. */
export interface SelfTest {
  ok: boolean
  /** what was proven, in plain words (or why not) */
  message: string
  ms: number | null
  ip: string | null
  port: number
  mdns: boolean
}

const MAX_SOCKETS_PER_PEER = 8
const peerOf = (addr: string): string => addr.replace(/^::ffff:/, '')

export class ConnectHub extends EventEmitter {
  private server: Server | null = null
  private sessions = new Set<Session>()
  private sweepTimer: NodeJS.Timeout | null = null
  private port = 0
  private ip: string | null = null
  private party = false
  /** start() was called and not stop(): the watcher runs even while there is no address yet */
  private wanted = false
  private watchTimer: NodeJS.Timeout | null = null
  private rebinding = false
  private idleSince = 0
  readonly state = new SyncState()

  constructor(private readonly d: HubDeps) {
    super()
  }

  private now(): number {
    return (this.d.now ?? Date.now)()
  }

  get running(): boolean {
    return !!this.server
  }

  status(): HubStatus {
    return {
      running: this.running,
      ip: this.ip,
      port: this.port,
      url: this.running && this.ip ? `http://${this.ip}:${this.port}/` : null,
      party: this.party,
      network: this.running ? (this.d.lanName?.() ?? null) : null,
      waiting: this.wanted && !this.running
    }
  }

  // ---- lifecycle -----------------------------------------------------------------------------------------------

  /**
   * Start listening on the LAN address. Resolves false when there is no network to serve on right now; the host then keeps
   * watching and starts serving by itself when a network appears (a laptop that boots offline, a dock being plugged in).
   */
  async start(): Promise<boolean> {
    this.wanted = true
    this.idleSince = this.now()
    if (!this.watchTimer) {
      this.watchTimer = setInterval(() => void this.watch(), this.d.watchMs ?? HEARTBEAT_MS)
      this.watchTimer.unref()
    }
    if (this.server) return true
    const ip = this.d.lanIp()
    if (!ip) {
      this.emit('change')
      return false
    }
    return this.listen(ip)
  }

  private listen(ip: string): Promise<boolean> {
    return new Promise((resolve) => {
      const srv = createServer((req, res) => this.http(req, res))
      // slow-loris: a request line and headers must arrive quickly, and nothing here needs a long-lived plain request
      srv.headersTimeout = 10_000
      srv.requestTimeout = 15_000
      srv.keepAliveTimeout = 5_000
      srv.maxHeadersCount = 50
      srv.on('upgrade', (req, socket) => this.upgrade(req, socket))
      srv.on('clientError', (_e, socket) => socket.destroy())
      let triedRandom = false
      srv.on('error', (e: NodeJS.ErrnoException) => {
        if (!triedRandom && e.code === 'EADDRINUSE' && !this.server) {
          triedRandom = true
          this.d.log?.warn('connect: port in use, letting the OS pick another')
          srv.listen(0, ip)
          return
        }
        this.d.log?.warn('connect: could not listen', e.message)
        if (!this.server) {
          this.emit('change')
          resolve(false)
        }
      })
      srv.listen(this.d.port ?? DEFAULT_PORT, ip, () => {
        this.server = srv
        this.ip = ip
        this.port = (srv.address() as { port: number }).port
        this.sweepTimer = setInterval(() => this.sweep(), HEARTBEAT_MS)
        this.idleSince = this.now()
        this.d.log?.info('connect: listening on', `${ip}:${this.port}`)
        this.d.advertiser?.start({ instance: `Lyra on ${this.d.hostName()}`.slice(0, 40), host: `lyra-${this.d.randomHex(3)}`, ip, port: this.port, txt: { v: '1', name: this.d.hostName() } })
        this.emit('change')
        resolve(true)
      })
    })
  }

  /** Close the listener and every session, keep the watcher and the paired devices. */
  private unlisten(why: string): void {
    this.d.advertiser?.stop()
    if (this.sweepTimer) clearInterval(this.sweepTimer)
    this.sweepTimer = null
    for (const s of [...this.sessions]) this.drop(s, why)
    this.server?.close()
    this.server?.closeAllConnections()
    this.server = null
    this.port = 0
    this.ip = null
    this.party = false
    // a code on screen belongs to the old address: it would pair nothing and could mislead
    this.d.pairing.cancelCodes()
  }

  stop(): void {
    this.wanted = false
    if (this.watchTimer) clearInterval(this.watchTimer)
    this.watchTimer = null
    this.unlisten('The host turned Devices off.')
    this.emit('change')
  }

  /**
   * Notice a network change (Wi-Fi roam, VPN, cable swap, a laptop taken to a cafe): the address in the QR and in mDNS
   * must always be one this PC really has. Codes are dropped (see unlisten) and the 'network' event tells the panel.
   */
  private async watch(): Promise<void> {
    if (!this.wanted || this.rebinding) return
    const ip = this.d.lanIp()
    if (ip === this.ip) return
    this.rebinding = true
    try {
      const had = this.running
      this.d.log?.info('connect: network changed', `${this.ip ?? 'none'} -> ${ip ?? 'none'}`)
      this.unlisten('The network changed. Reconnecting.')
      if (ip && this.wanted) await this.listen(ip)
      this.emit('network', { from: had, ip })
      this.emit('change')
    } finally {
      this.rebinding = false
    }
  }

  /**
   * "Check this setup": opens a real WebSocket to this host's own LAN address and times it. That proves the server, the
   * address, the Host / Origin rules and the protocol handshake. It cannot prove the firewall lets OTHER computers in
   * (a connection from this PC to itself is not filtered), so the message says so.
   */
  selfTest(): Promise<SelfTest> {
    const ip = this.ip
    const port = this.port
    const mdns = !!this.d.advertiser
    const fail = (message: string): SelfTest => ({ ok: false, message, ms: null, ip, port, mdns })
    if (!this.running || !ip) return Promise.resolve(fail('Connect is not listening. Turn it on first, and make sure this PC is on Wi-Fi or Ethernet.'))
    return new Promise((resolve) => {
      const t0 = Date.now()
      let done = false
      const end = (r: SelfTest): void => {
        if (done) return
        done = true
        clearTimeout(timer)
        req.destroy()
        resolve(r)
      }
      const req = httpRequest({ host: ip, port, path: '/ws', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIGxvZ2luIGNoZWNrIQ==', Origin: `http://${ip}:${port}` } })
      const timer = setTimeout(() => end(fail("No answer from this PC's own network address within 4 seconds.")), 4000)
      req.on('upgrade', (res, socket) => {
        socket.destroy()
        end({ ok: res.statusCode === 101, message: "Lyra answers on this PC's network address. If a phone still cannot open the link, Windows Firewall is blocking other devices: see the help below.", ms: Date.now() - t0, ip, port, mdns })
      })
      req.on('response', (res) => end(fail(`The host answered with status ${res.statusCode ?? '?'} instead of accepting the connection.`)))
      req.on('error', (e) => end(fail(`Could not reach ${ip}:${port}: ${e.message}`)))
      req.end()
    })
  }

  // ---- host-side API -------------------------------------------------------------------------------------------

  newCode(role: Role): { code: string; display: string; expiresAt: number; url: string | null } {
    const c = this.d.pairing.createCode({ role })
    this.emit('change')
    return { code: c.code, display: formatCode(c.code), expiresAt: c.expiresAt, url: this.pairUrl(c.code) }
  }

  /** QR / link: the code rides in the URL FRAGMENT, which a browser never sends to any server or puts in a Referer. */
  pairUrl(code: string): string | null {
    const u = this.status().url
    return u ? `${u}#p=${code}` : null
  }

  /**
   * An overlay link for an OBS browser source (which cannot do QR pairing): a view-only device the host creates directly.
   * The credential rides in the URL FRAGMENT (`#d=<id>&t=<token>`): a browser never sends it to any server or puts it in a
   * Referer, and the page proves the token with the normal HMAC handshake, so it never crosses the network. OBS keeps the
   * URL, so unlike a one-time pairing code the link keeps working; revoking the device is what kills it.
   */
  createOverlay(name?: string): { id: string; url: string | null } | null {
    const d = this.d.pairing.addOverlay(name)
    if (!d) return null
    this.emit('change')
    return { id: d.id, url: this.overlayUrl(d.id) }
  }

  /** The link for an existing overlay device (host side only; never sent to another device). */
  overlayUrl(id: string): string | null {
    const d = this.d.pairing.get(id)
    const u = this.status().url
    return d && d.role === 'overlay' && u ? `${u}overlay#d=${d.id}&t=${d.token}` : null
  }

  startParty(): { code: string; display: string; expiresAt: number; url: string | null } {
    this.party = true
    const c = this.d.pairing.createCode({ party: true })
    this.emit('change')
    return { code: c.code, display: formatCode(c.code), expiresAt: c.expiresAt, url: this.pairUrl(c.code) }
  }

  endParty(): void {
    this.party = false
    for (const id of this.d.pairing.endParty()) this.kick(id, 'The party is over.')
    this.emit('change')
  }

  revoke(id: string): void {
    this.d.pairing.revoke(id)
    this.kick(id, 'This device was removed.')
    this.emit('change')
  }

  setRole(id: string, role: Role): void {
    // refused (false) for an overlay link, or when asking for the overlay role: nothing changes, nobody is kicked
    if (!this.d.pairing.setRole(id, role)) return
    // a role is fixed for a session: reconnect so the device re-learns it (and a downgrade can't linger)
    this.kick(id, 'Role changed. Reconnecting.')
    this.emit('change')
  }

  rename(id: string, name: string): void {
    this.d.pairing.rename(id, name)
    this.emit('change')
    this.broadcastDevices()
  }

  /** Forget every paired device (and live code) and disconnect them all. */
  revokeAll(): number {
    const ids = this.d.pairing.revokeAll()
    for (const id of ids) this.kick(id, 'This device was removed.')
    this.emit('change')
    return ids.length
  }

  /** Connected (authenticated) sessions right now: devices people are using, overlay links included. */
  onlineCount(): number {
    return [...this.sessions].filter((s) => s.stage === 'ready').length
  }

  /** Devices for the UI. */
  devices(): Array<DeviceSummary & { guest: boolean; lastSeen: number }> {
    const online = new Set([...this.sessions].filter((s) => s.stage === 'ready' && s.device).map((s) => s.device!.id))
    return this.d.pairing.list().map((x) => ({ id: x.id, name: x.name, role: x.role, online: online.has(x.id), guest: x.guest, lastSeen: x.lastSeen }))
  }

  /** What other apps see: the live codes for the UI to show. */
  codes(): Array<{ code: string; display: string; expiresAt: number; party: boolean; url: string | null }> {
    return this.d.pairing.activeCodes().map((c) => ({ code: c.code, display: formatCode(c.code), expiresAt: c.expiresAt, party: c.party, url: this.pairUrl(c.code) }))
  }

  // ---- publishing what is playing ------------------------------------------------------------------------------

  setNow(now: NowInfo | null, choices?: ChoicesInfo): void {
    this.send(this.state.setNow(now, choices))
  }
  setPlay(p: PlayInfo): void {
    this.send(this.state.setPlay(p, this.now()))
  }
  setView(v: ViewInfo): void {
    this.send(this.state.setView(v))
  }
  setLyrics(id: string, status: string, synced: boolean, lines: LyricLine[]): void {
    this.send(this.state.setLyrics({ id, status, synced, lines }))
  }
  setArt(id: string, src: string | null): void {
    this.send(this.state.setArt(id, src))
  }

  private send(m: HostMsg | null): void {
    if (m && this.sessions.size) this.broadcast(m)
  }

  private broadcast(m: HostMsg): void {
    const text = encode(m)
    for (const s of this.sessions) {
      if (s.stage !== 'ready') continue
      const out = this.textFor(s, m, text)
      if (out === null) continue
      if (s.conn.bufferedAmount > 2_000_000) this.drop(s, 'Too slow to keep up.')
      else s.conn.send(out)
    }
  }

  /** The wire text of `m` for this session: as-is for viewers and controllers, redacted (or withheld) for an overlay. */
  private textFor(s: Session, m: HostMsg, text: string): string | null {
    const role = s.device?.role
    if (role !== 'overlay') return text
    const r = messageForRole('overlay', m)
    return r ? encode(r) : null
  }

  private broadcastDevices(): void {
    // overlay links are a host-side concern; other apps are not told they exist
    const devs = this.devices().filter((x) => x.role !== 'overlay').map(({ id, name, role, online }) => ({ id, name, role, online }))
    const text = encode({ t: 'devices', devices: devs })
    for (const s of this.sessions) if (s.stage === 'ready' && s.device?.role === 'controller') s.conn.send(text)
  }

  // ---- sockets -------------------------------------------------------------------------------------------------

  private http(req: IncomingMessage, res: import('node:http').ServerResponse): void {
    if (!req.socket.remoteAddress || !isLocalPeer(req.socket.remoteAddress)) {
      res.writeHead(403).end()
      return
    }
    // DNS rebinding: a page on an attacker's hostname that re-resolves to this IP still sends ITS hostname as Host
    if (!hostAllowed(req.headers.host, this.ip, this.port)) {
      res.writeHead(421, { 'Cache-Control': 'no-store' }).end()
      return
    }
    const path = (req.url ?? '/').split('?')[0]
    const common = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' }
    if (req.method === 'GET' && path === '/') {
      res.writeHead(200, {
        ...common,
        'Content-Type': 'text/html; charset=utf-8',
        // the page may talk only to this host; art is inline or https; the optional video is a YouTube embed;
        // the manifest and icon (installable app) come from this host only
        'Content-Security-Policy': `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: https:; connect-src ${this.connectSrc(req.headers.host)}; manifest-src 'self'; frame-src https://www.youtube-nocookie.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
      })
      res.end(this.d.viewerHtml)
      return
    }
    if (req.method === 'GET' && path === '/overlay' && this.d.overlayHtml) {
      res.writeHead(200, {
        ...common,
        'Content-Type': 'text/html; charset=utf-8',
        // its own, tighter policy: this page only draws text and art. Same-origin socket only (no 'ws:' wildcard), no frames,
        // no manifest, no fonts or media; art arrives as an https: URL or an inline data: image over the socket
        'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: https:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
      })
      res.end(this.d.overlayHtml)
      return
    }
    if (req.method === 'GET' && path === '/manifest.webmanifest') {
      const icon = this.d.icon?.()
      res.writeHead(200, { ...common, 'Content-Type': 'application/manifest+json' })
      res.end(JSON.stringify(buildManifest({ iconSize: icon?.size ?? 0 })))
      return
    }
    if (req.method === 'GET' && path === '/icon.png') {
      const icon = this.d.icon?.()
      if (icon) {
        res.writeHead(200, { ...common, 'Cache-Control': 'max-age=86400', 'Content-Type': 'image/png' })
        res.end(icon.png)
        return
      }
    }
    res.writeHead(404, { 'Cache-Control': 'no-store' }).end()
  }

  /**
   * connect-src for the viewer: this server only. 'self' alone is enough in current browsers; Safari and older WebViews
   * do not let 'self' cover ws://, so the exact ws origin (host:port, already validated against the allow-list) is named.
   * Never the 'ws:' wildcard.
   */
  private connectSrc(hostHeader: string | undefined): string {
    return hostHeader && hostAllowed(hostHeader, this.ip, this.port) ? `'self' ws://${hostHeader.toLowerCase()}` : "'self'"
  }

  private upgrade(req: IncomingMessage, socket: Duplex): void {
    const addr = (socket as { remoteAddress?: string }).remoteAddress ?? ''
    if (!isLocalPeer(addr) || (req.url ?? '').split('?')[0] !== '/ws' || !hostAllowed(req.headers.host, this.ip, this.port) || !originAllowed(req.headers.origin, req.headers.host)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }
    const peer = peerOf(addr)
    let mine = 0
    for (const o of this.sessions) if (o.peer === peer) mine++
    // one address cannot fill the table: a stranger on the Wi-Fi must not be able to lock the real devices out
    if (this.sessions.size >= 40 || mine >= MAX_SOCKETS_PER_PEER) {
      socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n')
      return
    }
    const conn = acceptUpgrade(req, socket, MAX_CLIENT_BYTES)
    if (!conn) return
    const t = this.now()
    const s: Session = { conn, stage: 'new', lastHeard: t, peer, messages: 0, pingTokens: 20, pingAt: t, cmdTokens: 10, cmdAt: t }
    this.sessions.add(s)
    // a connection that does not finish pairing / auth quickly is dropped
    const timer = setTimeout(() => s.stage !== 'ready' && this.drop(s), 10_000)
    conn.on('message', (text) => this.onMessage(s, text))
    conn.on('close', () => {
      clearTimeout(timer)
      this.drop(s) // a no-op when the host already dropped it; otherwise the peer left: update the devices list
    })
  }

  private fail(s: Session, code: ErrorCode, msg: string, close = true): void {
    s.conn.send(encode({ t: 'err', code, msg }))
    if (close) this.drop(s)
  }

  /**
   * The ONE place a session leaves the set (the socket's 'close' event finds it already gone and does nothing), so the
   * devices list / online flag is refreshed for every cause: kick, revoke, dead-peer sweep, replacement, timeout, peer close.
   * `quiet` is for a replaced session whose successor is about to announce itself anyway.
   */
  private drop(s: Session, why?: string, quiet = false): void {
    const had = this.sessions.delete(s)
    if (why) s.conn.send(encode({ t: 'bye', why }))
    s.conn.close()
    if (had && this.sessions.size === 0) this.idleSince = this.now()
    if (had && s.device && s.stage === 'ready' && !quiet) {
      this.emit('change')
      this.broadcastDevices()
    }
  }

  private kick(deviceId: string, why: string): void {
    for (const s of [...this.sessions]) if (s.device?.id === deviceId) this.drop(s, why)
  }

  private sweep(): void {
    const t = this.now()
    for (const s of [...this.sessions]) if (t - s.lastHeard > DEAD_AFTER_MS) this.drop(s)
    // expired party guests / codes
    this.d.pairing.list()
    for (const s of [...this.sessions]) if (s.device && !this.d.pairing.get(s.device.id)) this.drop(s, 'This device was removed.')
    // auto-stop: nobody connected for the chosen time. Overlay sources count as connected (OBS keeps its socket open).
    const idleMs = this.d.idleStopMs?.() ?? 0
    if (idleMs > 0) {
      if (this.onlineCount() > 0) this.idleSince = t
      else if (t - this.idleSince >= idleMs) {
        this.d.log?.info('connect: idle, turning off')
        this.stop()
        this.emit('idle-stop')
      }
    }
  }

  private onMessage(s: Session, text: string): void {
    const t = this.now()
    s.lastHeard = t
    if (s.stage !== 'ready' && ++s.messages > 30) return this.drop(s)
    const p = parseClient(text)
    if (!p.ok) return this.fail(s, p.code, p.why, p.code === 'version')
    const m = p.msg
    if (m.t === 'ping') {
      // 10 per second sustained (the client's own burst at start is about 6 in one second), so a device cannot make the host spin
      s.pingTokens = Math.min(20, s.pingTokens + ((t - s.pingAt) / 1000) * 10)
      s.pingAt = t
      if (s.pingTokens < 1) return
      s.pingTokens -= 1
      // answered in every stage so a client can measure the clock while it is still pairing
      s.conn.send(encode({ t: 'pong', id: m.id, c0: m.c0, s1: t, s2: this.now() }))
      return
    }
    if (m.t === 'bye') return this.drop(s)

    if (s.stage === 'new') {
      if (m.t === 'pair') {
        const r = this.d.pairing.redeem(m.code, m.name, s.peer)
        if (!r.ok) return this.fail(s, r.code, r.msg)
        const sn = this.d.randomHex(16)
        s.conn.send(encode({ t: 'paired', deviceId: r.device.id, token: r.device.token, role: r.device.role, sn }))
        this.ready(s, r.device, Pairing.sessionKey(r.device.token, m.cn, sn))
      } else if (m.t === 'hello') {
        s.cn = m.cn
        s.sn = this.d.randomHex(16)
        s.helloDeviceId = m.deviceId
        s.stage = 'challenged'
        s.conn.send(encode({ t: 'challenge', sn: s.sn }))
      } else this.fail(s, 'forbidden', 'Pair first.')
      return
    }
    if (s.stage === 'challenged') {
      if (m.t !== 'auth' || !s.cn || !s.sn || !s.helloDeviceId) return this.fail(s, 'bad-message', 'Expected auth.')
      const dev = this.d.pairing.verifyProof(s.helloDeviceId, s.cn, s.sn, m.proof)
      // one answer for "no such device" and "wrong proof": no way to probe which devices exist
      if (!dev) return this.fail(s, 'bad-proof', 'Not recognised. Pair this device again.')
      this.ready(s, dev, Pairing.sessionKey(dev.token, s.cn, s.sn))
      return
    }
    // ready
    if (m.t === 'cmd') return this.onCommand(s, m)
    this.fail(s, 'bad-message', 'Unexpected message.', false)
  }

  private ready(s: Session, device: Device, sessionKey: string): void {
    // one live session per device: a re-connect replaces the old socket
    for (const o of [...this.sessions]) if (o !== s && o.device?.id === device.id) this.drop(o, 'Connected from somewhere else.', true)
    s.stage = 'ready'
    s.device = device
    s.gate = new CommandGate(sessionKey)
    this.d.pairing.touch(device.id)
    const send = (m: HostMsg): void => {
      const r = messageForRole(device.role, m)
      if (r) s.conn.send(encode(r))
    }
    send({ t: 'ready', role: device.role, name: this.d.hostName(), host: this.now(), vibes: this.d.vibes, party: this.party })
    for (const m of this.state.snapshot()) send(m)
    send({ t: 'devices', devices: this.devices().filter((x) => x.role !== 'overlay').map(({ id, name, role, online }) => ({ id, name, role, online })) })
    this.emit('change')
    this.broadcastDevices()
  }

  private onCommand(s: Session, m: { n: number; b: string; mac: string }): void {
    const dev = s.device
    if (!dev || !s.gate) return
    const t = this.now()
    // token bucket: 10 commands burst, 5 per second sustained
    s.cmdTokens = Math.min(10, s.cmdTokens + ((t - s.cmdAt) / 1000) * 5)
    s.cmdAt = t
    if (s.cmdTokens < 1) return this.fail(s, 'rate', 'Slow down.', false)
    s.cmdTokens -= 1
    const verdict = s.gate.check(m.n, m.b, m.mac)
    if (verdict !== 'ok') return this.fail(s, verdict, verdict === 'replay' ? 'Old command.' : 'Bad signature.', false)
    // the role is read from the registry each time: a downgrade takes effect on the next command
    const current = this.d.pairing.get(dev.id)
    if (!current || current.role !== 'controller') return this.fail(s, 'forbidden', 'This device can only watch.', false)
    const cmd = parseCommand(m.b)
    if (!cmd) return this.fail(s, 'bad-message', 'Unknown command.', false)
    this.d.onCommand(cmd, current)
  }
}
