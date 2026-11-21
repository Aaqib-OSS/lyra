import { randomBytes } from 'node:crypto'
import { request } from 'node:http'
import { createConnection, type Socket } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { Pairing, signCommand } from '@core/connect/pairing'
import { parseHost, type CommandBody, type HostMsg } from '@core/connect/protocol'
import { hmacSha256Hex } from '@core/connect/hmac'
import { ConnectHub } from './hub'
import { FrameParser, acceptKey, encodeFrame } from './ws'
import { buildResponse, asksForUs, parseQuestions } from './mdns'
import { isLocalPeer, isPrivateIPv4, originAllowed, pickLanAddress } from './net'

// ---- framing -----------------------------------------------------------------------------------------------------

function maskedFrame(opcode: number, text: string, fin = true): Buffer {
  const payload = Buffer.from(text)
  const mask = randomBytes(4)
  const body = Buffer.from(Uint8Array.from(payload, (b, i) => b ^ mask[i & 3]!))
  const n = payload.length
  const head = n < 126 ? Buffer.from([(fin ? 0x80 : 0) | opcode, 0x80 | n]) : Buffer.from([(fin ? 0x80 : 0) | opcode, 0x80 | 126, n >> 8, n & 255])
  return Buffer.concat([head, mask, body])
}

describe('websocket framing', () => {
  it('computes the RFC 6455 accept key', () => {
    expect(acceptKey('dGhlIHNhbXBsZSBub25jZQ==')).toBe('s3pPLMBiTxaQ9kYGzzhZRbK+xOo=')
  })
  it('parses split, fragmented and large frames', () => {
    const p = new FrameParser(100_000)
    const f = maskedFrame(1, 'hello')
    expect(p.push(f.subarray(0, 3))).toEqual([])
    expect(p.push(f.subarray(3))[0]!.payload.toString()).toBe('hello')
    const out = [...p.push(maskedFrame(1, 'he', false)), ...p.push(maskedFrame(0, 'llo'))]
    expect(out[0]!.payload.toString()).toBe('hello')
    expect(p.push(maskedFrame(1, 'x'.repeat(5000)))[0]!.payload.length).toBe(5000)
  })
  it('rejects unmasked, oversize, binary and reserved-bit frames', () => {
    expect(() => new FrameParser(100).push(Buffer.from([0x81, 0x01, 0x41]))).toThrow()
    expect(() => new FrameParser(10).push(maskedFrame(1, 'x'.repeat(50)))).toThrow()
    expect(() => new FrameParser(100).push(Buffer.from([0x82, 0x81, 0, 0, 0, 0, 1]))).toThrow()
    expect(() => new FrameParser(100).push(Buffer.from([0xc1, 0x80, 0, 0, 0, 0]))).toThrow()
  })
  it('encodes server frames unmasked with the right length form', () => {
    expect(encodeFrame(1, Buffer.from('hi')).subarray(0, 2)).toEqual(Buffer.from([0x81, 2]))
    expect(encodeFrame(1, Buffer.alloc(300)).subarray(0, 4)).toEqual(Buffer.from([0x81, 126, 1, 44]))
  })
})

describe('mdns packets', () => {
  const svc = { instance: 'Lyra on PC', host: 'lyra-ab12', ip: '192.168.1.5', port: 47813, txt: { v: '1' } }
  it('builds a response with PTR, SRV, TXT and A records', () => {
    const b = buildResponse(svc)
    expect(b.readUInt16BE(2)).toBe(0x8400)
    expect(b.readUInt16BE(6)).toBe(4)
    expect(b.includes(Buffer.from('_lyra-connect'))).toBe(true)
    expect(b.includes(Buffer.from([192, 168, 1, 5]))).toBe(true)
    expect(buildResponse(svc, 0).readUInt32BE(b.indexOf(Buffer.from([0, 0x0c, 0, 1])) + 4)).toBe(0) // goodbye ttl
  })
  it('recognises a query for the service and ignores others and garbage', () => {
    const q = Buffer.concat([Buffer.alloc(4), Buffer.from([0, 1, 0, 0, 0, 0, 0, 0]), Buffer.from([13]), Buffer.from('_lyra-connect'), Buffer.from([4]), Buffer.from('_tcp'), Buffer.from([5]), Buffer.from('local'), Buffer.from([0, 0, 12, 0, 1])])
    expect(asksForUs(parseQuestions(q), svc)).toBe(true)
    expect(asksForUs(parseQuestions(Buffer.from('garbage')), svc)).toBe(false)
    expect(parseQuestions(buildResponse(svc))).toEqual([]) // responses are not queries
  })
})

