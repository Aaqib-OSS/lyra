import { createHash } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readSync, readdirSync, renameSync, rmSync, statSync, writeSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Apple's preview clips are HD (1920 px wide, about 20 MB for 30 s) and the CDN is not always quick. The old way saved the
 * whole clip first and only then let the video start, so on a slow or flaky connection nothing played for 20 seconds or more,
 * and a single dropped connection lost the lot.
 *
 * ClipStore downloads each clip ONCE into a growing `.part` file and serves it to the player WHILE it downloads:
 *   - playback starts as soon as the first bytes (the clip is "fast start", its index is at the front) have arrived;
 *   - several players (Lyra keeps two video elements for the loop crossfade) share the one download;
 *   - a dropped or stalled connection resumes with a Range request from where it stopped, instead of starting over;
 *   - when the file is complete it is renamed into place, and later plays (and loops) come straight from disk.
 */

export interface ClipLog {
  warn(msg: string, detail?: string): void
  info?(msg: string, detail?: string): void
}

export interface ClipStoreOptions {
  dir: string
  /** the network (Electron's net.fetch in the app, a stub in tests) */
  fetch: (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<Response>
  log?: ClipLog
  /** biggest clip we accept */
  maxBytes?: number
  /** how many resume attempts after a failed or stalled connection */
  attempts?: number
  /** no bytes for this long = the connection is stalled: drop it and resume */
  stallMs?: number
  /** how long a player may wait for the next bytes before its request fails (the player then retries by itself) */
  readStallMs?: number
  /** base delay before a resume attempt, doubled each time (tests make it tiny) */
  backoffMs?: number
  /** called when a clip has just been saved (the app prunes the folder here) */
  onSaved?(file: string): void
  /** how a clip URL becomes a file name (default: first 24 hex digits of its SHA-256, as before) */
  hash?: (url: string) => string
}

interface Entry {
  url: string
  file: string
  part: string
  total: number | null
  received: number
  done: boolean
  error: Error | null
  /** resolves when the size is known (or the download failed) */
  ready: Promise<void>
  waiters: Set<() => void>
  abort: AbortController | null
}

export class ClipStore {
  private readonly entries = new Map<string, Entry>()
  private readonly o: Required<Omit<ClipStoreOptions, 'log' | 'onSaved'>> & Pick<ClipStoreOptions, 'log' | 'onSaved'>

  constructor(opts: ClipStoreOptions) {
    this.o = {
      maxBytes: 64 * 1024 * 1024,
      attempts: 4,
      stallMs: 12_000,
      readStallMs: 20_000,
      backoffMs: 700,
      hash: (u) => createHash('sha256').update(u).digest('hex').slice(0, 24),
      ...opts
    }
    mkdirSync(this.o.dir, { recursive: true })
  }

  private pathFor(url: string): string {
    return join(this.o.dir, `${this.o.hash(url)}.mp4`)
  }

  /** Is the clip fully saved? Then this is the file to play from. */
  localFile(url: string): string | null {
    const f = this.pathFor(url)
    return existsSync(f) ? f : null
  }

  /** Start (or join) the one download of this clip. Never throws. */
  ensure(url: string): Entry | null {
    const file = this.pathFor(url)
    if (existsSync(file)) return null
    let e = this.entries.get(url)
    if (e && !e.error) return e
    let release!: () => void
    const ready = new Promise<void>((r) => (release = r))
    e = { url, file, part: `${file}.part`, total: null, received: 0, done: false, error: null, ready, waiters: new Set(), abort: null }
    this.entries.set(url, e)
    void this.download(e, release)
    return e
  }

  /** Is a download for this clip running right now? */
  active(url: string): boolean {
    const e = this.entries.get(url)
    return !!e && !e.done && !e.error
  }

  private wake(e: Entry): void {
    for (const w of [...e.waiters]) w()
  }

