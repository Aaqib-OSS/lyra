/**
 * Pure decisions for the recorder: which quality preset to offer, how much work may be queued, when to skip drawing,
 * and how to batch the file writes. No DOM, no stores, so all of it is unit-tested (encodePolicy.test.ts).
 */
export type Quality = '720p' | '1080p' | '1440p'
export type Fps = 30 | 60
export type SpeedPreset = 'fast' | 'balanced' | 'high'

export interface PresetSpec {
  quality: Quality
  fps: Fps
  label: string
  hint: string
}

export const PRESETS: Record<SpeedPreset, PresetSpec> = {
  fast: { quality: '720p', fps: 30, label: 'Fast', hint: 'Lightest on the PC, smallest file' },
  balanced: { quality: '1080p', fps: 60, label: 'Balanced', hint: 'Sharp and smooth, fine for most PCs' },
  high: { quality: '1440p', fps: 60, label: 'High', hint: 'Sharpest, needs a strong PC' }
}

export interface DeviceCaps {
  /** logical processors (navigator.hardwareConcurrency) */
  cores: number
  /** GB of memory as the browser reports it (rounded and capped at 8), or undefined */
  memoryGb?: number
}

export type Tier = 'low' | 'mid' | 'high'

/** Rough class of the machine. Unknown memory counts as "enough", as the app's Light-look rule does. */
export function deviceTier(caps: DeviceCaps): Tier {
  const mem = caps.memoryGb ?? 8
  if (caps.cores <= 2 || mem <= 2) return 'low'
  if (caps.cores <= 4 || mem <= 4) return 'mid'
  return 'high'
}

/** The preset to select first: never above Balanced (High is opt-in), Fast on weak machines. */
export function recommendPreset(caps: DeviceCaps): SpeedPreset {
  return deviceTier(caps) === 'low' ? 'fast' : 'balanced'
}

const RANK: Record<Quality, number> = { '720p': 0, '1080p': 1, '1440p': 2 }

/**
 * The most a machine of this class is asked to do. `live` means the picture is drawn while the song plays (it has to
 * keep up with the clock); the "render afterwards" method can take as long as it likes, so it is capped less.
 */
export function capsFor(tier: Tier, live: boolean): { maxQuality: Quality; maxFps: Fps } {
  if (tier === 'low') return { maxQuality: live ? '720p' : '1080p', maxFps: 30 }
  if (tier === 'mid') return { maxQuality: live ? '1080p' : '1440p', maxFps: live ? 30 : 60 }
  return { maxQuality: '1440p', maxFps: 60 }
}

export interface Clamped {
  quality: Quality
  fps: Fps
  /** true when the request was lowered */
  changed: boolean
}

export function clampToCapability(quality: Quality, fps: Fps, caps: DeviceCaps, live: boolean): Clamped {
  const cap = capsFor(deviceTier(caps), live)
  const q = RANK[quality] > RANK[cap.maxQuality] ? cap.maxQuality : quality
  const f: Fps = fps > cap.maxFps ? cap.maxFps : fps
  return { quality: q, fps: f, changed: q !== quality || f !== fps }
}

/** Which preset the current quality + fps match, or 'custom'. */
export function presetOf(quality: Quality, fps: Fps): SpeedPreset | 'custom' {
  for (const k of Object.keys(PRESETS) as SpeedPreset[]) if (PRESETS[k].quality === quality && PRESETS[k].fps === fps) return k
  return 'custom'
}

/** A key frame every two seconds: seekable, and costs little at 9-16 Mbit/s. */
export const keyFrameEvery = (fps: number): number => Math.max(1, Math.round(fps * 2))
export const isKeyFrame = (index: number, fps: number): boolean => index % keyFrameEvery(fps) === 0

/**
 * How many raw frames may wait in the video encoder. Every queued frame keeps a full picture alive (width x height x 4
 * bytes), so the cap is set by a memory budget, not a fixed 40 frames: 1440p holds about 8, 720p about 24.
 */
export function maxQueueFor(w: number, h: number, budgetBytes = 128 * 1024 * 1024, floor = 4, ceil = 24): number {
  const per = Math.max(1, w * h * 4)
  return Math.max(floor, Math.min(ceil, Math.floor(budgetBytes / per)))
}

/** Bytes a queue of raw frames can hold at most. Used for the documented estimates. */
export const queueBytes = (w: number, h: number, frames: number): number => w * h * 4 * frames

/**
 * Decides, once per clock tick of the live recorder, what to do with the frame that belongs on screen now.
 *  - 'wait'   the encoder is full: do nothing (the missed frames are repeated later, so the file has no hole)
 *  - 'repeat' only repeat the previous picture up to and including `target` (adaptive load shedding: no drawing)
 *  - 'draw'   draw a new picture for `target` (after repeating the frames missed before it)
 */
export type FrameAction = { kind: 'wait' } | { kind: 'repeat'; from: number; count: number } | { kind: 'draw'; from: number; repeats: number; target: number }

/**
 * `maxRepeat` bounds how many repeats one tick may emit (a long stall must not queue minutes of frames); frames beyond
 * it are skipped by moving the write position up to `target`.
 */
export function planTick(opts: { target: number; nextIndex: number; queueSize: number; maxQueue: number; maxRepeat: number; drawEvery: number }): FrameAction {
  const { target, nextIndex, queueSize, maxQueue, maxRepeat, drawEvery } = opts
  if (nextIndex > target || queueSize >= maxQueue) return { kind: 'wait' }
  const draw = drawEvery <= 1 || target % drawEvery === 0
  if (!draw) return { kind: 'repeat', from: nextIndex, count: Math.min(target - nextIndex + 1, maxRepeat) }
  return { kind: 'draw', from: nextIndex, repeats: Math.min(target - nextIndex, maxRepeat), target }
}

