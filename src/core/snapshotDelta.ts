/**
 * Should a fresh reading from a music source be pushed to the renderer? The renderer interpolates the position from the
 * last anchor, so a reading only matters when something changed or the interpolation has drifted (a seek, a stall).
 */

export interface DeltaSnap {
  positionMs: number
  sampledAt: number
  isPlaying: boolean
  isAdOrUnknown: boolean
}

/** Drift (ms) after which the renderer's clock is re-anchored; 1.2 s of drift left lyrics/video visibly out. */
export const REANCHOR_MS = 400

export function positionDrift(prev: DeltaSnap, next: DeltaSnap): number {
  const running = prev.isPlaying && !prev.isAdOrUnknown
  const predicted = prev.positionMs + (running ? Math.max(0, next.sampledAt - prev.sampledAt) : 0)
  return Math.abs(predicted - next.positionMs)
}

export function needsReanchor(prev: DeltaSnap | null, next: DeltaSnap, threshold = REANCHOR_MS): boolean {
  if (!prev) return true
  if (prev.isPlaying !== next.isPlaying || prev.isAdOrUnknown !== next.isAdOrUnknown) return true
  return positionDrift(prev, next) > threshold
}
