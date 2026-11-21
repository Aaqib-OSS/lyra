import { describe, expect, it } from 'vitest'
import { AdaptiveLoad, ChunkWriter, PRESETS, clampToCapability, deviceTier, droppedPercent, isKeyFrame, maxQueueFor, planTick, presetOf, recommendPreset, throttleProgress, waitForRoom } from './encodePolicy'

describe('presets and device capability', () => {
  it('classifies machines', () => {
    expect(deviceTier({ cores: 2 })).toBe('low')
    expect(deviceTier({ cores: 16, memoryGb: 2 })).toBe('low')
    expect(deviceTier({ cores: 4, memoryGb: 8 })).toBe('mid')
    expect(deviceTier({ cores: 12, memoryGb: 4 })).toBe('mid')
    expect(deviceTier({ cores: 8 })).toBe('high') // unknown memory is not held against the PC
  })
  it('recommends Fast for weak PCs and never High by itself', () => {
    expect(recommendPreset({ cores: 2 })).toBe('fast')
    expect(recommendPreset({ cores: 8, memoryGb: 8 })).toBe('balanced')
    expect(recommendPreset({ cores: 32, memoryGb: 8 })).toBe('balanced')
  })
  it('lowers a request the machine can not hold, without raising anything', () => {
    expect(clampToCapability('1440p', 60, { cores: 2 }, true)).toEqual({ quality: '720p', fps: 30, changed: true })
    expect(clampToCapability('1440p', 60, { cores: 4, memoryGb: 8 }, true)).toEqual({ quality: '1080p', fps: 30, changed: true })
    // rendering afterwards can take as long as it likes, so a mid PC may go higher
    expect(clampToCapability('1440p', 60, { cores: 4, memoryGb: 8 }, false)).toEqual({ quality: '1440p', fps: 60, changed: false })
    expect(clampToCapability('720p', 30, { cores: 16, memoryGb: 8 }, true)).toEqual({ quality: '720p', fps: 30, changed: false })
  })
  it('names the preset a quality + fps pair belongs to', () => {
    for (const k of ['fast', 'balanced', 'high'] as const) expect(presetOf(PRESETS[k].quality, PRESETS[k].fps)).toBe(k)
    expect(presetOf('1080p', 30)).toBe('custom')
  })
  it('puts a key frame every two seconds', () => {
    expect(isKeyFrame(0, 60)).toBe(true)
    expect(isKeyFrame(120, 60)).toBe(true)
    expect(isKeyFrame(60, 60)).toBe(false)
    expect(isKeyFrame(60, 30)).toBe(true)
  })
})