/**
 * Watches how long drawing a frame takes and sheds load before the PC falls behind: when drawing eats most of the
 * frame budget, only every second picture is drawn (the other is a repeat, which is cheap); when there is plenty of
 * room again it goes back to drawing every frame. Hysteresis stops it flapping.
 */
export class AdaptiveLoad {
  private ema = 0
  private n = 0
  /** 1 = draw every frame, 2 = draw every second frame */
  drawEvery = 1
  constructor(
    private readonly frameMs: number,
    private readonly shedAbove = 0.85,
    private readonly recoverBelow = 0.45
  ) {}

  record(drawMs: number): void {
    this.n++
    this.ema = this.n === 1 ? drawMs : this.ema * 0.9 + drawMs * 0.1
    if (this.n < 20) return // let the first (slow, compiling) frames pass
    // when shedding, only every second frame is timed, and the budget is two frames
    const budget = this.drawEvery === 1 ? this.frameMs : this.frameMs * 2
    if (this.drawEvery === 1 && this.ema > budget * this.shedAbove) this.drawEvery = 2
    else if (this.drawEvery === 2 && this.ema < this.frameMs * this.recoverBelow) this.drawEvery = 1
  }

  get average(): number {
    return this.ema
  }
}

/** Fraction of frames that were repeats of the previous picture, as a whole percent. 0 for very short runs. */
export function droppedPercent(fresh: number, written: number, recordedSecs: number): number {
  if (recordedSecs < 5) return 0
  return Math.max(0, Math.round((1 - fresh / Math.max(1, written)) * 100))
}

/** A progress callback that fires at most every `minMs`, but always for the first and the final call. */
export function throttleProgress<T>(emit: (p: T) => void, minMs: number, now: () => number = () => performance.now()): { push(p: T, force?: boolean): void } {
  let last = -Infinity
  return {
    push(p, force = false) {
      const t = now()
      if (force || t - last >= minMs) {
        last = t
        emit(p)
      }
    }
  }
}

/**
 * Waits until the encoder has room for more. Uses the 'dequeue' event (no polling timer) with a short safety timeout,
 * and gives up early when `stop()` says so (cancel or an encoder error).
 */
export interface QueueLike {
  readonly encodeQueueSize: number
  addEventListener(type: 'dequeue', fn: () => void): void
  removeEventListener(type: 'dequeue', fn: () => void): void
}

export async function waitForRoom(enc: QueueLike, max: number, stop: () => boolean = () => false, safetyMs = 50): Promise<void> {
  while (enc.encodeQueueSize > max && !stop()) {
    await new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null
      const done = (): void => {
        if (timer !== null) clearTimeout(timer)
        enc.removeEventListener('dequeue', done)
        resolve()
      }
      enc.addEventListener('dequeue', done)
      timer = setTimeout(done, safetyMs)
    })
  }
}

/**
 * Batches the muxer's many small writes (one per video frame and per audio packet) into big contiguous ones, so the
 * main process is called a few times a second instead of ~100. Writes stay in order, one in flight at a time, and a
 * failed write is remembered (the old code threw the promise away, so a full disk produced a broken file silently).
 */
export class ChunkWriter {
  private parts: Uint8Array[] = []
  private start = 0
  private end = 0
  private size = 0
  private chain: Promise<void> = Promise.resolve()
  private failure: Error | null = null
  calls = 0
  bytes = 0

  constructor(
    private readonly sink: (position: number, data: Uint8Array) => Promise<unknown> | unknown,
    private readonly flushAt = 1024 * 1024
  ) {}

  /** the first write error, if any (check it in the recording loop to stop early) */
  get error(): Error | null {
    return this.failure
  }

  write(chunk: Uint8Array, position: number): void {
    if (this.size > 0 && position !== this.end) this.flush()
    if (this.size === 0) {
      this.start = position
      this.end = position
    }
    // the muxer may reuse its buffer: keep our own copy
    this.parts.push(chunk.slice())
    this.size += chunk.byteLength
    this.end += chunk.byteLength
    if (this.size >= this.flushAt) this.flush()
  }

  /** hands what is buffered to the sink (does not wait for it) */
  flush(): void {
    if (this.size === 0) return
    let data: Uint8Array
    if (this.parts.length === 1) data = this.parts[0]!
    else {
      data = new Uint8Array(this.size)
      let off = 0
      for (const p of this.parts) {
        data.set(p, off)
        off += p.byteLength
      }
    }
    const at = this.start
    this.parts = []
    this.size = 0
    this.calls++
    this.bytes += data.byteLength
    this.chain = this.chain.then(async () => {
      if (this.failure) return
      try {
        await this.sink(at, data)
      } catch (e) {
        this.failure = e instanceof Error ? e : new Error(String(e))
      }
    })
  }

  /** flushes and waits until everything has been written; throws the first write error */
  async close(): Promise<void> {
    this.flush()
    await this.chain
    if (this.failure) throw this.failure
  }

  /** drops anything buffered and waits for writes already handed over (used on cancel / failure) */
  async abandon(): Promise<void> {
    this.parts = []
    this.size = 0
    await this.chain.catch(() => undefined)
  }
}