describe('network rules', () => {
  it('knows private ranges', () => {
    expect(['10.1.2.3', '172.16.0.1', '172.31.9.9', '192.168.0.9'].every(isPrivateIPv4)).toBe(true)
    expect(['8.8.8.8', '172.32.0.1', '100.64.0.1', 'abc'].some(isPrivateIPv4)).toBe(false)
    expect(isLocalPeer('::ffff:192.168.1.7')).toBe(true)
    expect(isLocalPeer('203.0.113.9')).toBe(false)
  })
  it('picks the real Wi-Fi card, not a virtual one, and nothing when offline', () => {
    const nic = (address: string, internal = false) => [{ address, family: 'IPv4', internal, netmask: '', mac: '', cidr: null }] as never
    expect(pickLanAddress({ 'vEthernet (WSL)': nic('172.20.0.1'), 'Wi-Fi': nic('192.168.1.20'), Loopback: nic('127.0.0.1', true) })?.ip).toBe('192.168.1.20')
    expect(pickLanAddress({ Ethernet: nic('8.8.4.4') })).toBeNull()
  })
  it('allows only same-origin web pages', () => {
    expect(originAllowed(undefined, 'x')).toBe(true)
    expect(originAllowed('http://192.168.1.5:47813', '192.168.1.5:47813')).toBe(true)
    expect(originAllowed('http://evil.example', '192.168.1.5:47813')).toBe(false)
  })
})

// ---- the hub, over a real loopback socket ------------------------------------------------------------------------

class TestClient {
  msgs: HostMsg[] = []
  closed = false
  private parts = Buffer.alloc(0)
  private shook = false
  private sock!: Socket
  private waiters: Array<() => void> = []

  static async open(port: number, origin?: string): Promise<TestClient> {
    const c = new TestClient()
    await new Promise<void>((resolve, reject) => {
      c.sock = createConnection(port, '127.0.0.1', () => {
        c.sock.write(`GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n${origin ? `Origin: ${origin}\r\n` : ''}\r\n`)
      })
      c.sock.on('error', reject)
      c.sock.on('close', () => {
        c.closed = true
        c.wake()
        resolve()
      })
      c.sock.on('data', (d) => {
        c.parts = Buffer.concat([c.parts, Buffer.from(d)])
        if (!c.shook) {
          const i = c.parts.indexOf('\r\n\r\n')
          if (i < 0) return
          if (!c.parts.subarray(0, i).toString().startsWith('HTTP/1.1 101')) return
          c.shook = true
          c.parts = c.parts.subarray(i + 4)
          resolve()
        }
        c.drain()
      })
    })
    return c
  }

  private drain(): void {
    for (;;) {
      if (this.parts.length < 2) return
      let len = this.parts[1]! & 0x7f
      let off = 2
      if (len === 126) {
        if (this.parts.length < 4) return
        len = this.parts.readUInt16BE(2)
        off = 4
      }
      if (this.parts.length < off + len) return
      const op = this.parts[0]! & 15
      const body = this.parts.subarray(off, off + len).toString()
      this.parts = this.parts.subarray(off + len)
      if (op === 1) {
        const p = parseHost(body)
        if (p.ok) this.msgs.push(p.msg)
      }
      this.wake()
    }
  }
  private wake(): void {
    for (const w of this.waiters.splice(0)) w()
  }
  send(o: object): void {
    this.sock.write(maskedFrame(1, JSON.stringify({ v: 1, ...o })))
  }
  async until<T extends HostMsg['t']>(t: T, ms = 2000): Promise<Extract<HostMsg, { t: T }>> {
    const end = Date.now() + ms
    for (;;) {
      const m = this.msgs.find((x) => x.t === t)
      if (m) {
        this.msgs.splice(this.msgs.indexOf(m), 1)
        return m as Extract<HostMsg, { t: T }>
      }
      if (this.closed || Date.now() > end) throw new Error(`no ${t}; got ${this.msgs.map((x) => x.t).join(',')}; closed=${this.closed}`)
      await new Promise<void>((r) => {
        this.waiters.push(r)
        setTimeout(r, 50)
      })
    }
  }
  async waitClosed(ms = 2000): Promise<void> {
    const end = Date.now() + ms
    while (!this.closed && Date.now() < end) await new Promise((r) => setTimeout(r, 20))
  }
  close(): void {
    this.sock.destroy()
  }
}

