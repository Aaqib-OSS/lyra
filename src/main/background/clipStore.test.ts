import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ClipStore } from './clipStore'

const SIZE = 600_000
const data = Buffer.alloc(SIZE)
for (let i = 0; i < SIZE; i++) data[i] = (i * 31 + (i >> 8)) & 255

interface Behaviour {
  /** bytes per chunk and the pause between chunks (a slow CDN) */
  chunk: number
  pauseMs: number
  /** the first response is cut after this many bytes (a dropped connection) */
  dropAfter?: number
  /** answer 429 this many times before serving */
  busy?: number
  /** ignore Range requests (always answer 200 with everything) */
  ignoreRange?: boolean
  status?: number
}

let server: Server
let base = ''
let beh: Behaviour
let hits: Array<{ range: string | null }> = []
let dir = ''

function handler(req: IncomingMessage, res: ServerResponse): void {
  hits.push({ range: (req.headers.range as string | undefined) ?? null })
  if (beh.status) {
    res.writeHead(beh.status)
    res.end()
    return
  }
  if (beh.busy && beh.busy > 0) {
    beh.busy--
    res.writeHead(429, { 'retry-after': '1' })
    res.end()
    return
  }
  const m = !beh.ignoreRange && req.headers.range ? /^bytes=(\d+)-(\d*)$/.exec(req.headers.range as string) : null
  const start = m ? Number(m[1]) : 0
  const end = m && m[2] ? Number(m[2]) : SIZE - 1
  res.writeHead(m ? 206 : 200, {
    'content-type': 'video/x-m4v',
    'accept-ranges': 'bytes',
    'content-length': String(end - start + 1),
    ...(m ? { 'content-range': `bytes ${start}-${end}/${SIZE}` } : {})
  })
  const dropAt = hits.length === 1 && beh.dropAfter ? start + beh.dropAfter : Infinity
  let pos = start
  const tick = (): void => {
    if (pos > end) {
      res.end()
      return
    }
    if (pos >= dropAt) {
      res.destroy()
      return
    }
    const n = Math.min(beh.chunk, end + 1 - pos, dropAt - pos)
    res.write(data.subarray(pos, pos + n))
    pos += n
    setTimeout(tick, beh.pauseMs)
  }
  tick()
}

beforeEach(async () => {
  hits = []
  beh = { chunk: 50_000, pauseMs: 0 }
  dir = mkdtempSync(join(tmpdir(), 'lyra-clip-'))
  server = createServer(handler)
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => {
  server.closeAllConnections()
  await new Promise<void>((r) => server.close(() => r()))
  rmSync(dir, { recursive: true, force: true })
})

const mk = (o: Partial<ConstructorParameters<typeof ClipStore>[0]> = {}): ClipStore => new ClipStore({ dir, fetch: (u, i) => fetch(u, i), attempts: 4, stallMs: 2000, readStallMs: 4000, backoffMs: 20, ...o })
const readAll = async (res: Response): Promise<Buffer> => Buffer.from(await res.arrayBuffer())
const waitUntil = async (f: () => boolean, ms = 8000): Promise<void> => {
  const t0 = Date.now()
  while (!f()) {
    if (Date.now() - t0 > ms) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 15))
  }
}