  private async download(e: Entry, release: () => void): Promise<void> {
    let fd = -1
    try {
      fd = openSync(e.part, 'w')
      let lastErr: Error | null = null
      for (let attempt = 0; attempt < this.o.attempts; attempt++) {
        const ctl = new AbortController()
        e.abort = ctl
        let timer: ReturnType<typeof setTimeout> | undefined
        const arm = (): void => {
          clearTimeout(timer)
          timer = setTimeout(() => ctl.abort(new Error('stalled')), this.o.stallMs)
        }
        try {
          arm()
          const headers: Record<string, string> = e.received > 0 ? { range: `bytes=${e.received}-` } : {}
          const res = await this.o.fetch(e.url, { headers, signal: ctl.signal })
          if (res.status === 429 || res.status === 503) {
            const wait = Math.min(10, Math.max(1, Number(res.headers.get('retry-after')) || 3))
            throw Object.assign(new Error(`busy ${res.status}`), { waitMs: wait * 1000 })
          }
          if (res.status !== 200 && res.status !== 206) throw Object.assign(new Error(`status ${res.status}`), { fatal: res.status === 404 || res.status === 403 })
          if (e.received > 0 && res.status === 200) {
            // the server ignored our Range request and is sending everything again: start over from byte 0
            e.received = 0
            e.total = null
          }
          if (e.total === null) {
            const range = /\/(\d+)\s*$/.exec(res.headers.get('content-range') ?? '')
            const len = Number(res.headers.get('content-length') ?? '')
            const total = range ? Number(range[1]) : res.status === 200 && len > 0 ? len : NaN
            if (Number.isFinite(total) && total > 0) {
              if (total > this.o.maxBytes) throw Object.assign(new Error(`clip too big (${total} bytes)`), { fatal: true })
              e.total = total
              release()
              this.wake(e)
            }
          }
          const reader = res.body?.getReader()
          if (!reader) throw new Error('no body')
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            arm()
            if (e.received + value.length > this.o.maxBytes) throw Object.assign(new Error('clip too big'), { fatal: true })
            writeSync(fd, value, 0, value.length, e.received)
            e.received += value.length
            this.wake(e)
          }
          clearTimeout(timer)
          if (e.total === null) e.total = e.received
          if (e.received >= e.total) break
          throw new Error(`short body (${e.received} of ${e.total})`)
        } catch (err) {
          clearTimeout(timer)
          lastErr = err instanceof Error ? err : new Error(String(err))
          const fatal = (err as { fatal?: boolean }).fatal
          this.o.log?.warn(`clip download ${fatal ? 'refused' : 'interrupted'} (attempt ${attempt + 1}/${this.o.attempts}, ${e.received} bytes)`, lastErr.message)
          if (fatal || attempt === this.o.attempts - 1) throw lastErr
          const wait = (err as { waitMs?: number }).waitMs ?? this.o.backoffMs * 2 ** attempt
          await new Promise((r) => setTimeout(r, wait))
        }
      }
      if (e.total === null || e.received < e.total) throw lastErr ?? new Error('incomplete')
      closeSync(fd)
      fd = -1
      if (e.received < 10_000) throw Object.assign(new Error(`clip too small (${e.received} bytes)`), { fatal: true })
      renameSync(e.part, e.file)
      e.done = true
      this.entries.delete(e.url)
      this.o.onSaved?.(e.file)
      this.o.log?.info?.('clip saved', `${e.received} bytes`)
    } catch (err) {
      e.error = err instanceof Error ? err : new Error(String(err))
      this.o.log?.warn('clip download failed', e.error.message)
      try {
        if (fd >= 0) closeSync(fd)
        rmSync(e.part, { force: true })
      } catch {
        /* best effort */
      }
    } finally {
      release()
      this.wake(e)
      e.abort = null
    }
  }

