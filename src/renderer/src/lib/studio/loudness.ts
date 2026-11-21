/** Loudness estimate for the exports (pure, no DOM). See fileExport.ts for how it is used. */
/** The same estimate for sound that is already in memory as one array per channel. */
export function loudnessGainOf(chans: Float32Array[], s0: number, s1: number): number {
  const channels = chans.length
  const block = 19200
  const ms: number[] = []
  for (let s = s0; s + block <= s1; s += block) {
    let sum = 0
    for (let c = 0; c < channels; c++) {
      const d = chans[c]!
      for (let i = 0; i < block; i += 4) sum += d[s + i]! * d[s + i]!
    }
    ms.push(sum / ((block / 4) * channels))
  }
  return loudnessGainFromEnergies(ms)
}

/** The gain from the mean-square energy of each 400 ms block (see PcmStore.blockEnergies). */
export function loudnessGainFromEnergies(ms: number[]): number {
  const loud = ms.filter((m) => 10 * Math.log10(m + 1e-12) - 0.691 > -50)
  if (!loud.length) return 1
  const mean0 = loud.reduce((a, b) => a + b, 0) / loud.length
  const gate = 10 * Math.log10(mean0) - 0.691 - 10
  const kept = loud.filter((m) => 10 * Math.log10(m + 1e-12) - 0.691 > gate)
  const mean = (kept.length ? kept : loud).reduce((a, b) => a + b, 0) / (kept.length || loud.length)
  const lufs = 10 * Math.log10(mean) - 0.691
  // the estimate has no K-weighting (music reads about 1.5 dB lower than the real LUFS), so aim a little lower
  const g = Math.pow(10, (-15.5 - lufs) / 20)
  return Number.isFinite(g) ? Math.min(3, Math.max(0.4, g)) : 1
}
