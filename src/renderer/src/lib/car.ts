// Pure logic for Car mode (no React, no DOM): which three lines to show and how big the current one may be.

export interface CarLines {
  prev: string
  current: string
  next: string
}

const clean = (s: string | undefined): string => (s ?? '').trim()

/** The three lines of the car view. A blank line (an instrumental gap) shows as a music note so the screen never looks broken. */
export function carLines(lines: ReadonlyArray<{ text: string }>, idx: number): CarLines {
  const at = (i: number): string => {
    const l = lines[i]
    if (!l) return ''
    return clean(l.text) || '♪'
  }
  if (idx < 0) return { prev: '', current: lines.length ? '♪' : '', next: at(0) }
  return { prev: at(idx - 1), current: at(idx), next: at(idx + 1) }
}

export type LengthClass = 'xs' | 's' | 'm' | 'l'

/** Longer lines get a smaller (never below the 24 px floor) type size so every line fits without scrolling. */
export function lengthClass(text: string): LengthClass {
  const n = [...text].length
  if (n <= 24) return 'xs'
  if (n <= 44) return 's'
  if (n <= 72) return 'm'
  return 'l'
}

/**
 * Car mode is for passengers or a parked car. The app cannot know whether the car is moving, so it never opens by
 * itself: it is offered when the phone is docked in a car (UI mode car) and entered only by an explicit tap.
 */
export function shouldOfferCarMode(dock: boolean, on: boolean): boolean {
  return dock && !on
}

/** Night palette unless the system / car says it is day. Unknown → night (dark, low glare is the safe default). */
export function carIsNight(nativeNight: boolean | null | undefined, prefersLight: boolean): boolean {
  if (typeof nativeNight === 'boolean') return nativeNight
  return !prefersLight
}
