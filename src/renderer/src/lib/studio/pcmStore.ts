/**
 * Holds the recorded sound of the "smooth" export as 16-bit stereo in fixed pages. The old code kept two Float32
 * arrays per chunk (8 bytes per frame), then copied everything into two more big arrays (peak 16 bytes per frame:
 * about 184 MB for a 4-minute song). This keeps 4 bytes per frame and never copies it all (about 46 MB).
 * 16-bit is what the capture helper delivers anyway, and far finer than the AAC encoder that comes next.
 */
const PAGE_FRAMES = 48000

export class PcmStore {
  private pages: Int16Array[] = []
  private used = 0 // frames in the last page
  frames = 0

  /** interleaved L R L R 16-bit samples */
  appendInterleaved(samples: Int16Array): void {
    const n = samples.length >> 1
    let from = 0
    while (from < n) {
      let page = this.pages[this.pages.length - 1]
      if (!page || this.used === PAGE_FRAMES) {
        page = new Int16Array(PAGE_FRAMES * 2)
        this.pages.push(page)
        this.used = 0
      }
      const take = Math.min(n - from, PAGE_FRAMES - this.used)
      page.set(samples.subarray(from * 2, (from + take) * 2), this.used * 2)
      this.used += take
      from += take
    }
    this.frames += n
  }

  /** float channels in -1..1 (the share-the-whole-PC fallback). Mono is spread to both ears. */
  appendFloat(l: Float32Array, r: Float32Array | null): void {
    const n = l.length
    const out = new Int16Array(n * 2)
    const q = (x: number): number => (x >= 1 ? 32767 : x <= -1 ? -32768 : Math.round(x * 32768))
    for (let i = 0; i < n; i++) {
      out[i * 2] = q(l[i]!)
      out[i * 2 + 1] = q((r ?? l)[i]!)
    }
    this.appendInterleaved(out)
  }

  appendSilence(frames: number): void {
    for (let left = frames; left > 0; left -= PAGE_FRAMES) this.appendInterleaved(new Int16Array(Math.min(PAGE_FRAMES, left) * 2))
  }

  /** copies `n` frames starting at `start` into planar float arrays (as the audio encoder wants them) */
  read(start: number, n: number, l: Float32Array, r: Float32Array): void {
    for (let i = 0; i < n; ) {
      const f = start + i
      const page = this.pages[(f / PAGE_FRAMES) | 0]!
      const inPage = f % PAGE_FRAMES
      const take = Math.min(n - i, PAGE_FRAMES - inPage)
      for (let k = 0; k < take; k++) {
        l[i + k] = page[(inPage + k) * 2]! / 32768
        r[i + k] = page[(inPage + k) * 2 + 1]! / 32768
      }
      i += take
    }
  }

  /**
   * Mean-square energy of each 400 ms block, sampled every 4th frame: the same numbers loudnessGainOf works out from
   * float arrays, so the loudness estimate does not need the sound as two big arrays.
   */
  blockEnergies(block = 19200): number[] {
    const out: number[] = []
    const l = new Float32Array(block)
    const r = new Float32Array(block)
    for (let s = 0; s + block <= this.frames; s += block) {
      this.read(s, block, l, r)
      let sum = 0
      for (let i = 0; i < block; i += 4) sum += l[i]! * l[i]! + r[i]! * r[i]!
      out.push(sum / ((block / 4) * 2))
    }
    return out
  }

  /** frees the pages */
  clear(): void {
    this.pages = []
    this.frames = 0
    this.used = 0
  }

  get bytes(): number {
    return this.pages.length * PAGE_FRAMES * 4
  }
}
