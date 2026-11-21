import type { FullLayout } from './types'

export type ResolvedAutoFullLayout = Exclude<FullLayout, 'auto'>

export interface FullscreenFlipSideState {
  layout: ResolvedAutoFullLayout
  lyricSideFlipped: boolean
}

/** Choose a fullscreen preset from the available viewport dimensions. */
export function resolveAutoFullLayout(width: number, height: number): ResolvedAutoFullLayout {
  if (width < 700 || height > width) return 'poster'
  const aspect = width / Math.max(1, height)
  if (aspect >= 2.1 || width <= 1100) return 'split'
  return 'cinema'
}

/** Resolve the active layout and the next lyric-side state for the fullscreen L shortcut. */
export function resolveFullscreenFlipSide(
  selectedLayout: FullLayout,
  width: number,
  height: number,
  lyricSideFlipped: boolean
): FullscreenFlipSideState {
  const layout = selectedLayout === 'auto' ? resolveAutoFullLayout(width, height) : selectedLayout
  return {
    layout,
    lyricSideFlipped: layout === 'split' ? !lyricSideFlipped : lyricSideFlipped
  }
}
