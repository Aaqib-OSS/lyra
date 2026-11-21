/**
 * Node micro-benchmarks for the pure parts of the recorder (run: npx vitest run -c scripts/vitest.bench.config.ts).
 * It measures only what can be measured without a GPU or a window: IPC write batching and sound memory.
 * Encoder speed and canvas cost need the real app; see docs/recording-performance.md.
 */
import { it } from 'vitest'
import { Muxer, StreamTarget } from 'mp4-muxer'
import { ChunkWriter } from '../src/renderer/src/lib/studio/encodePolicy'
import { PcmStore } from '../src/renderer/src/lib/studio/pcmStore'

// mp4-muxer only needs the WebCodecs chunk shape; stand-ins let it run in Node
class FakeChunk {
  constructor(
    public type: string,
    public timestamp: number,
    public duration: number,
    public byteLength: number,
    private fill: number
  ) {}
  copyTo(d: AllowSharedBufferSource): void {
    new Uint8Array(d as ArrayBuffer).fill(this.fill, 0, this.byteLength)
  }
}
Object.assign(globalThis, { EncodedVideoChunk: FakeChunk, EncodedAudioChunk: FakeChunk })
const fakeChunk = (type: 'key' | 'delta', ts: number, dur: number, size: number): EncodedVideoChunk => new FakeChunk(type, ts, dur, size, 7) as unknown as EncodedVideoChunk
const fakeAudio = (ts: number, dur: number, size: number): EncodedAudioChunk => new FakeChunk('key', ts, dur, size, 3) as unknown as EncodedAudioChunk

function muxRun(secs: number, fps: number, mbps: number, batched: boolean): { calls: number; bytes: number; ms: number } {
  let calls = 0
  let bytes = 0
  const writer = new ChunkWriter(() => undefined, 1024 * 1024)
  const muxer = new Muxer({
    target: new StreamTarget({
      onData: (chunk, position) => {
        if (batched) writer.write(chunk, position)
        else {
          calls++
          bytes += chunk.byteLength
          void chunk.slice() // the old code copied every piece before the IPC call
        }
      }
    }),
    video: { codec: 'avc', width: 1080, height: 1920, frameRate: fps },
    audio: { codec: 'aac', numberOfChannels: 2, sampleRate: 48000 },
    fastStart: false,
    firstTimestampBehavior: 'offset'
  })
  const avcC = new Uint8Array([1, 100, 0, 52, 255, 225, 0, 4, 103, 100, 0, 52, 1, 0, 4, 104, 238, 60, 128])
  const vMeta = { decoderConfig: { codec: 'avc1.640034', description: avcC } } as EncodedVideoChunkMetadata
  const aMeta = { decoderConfig: { codec: 'mp4a.40.2', numberOfChannels: 2, sampleRate: 48000, description: new Uint8Array([0x11, 0x90]) } } as unknown as EncodedAudioChunkMetadata
  const frameBytes = Math.round((mbps * 1e6) / 8 / fps)
  const t0 = performance.now()
  const n = secs * fps
  for (let i = 0; i < n; i++) {
    const ts = Math.round((i * 1e6) / fps)
    muxer.addVideoChunk(fakeChunk(i % (fps * 2) === 0 ? 'key' : 'delta', ts, Math.round(1e6 / fps), i % (fps * 2) === 0 ? frameBytes * 8 : frameBytes), i === 0 ? vMeta : undefined)
    if (i % Math.round(fps / 46.875) === 0 || fps === 60) muxer.addAudioChunk(fakeAudio(Math.round((i * 1e6) / fps), 21333, 500), i === 0 ? aMeta : undefined)
  }
  muxer.finalize()
  if (batched) {
    writer.flush()
    calls = writer.calls
    bytes = writer.bytes
  }
  return { calls, bytes, ms: performance.now() - t0 }
}

it('bench', () => {
  const secs = 60
  for (const fps of [60, 30]) {
    const before = muxRun(secs, fps, 9 * (fps === 60 ? 1.4 : 1), false)
    const after = muxRun(secs, fps, 9 * (fps === 60 ? 1.4 : 1), true)
    console.log(`${fps} fps, ${secs} s 1080p: write calls before=${before.calls} after=${after.calls} (${(before.calls / Math.max(1, after.calls)).toFixed(0)}x fewer), bytes ${(before.bytes / 1e6).toFixed(1)} MB`)
  }

  // sound memory for a 4-minute song
  const frames = 48000 * 240
  const gc = (globalThis as { gc?: () => void }).gc
  function ab(): number {
    gc?.()
    return process.memoryUsage().arrayBuffers / 1e6
  }
  {
    const base = ab()
    const s = new PcmStore()
    const pcm = new Int16Array(480 * 2)
    for (let i = 0; i < frames; i += 480) s.appendInterleaved(pcm)
    console.log(`4 min sound, PcmStore: ${(ab() - base).toFixed(0)} MB (no join step, so that is also the peak)`)
  }

  {
    const base = ab()
    // old: per-chunk Float32 L and R (helper delivers ~10 ms chunks), then two big concatenated arrays
    const chunk = 480
    const left: Float32Array[] = []
    const right: Float32Array[] = []
    for (let i = 0; i < frames; i += chunk) {
      left.push(new Float32Array(chunk))
      right.push(new Float32Array(chunk))
    }
    const stored = ab() - base
    const L = new Float32Array(frames)
    const R = new Float32Array(frames)
    for (let off = 0, i = 0; i < left.length; off += chunk, i++) {
      L.set(left[i]!, off)
      R.set(right[i]!, off)
    }
    const peak = ab() - base
    console.log(`4 min sound, old path: held as chunks ${stored.toFixed(0)} MB, peak while joining ${peak.toFixed(0)} MB`)
    left.length = right.length = 0
    void L
    void R
  }
}, 120_000)