describe('backpressure and drop policy', () => {
  it('caps the encoder queue by memory, not by a fixed count', () => {
    expect(maxQueueFor(1080, 1920)).toBe(16)
    expect(maxQueueFor(2560, 1440)).toBe(9) // 1440p landscape
    expect(maxQueueFor(720, 1280)).toBe(24) // ceiling
    expect(maxQueueFor(7680, 4320)).toBe(4) // floor
  })
  const base = { maxQueue: 10, maxRepeat: 600, drawEvery: 1 }
  it('waits while the encoder is full or the frame was already written', () => {
    expect(planTick({ ...base, target: 5, nextIndex: 5, queueSize: 10 })).toEqual({ kind: 'wait' })
    expect(planTick({ ...base, target: 5, nextIndex: 6, queueSize: 0 })).toEqual({ kind: 'wait' })
  })
  it('draws the frame on time with no repeats', () => {
    expect(planTick({ ...base, target: 5, nextIndex: 5, queueSize: 2 })).toEqual({ kind: 'draw', from: 5, repeats: 0, target: 5 })
  })
  it('fills missed frames with repeats, bounded', () => {
    expect(planTick({ ...base, target: 9, nextIndex: 5, queueSize: 0 })).toEqual({ kind: 'draw', from: 5, repeats: 4, target: 9 })
    expect(planTick({ ...base, maxRepeat: 100, target: 5000, nextIndex: 5, queueSize: 0 })).toEqual({ kind: 'draw', from: 5, repeats: 100, target: 5000 })
  })
  it('sheds drawing on odd frames when asked to draw every second one', () => {
    expect(planTick({ ...base, drawEvery: 2, target: 7, nextIndex: 7, queueSize: 0 })).toEqual({ kind: 'repeat', from: 7, count: 1 })
    expect(planTick({ ...base, drawEvery: 2, target: 8, nextIndex: 7, queueSize: 0 })).toEqual({ kind: 'draw', from: 7, repeats: 1, target: 8 })
  })
  it('AdaptiveLoad sheds under sustained load and recovers with hysteresis', () => {
    const a = new AdaptiveLoad(16.7)
    for (let i = 0; i < 40; i++) a.record(30) // twice the budget
    expect(a.drawEvery).toBe(2)
    for (let i = 0; i < 40; i++) a.record(12) // above the recover line (45%)
    expect(a.drawEvery).toBe(2)
    for (let i = 0; i < 80; i++) a.record(4)
    expect(a.drawEvery).toBe(1)
  })
  it('AdaptiveLoad ignores slow warm-up frames and a fast PC never sheds', () => {
    const a = new AdaptiveLoad(16.7)
    for (let i = 0; i < 10; i++) a.record(200)
    expect(a.drawEvery).toBe(1)
    const b = new AdaptiveLoad(16.7)
    for (let i = 0; i < 500; i++) b.record(5)
    expect(b.drawEvery).toBe(1)
  })
  it('reports dropped percent, 0 for short runs', () => {
    expect(droppedPercent(50, 100, 10)).toBe(50)
    expect(droppedPercent(0, 100, 3)).toBe(0)
    expect(droppedPercent(100, 100, 30)).toBe(0)
  })
  it('waitForRoom resolves on dequeue, and stops when told to', async () => {
    const t = new EventTarget()
    const enc = { encodeQueueSize: 20, addEventListener: (_: 'dequeue', f: () => void) => t.addEventListener('dequeue', f), removeEventListener: (_: 'dequeue', f: () => void) => t.removeEventListener('dequeue', f) }
    const p = waitForRoom(enc, 8, () => false, 1000)
    enc.encodeQueueSize = 5
    t.dispatchEvent(new Event('dequeue'))
    await p
    expect(enc.encodeQueueSize).toBe(5)
    enc.encodeQueueSize = 50
    await waitForRoom(enc, 8, () => true) // stop() true: returns at once
  })
  it('waitForRoom falls back to its safety timer when no event comes', async () => {
    let size = 10
    const enc = { get encodeQueueSize() { return size }, addEventListener() {}, removeEventListener() {} }
    setTimeout(() => (size = 0), 20)
    await waitForRoom(enc, 8, () => false, 5)
    expect(size).toBe(0)
  })
  it('throttles progress but never drops a forced one', () => {
    let now = 0
    const seen: number[] = []
    const t = throttleProgress<number>((p) => seen.push(p), 500, () => now)
    t.push(1)
    now = 100
    t.push(2)
    now = 600
    t.push(3)
    t.push(4, true)
    expect(seen).toEqual([1, 3, 4])
  })
})

describe('ChunkWriter', () => {
  const bytes = (n: number, v = 1): Uint8Array => new Uint8Array(n).fill(v)
  it('merges contiguous writes into one ordered call', async () => {
    const calls: Array<{ at: number; len: number }> = []
    const w = new ChunkWriter((at, d) => void calls.push({ at, len: d.byteLength }), 1000)
    let pos = 100
    for (let i = 0; i < 5; i++) {
      w.write(bytes(100), pos)
      pos += 100
    }
    await w.close()
    expect(calls).toEqual([{ at: 100, len: 500 }])
  })
  it('flushes at the threshold and when the position jumps (the muxer patching a header)', async () => {
    const calls: Array<{ at: number; len: number }> = []
    const w = new ChunkWriter((at, d) => void calls.push({ at, len: d.byteLength }), 250)
    w.write(bytes(100), 0)
    w.write(bytes(100), 100)
    w.write(bytes(100), 200) // 300 >= 250: flush
    w.write(bytes(8), 8) // jump back
    await w.close()
    expect(calls).toEqual([{ at: 0, len: 300 }, { at: 8, len: 8 }])
  })
  it('keeps its own copy of the data and the byte order', async () => {
    let got: Uint8Array | null = null
    const w = new ChunkWriter((_, d) => void (got = d), 1000)
    const buf = new Uint8Array([1, 2, 3])
    w.write(buf, 0)
    buf.fill(9)
    w.write(new Uint8Array([4]), 3)
    await w.close()
    expect(Array.from(got!)).toEqual([1, 2, 3, 4])
  })
  it('remembers a failed write, stops writing, and close() throws it', async () => {
    let n = 0
    const w = new ChunkWriter(async () => {
      n++
      throw new Error('disk full')
    }, 10)
    w.write(bytes(20), 0)
    w.write(bytes(20), 20)
    await expect(w.close()).rejects.toThrow('disk full')
    expect(w.error?.message).toBe('disk full')
    expect(n).toBe(1)
  })
  it('abandon() drops the buffer', async () => {
    const calls: number[] = []
    const w = new ChunkWriter((_, d) => void calls.push(d.byteLength), 1000)
    w.write(bytes(10), 0)
    await w.abandon()
    await w.close()
    expect(calls).toEqual([])
  })
})
