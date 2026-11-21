import { useEffect, useRef } from 'react'
import { pickVibe, stepVibe, vibeInfo } from '@shared/vibes'
import type { LyricStyle, Settings, Vibe } from '@shared/types'
import { useLyrics } from '@/store/lyrics'
import { usePlayer } from '@/store/player'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'

/** The vibe and lyric style in effect: the saved choice, or the one picked for this song by cycle / smart mode. */
export function effectiveVibe(s: Settings, vibeNow: Vibe | null): { vibe: Vibe; style: LyricStyle } {
  const vibe = s.vibeMode === 'fixed' || !vibeNow ? s.vibe : vibeNow
  const style = vibe === 'none' ? s.lyricStyle : s.vibeMode === 'fixed' && vibe === s.vibe ? s.lyricStyle : vibeInfo(vibe).style
  return { vibe, style }
}

export function useEffectiveVibe(): { vibe: Vibe; style: LyricStyle } {
  const s = useSettings((x) => x.settings)
  const now = useUi((x) => x.vibeNow)
  return effectiveVibe(s, now)
}

/** Jump to the next / previous vibe of the pool right now (the V key). */
export function cycleVibe(dir: 1 | -1 = 1): void {
  const { settings, set } = useSettings.getState()
  const ui = useUi.getState()
  const current = effectiveVibe(settings, ui.vibeNow).vibe
  const next = stepVibe(current, settings.vibePool, dir)
  const info = vibeInfo(next)
  if (settings.vibeMode === 'fixed') set({ vibe: next, lyricStyle: info.style })
  else ui.setVibeNow(next, 'picked by you')
  ui.toast(`Vibe · ${info.name}`)
}

/** HSL of a CSS colour string (works with the computed rgb() the browser returns for the animated accent). */
function hslOf(css: string): { hue: number; sat: number; light: number } | null {
  const m = css.match(/\d+(\.\d+)?/g)
  if (!m || m.length < 3) return null
  const [r, g, b] = m.slice(0, 3).map((x) => Number(x) / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { hue: 0, sat: 0, light: l }
  const sat = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { hue: (h * 60 + 360) % 360, sat, light: l }
}

/**
 * Watches the song and, in cycle or smart mode, chooses the vibe for it.
 *  - cycle: every new song moves on to the next vibe of the pool
 *  - smart: the song's words, pace, age and cover colours pick the vibe (once lyrics are in, or after 1.5 s)
 */
export function useVibeConductor(): void {
  const mode = useSettings((s) => s.settings.vibeMode)
  const track = usePlayer((s) => s.snapshot?.track ?? null)
  const lyrics = useLyrics((s) => s.state)
  const lastCycle = useRef<string | null>(null)
  const lastSmart = useRef<string | null>(null)
  const id = track?.id ?? null

  // cycle
  useEffect(() => {
    if (mode !== 'cycle' || !id) return
    if (lastCycle.current === id) return
    const { settings } = useSettings.getState()
    const ui = useUi.getState()
    const cur = effectiveVibe(settings, ui.vibeNow).vibe
    // the very first song keeps the vibe you chose; every later song moves on
    const next = lastCycle.current === null && ui.vibeNow === null && settings.vibe !== 'none' ? settings.vibe : stepVibe(cur, settings.vibePool, 1)
    lastCycle.current = id
    ui.setVibeNow(next, 'next in your cycle')
    if (next !== cur) ui.toast(`Vibe · ${vibeInfo(next).name}`)
  }, [mode, id])

  // smart
  useEffect(() => {
    if (mode !== 'smart' || !track) return
    if (lastSmart.current === track.id) return
    const ready = lyrics.phase === 'ready' && lyrics.result.trackId === track.id
    const decide = (): void => {
      if (lastSmart.current === track.id) return
      lastSmart.current = track.id
      const res = usePlayer.getState().snapshot?.track?.id === track.id && lyrics.phase === 'ready' ? lyrics.result : null
      const lines = res?.status === 'synced' ? res.lines : []
      const plain = res?.status === 'plain' ? (res.plain ?? '').split('\n') : []
      const hsl = hslOf(getComputedStyle(document.documentElement).getPropertyValue('--accent'))
      const pool = useSettings.getState().settings.vibePool
      const pick = pickVibe(
        {
          title: track.title,
          artists: track.artists,
          year: track.releaseYear,
          lines: lines.length ? lines.map((l) => l.text) : plain,
          lineTimes: lines.map((l) => l.timeMs),
          durationMs: track.durationMs,
          ...(hsl ?? {})
        },
        pool
      )
      const ui = useUi.getState()
      const was = ui.vibeNow
      ui.setVibeNow(pick.vibe, pick.why)
      if (pick.vibe !== was) ui.toast(`Vibe · ${vibeInfo(pick.vibe).name} (${pick.why})`)
    }
    if (ready) {
      const t = setTimeout(decide, 350) // let the cover colours settle first
      return () => clearTimeout(t)
    }
    const t = setTimeout(decide, 1500)
    return () => clearTimeout(t)
  }, [mode, track, lyrics])

  // leaving cycle / smart mode drops the temporary pick
  useEffect(() => {
    if (mode === 'fixed') {
      useUi.getState().setVibeNow(null)
      lastCycle.current = null
      lastSmart.current = null
    }
  }, [mode])
}