describe('ClipStore', () => {
  it('serves the whole clip and then keeps it on disk', async () => {
    const s = mk()
    const res = await s.serve(`${base}/a.m4v`, 'bytes=0-')
    expect(res?.status).toBe(206)
    expect(res?.headers.get('content-range')).toBe(`bytes 0-${SIZE - 1}/${SIZE}`)
    expect((await readAll(res!)).equals(data)).toBe(true)
    await waitUntil(() => !!s.localFile(`${base}/a.m4v`))
    expect(readFileSync(s.localFile(`${base}/a.m4v`)!).equals(data)).toBe(true)
    expect(readdirPart(dir)).toBe('')
  })

  it('starts playing before the download is finished', async () => {
    beh = { chunk: 20_000, pauseMs: 25 } // about 0.75 s for the whole clip
    const s = mk()
    const t0 = Date.now()
    const res = await s.serve(`${base}/slow.m4v`, 'bytes=0-')
    const reader = res!.body!.getReader()
    const first = await reader.read()
    const tFirst = Date.now() - t0
    expect(first.value!.length).toBeGreaterThan(0)
    expect(s.localFile(`${base}/slow.m4v`)).toBeNull() // still downloading
    expect(tFirst).toBeLessThan(500)
    let n = first.value!.length
    for (;;) {
      const r = await reader.read()
      if (r.done) break
      n += r.value.length
    }
    expect(n).toBe(SIZE)
  })

  it('shares one download between several players', async () => {
    beh = { chunk: 30_000, pauseMs: 10 }
    const s = mk()
    const u = `${base}/shared.m4v`
    const [a, b] = await Promise.all([s.serve(u, 'bytes=0-'), s.serve(u, 'bytes=0-')])
    const [x, y] = await Promise.all([readAll(a!), readAll(b!)])
    expect(x.equals(data)).toBe(true)
    expect(y.equals(data)).toBe(true)
    expect(hits.length).toBe(1)
  })

  it('answers a Range request in the middle of the file', async () => {
    const s = mk()
    const res = await s.serve(`${base}/r.m4v`, 'bytes=1000-1999')
    expect(res?.status).toBe(206)
    expect(res?.headers.get('content-range')).toBe(`bytes 1000-1999/${SIZE}`)
    expect((await readAll(res!)).equals(data.subarray(1000, 2000))).toBe(true)
  })

  it('answers a suffix range and rejects one past the end', async () => {
    const s = mk()
    const res = await s.serve(`${base}/r2.m4v`, 'bytes=-500')
    expect((await readAll(res!)).equals(data.subarray(SIZE - 500))).toBe(true)
    const bad = await s.serve(`${base}/r2.m4v`, `bytes=${SIZE + 10}-`)
    expect(bad?.status).toBe(416)
  })

  it('resumes with a Range request after the connection drops', async () => {
    beh = { chunk: 40_000, pauseMs: 5, dropAfter: 200_000 }
    const s = mk()
    const res = await s.serve(`${base}/drop.m4v`, 'bytes=0-')
    const body = await readAll(res!)
    expect(body.equals(data)).toBe(true)
    expect(hits.length).toBe(2)
    expect(hits[1]!.range).toMatch(/^bytes=\d+-$/)
    expect(Number(/(\d+)-/.exec(hits[1]!.range!)![1])).toBeGreaterThan(0)
    await waitUntil(() => !!s.localFile(`${base}/drop.m4v`))
    expect(readFileSync(s.localFile(`${base}/drop.m4v`)!).equals(data)).toBe(true)
  })

  it('starts over when the server ignores Range after a drop', async () => {
    beh = { chunk: 40_000, pauseMs: 5, dropAfter: 200_000, ignoreRange: true }
    const s = mk()
    const res = await s.serve(`${base}/ign.m4v`, null)
    const body = await readAll(res!)
    expect(body.equals(data)).toBe(true)
    await waitUntil(() => !!s.localFile(`${base}/ign.m4v`))
    expect(readFileSync(s.localFile(`${base}/ign.m4v`)!).equals(data)).toBe(true)
  })

  it('waits when the CDN says it is busy (429 with Retry-After) and then plays', async () => {
    beh = { chunk: 100_000, pauseMs: 0, busy: 1 }
    const s = mk()
    const t0 = Date.now()
    const res = await s.serve(`${base}/busy.m4v`, 'bytes=0-')
    expect((await readAll(res!)).equals(data)).toBe(true)
    expect(Date.now() - t0).toBeGreaterThanOrEqual(900)
    expect(hits.length).toBe(2)
  })

  it('gives up cleanly (null) when the clip does not exist', async () => {
    beh.status = 404
    const s = mk()
    expect(await s.serve(`${base}/gone.m4v`, 'bytes=0-')).toBeNull()
    expect(hits.length).toBe(1) // a 404 is not retried
    expect(s.localFile(`${base}/gone.m4v`)).toBeNull()
    expect(readdirPart(dir)).toBe('')
  })

  it('refuses a clip over the size limit', async () => {
    const s = mk({ maxBytes: 100_000 })
    expect(await s.serve(`${base}/big.m4v`, 'bytes=0-')).toBeNull()
    expect(s.localFile(`${base}/big.m4v`)).toBeNull()
  })

  it('a failed clip can be tried again later', async () => {
    beh.status = 500
    const s = mk({ attempts: 2 })
    expect(await s.serve(`${base}/flaky.m4v`, 'bytes=0-')).toBeNull()
    beh.status = 0
    const res = await s.serve(`${base}/flaky.m4v`, 'bytes=0-')
    expect((await readAll(res!)).equals(data)).toBe(true)
  })

  it('serves from nothing (null) for a clip that is already saved: the caller reads the file', async () => {
    const s = mk()
    const u = `${base}/saved.m4v`
    await readAll((await s.serve(u, 'bytes=0-'))!)
    await waitUntil(() => !!s.localFile(u))
    expect(await s.serve(u, 'bytes=0-')).toBeNull()
  })

  it('tidy removes old unfinished downloads and keeps the folder within its limits', () => {
    const s = mk()
    const old = join(dir, 'dead.mp4.part')
    writeFileSync(old, 'x')
    const past = new Date(Date.now() - 3600_000)
    utimesSync(old, past, past)
    for (let i = 0; i < 5; i++) writeFileSync(join(dir, `c${i}.mp4`), Buffer.alloc(1000, i))
    s.tidy(3, 10_000)
    expect(existsSync(old)).toBe(false)
    expect(readdirMp4(dir)).toBeLessThanOrEqual(3)
  })
})

function readdirPart(d: string): string {
  return readdirSync(d).find((f) => f.endsWith('.part')) ?? ''
}
function readdirMp4(d: string): number {
  return readdirSync(d).filter((f) => f.endsWith('.mp4')).length
}