function makeHub(opts: { lanIp?: string | null } = {}) {
  const commands: CommandBody[] = []
  const pairing = new Pairing({ now: Date.now, randomHex: (n) => randomBytes(n).toString('hex'), randomBytes: (n) => new Uint8Array(randomBytes(n)) })
  const hub = new ConnectHub({
    pairing,
    viewerHtml: '<html>viewer</html>',
    lanIp: () => (opts.lanIp === undefined ? '127.0.0.1' : opts.lanIp),
    port: 0,
    hostName: () => 'TestPC',
    vibes: ['none', 'neon'],
    onCommand: (c) => commands.push(c),
    randomHex: (n) => randomBytes(n).toString('hex')
  })
  return { hub, commands, pairing }
}

const live: Array<{ stop(): void } | TestClient> = []
afterEach(() => {
  for (const x of live.splice(0)) 'stop' in x ? x.stop() : x.close()
})

async function pair(hub: ConnectHub, role: 'viewer' | 'controller') {
  const port = hub.status().port
  const c = await TestClient.open(port)
  live.push(c)
  const code = hub.newCode(role).code
  const cn = randomBytes(16).toString('hex')
  c.send({ t: 'pair', code, name: 'Test phone', cn })
  const paired = await c.until('paired')
  const key = Pairing.sessionKey(paired.token, cn, paired.sn)
  await c.until('ready')
  return { c, paired, key }
}

