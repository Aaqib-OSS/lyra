/**
 * When may the app slow the page down? Pure rules, shared by the main process (Chromium throttling)
 * and the renderer (calm mode), so "covered by another app" can never stop the show again.
 *
 * - covered (another window on top, still on screen): the song is audible, so lyrics and the background video keep running
 * - minimized / hidden in the tray: nothing can be seen, so the page may be throttled (battery)
 * - nothing playing: calm, whatever the window state
 */
export interface WindowActivity {
  playing: boolean
  /** shown (not hidden to the tray) */
  visible: boolean
  minimized: boolean
  /** another window is on top of it; deliberately NOT a reason to stop anything */
  covered?: boolean
}

/** The window can actually be seen (possibly under other windows). */
export function onScreen(a: Pick<WindowActivity, 'visible' | 'minimized'>): boolean {
  return a.visible && !a.minimized
}

/** Chromium background throttling (timers, rAF, media) may be turned on. False while music plays in a window that is on screen. */
export function allowThrottling(a: WindowActivity): boolean {
  return !(a.playing && onScreen(a))
}

/** Endless decorative CSS animations pause. Covered windows are NOT calm while music plays. */
export function isCalm(a: { playing: boolean; hidden: boolean; exporting?: boolean }): boolean {
  return !a.playing || a.hidden || !!a.exporting
}