  /**
   * An HTTP answer for a Range request on a clip that is still downloading: the bytes that are already here are sent
   * right away and the rest as it arrives. Returns null when this clip cannot be served this way (the caller then
   * streams it straight from the source, or fails and lets the player retry).
   */
  async serve(url: string, rangeHeader: string | null, signal?: AbortSignal): Promise<Response | null> {
    const found = this.ensure(url)
    if (!found) return null
    const e: Entry = found
    await Promise.race([e.ready, new Promise<void>((r) => setTimeout(r, this.o.readStallMs))])
    if (e.error || e.total === null) return null
    const total = e.total
    let start = 0
    let end = total - 1
    let partial = false
    const m = rangeHeader ? /^bytes=(\d*)-(\d*)/.exec(rangeHeader) : null
    if (m && (m[1] || m[2])) {
      partial = true
      if (m[1] === '') {
        // suffix range: the last N bytes
        start = Math.max(0, total - Number(m[2]))
      } else {
        start = Number(m[1])
        if (m[2]) end = Math.min(total - 1, Number(m[2]))
      }
      if (start >= total || start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${total}` } })
    }
    const length = end - start + 1
    let pos = start
    const self = this
    const stream = new ReadableStream<Uint8Array>({
      async pull(ctl) {
        if (pos > end) {
          ctl.close()
          return
        }
        // wait until bytes at `pos` exist (or the download is over)
        const deadline = Date.now() + self.o.readStallMs
        while (pos >= e.received && !e.error && !signal?.aborted) {
          if (e.done && existsSync(e.file)) break
          const left = deadline - Date.now()
          if (left <= 0) {
            ctl.error(new Error('clip stalled'))
            return
          }
          await new Promise<void>((resolve) => {
            const t = setTimeout(done, Math.min(left, 1000))
            function done(): void {
              clearTimeout(t)
              e.waiters.delete(done)
              resolve()
            }
            e.waiters.add(done)
          })
        }
        if (signal?.aborted) {
          ctl.close()
          return
        }
        if (e.error && pos >= e.received) {
          ctl.error(e.error)
          return
        }
        const avail = e.done ? total : e.received
        const n = Math.min(256 * 1024, end + 1 - pos, avail - pos)
        if (n <= 0) return
        const path = e.done || existsSync(e.file) ? e.file : e.part
        let fd = -1
        try {
          fd = openSync(path, 'r')
          const buf = Buffer.allocUnsafe(n)
          const got = readSync(fd, buf, 0, n, pos)
          if (got > 0) {
            ctl.enqueue(new Uint8Array(buf.buffer, buf.byteOffset, got))
            pos += got
          }
        } catch (err) {
          // the part file was just renamed: look again next time round
          if (!existsSync(e.file) && !existsSync(e.part)) ctl.error(err as Error)
        } finally {
          if (fd >= 0) closeSync(fd)
        }
      },
      cancel() {
        /* nothing to clean up: waiters remove themselves */
      }
    })
    const headers: Record<string, string> = {
      'content-type': 'video/mp4',
      'content-length': String(length),
      'accept-ranges': 'bytes'
    }
    if (partial) headers['content-range'] = `bytes ${start}-${end}/${total}`
    return new Response(stream, { status: partial ? 206 : 200, headers })
  }

  /** Saved clips: how many and how many bytes (shown in Settings). */
  info(): { files: number; bytes: number } {
    try {
      const done = readdirSync(this.o.dir).filter((f) => f.endsWith('.mp4'))
      return { files: done.length, bytes: done.reduce((n, f) => n + statSync(join(this.o.dir, f)).size, 0) }
    } catch {
      return { files: 0, bytes: 0 }
    }
  }

  /** Delete every saved clip (downloads that are running right now are left alone). */
  clear(): void {
    try {
      for (const f of readdirSync(this.o.dir)) {
        const p = join(this.o.dir, f)
        if ([...this.entries.values()].some((e) => !e.done && !e.error && e.part === p)) continue
        rmSync(p, { force: true })
      }
    } catch {
      /* best effort */
    }
  }

  /** Delete leftovers of downloads that never finished (a crash or a force quit), and keep the folder inside its limits. */
  tidy(maxFiles: number, maxBytes: number): void {
    try {
      const now = Date.now()
      const files = readdirSync(this.o.dir)
      for (const f of files) {
        if (!f.endsWith('.part')) continue
        const p = join(this.o.dir, f)
        const mine = [...this.entries.values()].some((e) => e.part === p)
        if (!mine && now - statSync(p).mtimeMs > 10 * 60_000) rmSync(p, { force: true })
      }
      const done = files
        .filter((f) => f.endsWith('.mp4'))
        .map((f) => {
          const st = statSync(join(this.o.dir, f))
          return { f, t: st.mtimeMs, size: st.size }
        })
        .sort((a, b) => b.t - a.t)
      let total = 0
      done.forEach((x, i) => {
        total += x.size
        if (i >= maxFiles || total > maxBytes) rmSync(join(this.o.dir, x.f), { force: true })
      })
    } catch {
      /* housekeeping is best effort */
    }
  }
}