describe('connect hub', () => {
  it('does not start without a LAN address and binds only to it when it does', async () => {
    const off = makeHub({ lanIp: null })
    expect(await off.hub.start()).toBe(false)
    expect(off.hub.running).toBe(false)
    const { hub } = makeHub()
    live.push(hub)
    expect(await hub.start()).toBe(true)
    expect(hub.status().url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/)
  })

  it('serves the viewer page with strict headers and nothing else', async () => {
    const { hub } = makeHub()
    live.push(hub)
    await hub.start()
    const get = (path: string) =>
      new Promise<{ status: number; body: string; csp?: string }>((resolve) => {
        request({ host: '127.0.0.1', port: hub.status().port, path }, (res) => {
          let body = ''
          res.on('data', (d) => (body += d))
          res.on('end', () => resolve({ status: res.statusCode!, body, csp: res.headers['content-security-policy'] as string | undefined }))
        }).end()
      })
    const home = await get('/')
    expect(home.status).toBe(200)
    expect(home.csp).toContain("default-src 'none'")
    expect((await get('/events')).status).toBe(404)
    expect((await get('/lyrics?k=1')).status).toBe(404)
  })

  it('pairs with a one-time code, replays state, and reconnects by proof without sending the token', async () => {
    const { hub } = makeHub()
    live.push(hub)
    await hub.start()
    hub.setNow({ id: 's1', key: 'k', title: 'Song', artists: ['Artist'], durationMs: 100_000 })
    hub.setPlay({ playing: true, positionMs: 1000, at: Date.now() })
    hub.setView({ vibe: 'neon', video: { id: 'abcdefghijk' } })
    const { c, paired } = await pair(hub, 'viewer')
    expect((await c.until('now')).now?.title).toBe('Song')
    expect((await c.until('view')).view.video.id).toBe('abcdefghijk')
    expect((await c.until('play')).play.playing).toBe(true)
    c.close()

    // reconnect: hello -> challenge -> auth(proof); the token never crosses the wire again
    const c2 = await TestClient.open(hub.status().port)
    live.push(c2)
    const cn = randomBytes(16).toString('hex')
    c2.send({ t: 'hello', deviceId: paired.deviceId, name: 'x', cn })
    const { sn } = await c2.until('challenge')
    c2.send({ t: 'auth', proof: Pairing.proof(paired.token, cn, sn) })
    expect((await c2.until('ready')).role).toBe('viewer')
  })

  it('refuses a bad code, a bad proof, and anything before pairing', async () => {
    const { hub } = makeHub()
    live.push(hub)
    await hub.start()
    const a = await TestClient.open(hub.status().port)
    live.push(a)
    a.send({ t: 'pair', code: 'ZZZZZZZZ', name: 'n', cn: 'a'.repeat(32) })
    expect((await a.until('err')).code).toBe('bad-code')
    await a.waitClosed()

    const b = await TestClient.open(hub.status().port)
    live.push(b)
    b.send({ t: 'hello', deviceId: 'ghost', name: 'n', cn: 'a'.repeat(32) })
    const { sn } = await b.until('challenge')
    b.send({ t: 'auth', proof: hmacSha256Hex('guess', 'lyra1|auth|' + 'a'.repeat(32) + '|' + sn) })
    expect((await b.until('err')).code).toBe('bad-proof')

    const c = await TestClient.open(hub.status().port)
    live.push(c)
    c.send({ t: 'cmd', n: 1, b: '{"c":"play"}', mac: 'a'.repeat(64) })
    expect((await c.until('err')).code).toBe('forbidden')
  })

  it('rejects a web page from another origin', async () => {
    const { hub } = makeHub()
    live.push(hub)
    await hub.start()
    const c = await TestClient.open(hub.status().port, 'http://evil.example')
    live.push(c)
    await c.waitClosed()
    expect(c.closed).toBe(true)
  })

  it('lets a controller command, but never a viewer, and checks signatures and replays', async () => {
    const { hub, commands } = makeHub()
    live.push(hub)
    await hub.start()
    const ctl = await pair(hub, 'controller')
    const send = (key: string, n: number, body: object) => {
      const b = JSON.stringify(body)
      ctl.c.send({ t: 'cmd', n, b, mac: signCommand(key, n, b) })
    }
    send(ctl.key, 1, { c: 'next' })
    send(ctl.key, 2, { c: 'seek', ms: 5000 })
    await new Promise((r) => setTimeout(r, 150))
    expect(commands).toEqual([{ c: 'next' }, { c: 'seek', ms: 5000 }])
    send(ctl.key, 2, { c: 'play' }) // replay
    send('wrong-key', 3, { c: 'pause' })
    send(ctl.key, 4, { c: 'selfdestruct' })
    await new Promise((r) => setTimeout(r, 150))
    expect(commands).toHaveLength(2)

    const view = await pair(hub, 'viewer')
    const b = '{"c":"pause"}'
    view.c.send({ t: 'cmd', n: 1, b, mac: signCommand(view.key, 1, b) })
    expect((await view.c.until('err')).code).toBe('forbidden')
    expect(commands).toHaveLength(2)
  })

  it('removes a device at once: socket dropped, and it cannot come back', async () => {
    const { hub } = makeHub()
    live.push(hub)
    await hub.start()
    const { c, paired } = await pair(hub, 'viewer')
    hub.revoke(paired.deviceId)
    await c.waitClosed()
    expect(c.closed).toBe(true)
    const again = await TestClient.open(hub.status().port)
    live.push(again)
    const cn = randomBytes(16).toString('hex')
    again.send({ t: 'hello', deviceId: paired.deviceId, name: 'x', cn })
    const { sn } = await again.until('challenge')
    again.send({ t: 'auth', proof: Pairing.proof(paired.token, cn, sn) })
    expect((await again.until('err')).code).toBe('bad-proof')
  })

  it('answers pings with timestamps for clock-offset estimation', async () => {
    const { hub } = makeHub()
    live.push(hub)
    await hub.start()
    const c = await TestClient.open(hub.status().port)
    live.push(c)
    const c0 = Date.now()
    c.send({ t: 'ping', id: 7, c0 })
    const pong = await c.until('pong')
    expect(pong.id).toBe(7)
    expect(pong.c0).toBe(c0)
    expect(pong.s2).toBeGreaterThanOrEqual(pong.s1)
  })

  it('broadcasts live changes to paired devices', async () => {
    const { hub } = makeHub()
    live.push(hub)
    await hub.start()
    const { c } = await pair(hub, 'viewer')
    await c.until('now') // the snapshot sent on joining
    hub.setNow({ id: 's9', key: 'k', title: 'Live', artists: ['A'], durationMs: 1000 })
    expect((await c.until('now')).now?.id).toBe('s9')
    hub.setLyrics('s9', 'synced', true, [{ t: 0, x: 'la' }])
    expect((await c.until('lyrics')).lines[0]!.x).toBe('la')
  })

  it('party mode: guests join with the shared code as viewers, and are dropped when it ends', async () => {
    const { hub } = makeHub()
    live.push(hub)
    await hub.start()
    const party = hub.startParty()
    const g = await TestClient.open(hub.status().port)
    live.push(g)
    g.send({ t: 'pair', code: party.code, name: 'Guest', cn: randomBytes(16).toString('hex') })
    expect((await g.until('paired')).role).toBe('viewer')
    expect((await g.until('ready')).party).toBe(true)
    hub.endParty()
    await g.waitClosed()
    expect(g.closed).toBe(true)
    expect(hub.devices()).toHaveLength(0)
  })
})
