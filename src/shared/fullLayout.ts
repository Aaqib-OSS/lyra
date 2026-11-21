import type { FullLayout } from './types'

export type ResolvedAutoFullLayout = Exclude<FullLayout, 'auto'>

/** Choose a fullscreen preset from the available viewport dimensions. */
export function resolveAutoFullLayout(width: number, height: number): ResolvedAutoFullLayout {
  if (width < 700 || height > width) return 'poster'
  const aspect = width / Math.max(1, height)
  if (aspect >= 2.1 || width <= 1100) return 'split'
  return 'cinema'
}
