import { useEffect, useState, type ReactElement } from 'react'
import { MotionConfig, motion } from 'framer-motion'
import { Backdrop } from '@/components/Backdrop'
import { VibeFx } from '@/components/VibeFx'
import { EdgeFx } from '@/components/EdgeFx'
import { FullscreenPlayer } from '@/components/FullscreenPlayer'
import { useThemeVars } from '@/App'
import { fillWindow, shell } from '@/lib/shell'
import { useLyrics } from '@/store/lyrics'
import { usePlayer } from '@/store/player'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import type { Vibe } from '@shared/types'

/** Is this page the hidden window that shows the lyrics screen for a lyric-video export? (see startUi in the main process) */
export const isCapturePage = (): boolean => new URLSearchParams(location.search).get('capture') === '1'

// A hidden off-screen window can report itself as "hidden", which would make the app pause its endless animations
// ("calm") and its video background. This page is always being filmed: it is always visible.
if (isCapturePage()) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
}

/** Fill the window; if the main process could not zoom the page (see startUi) it asks for a CSS zoom instead. */
function fillCapture(): void {
  fillWindow()
  const z = (window as unknown as { __lyraCaptureZoom?: number }).__lyraCaptureZoom ?? 1
  document.documentElement.style.zoom = z !== 1 ? String(z) : ''
  if (z !== 1) {
    shell.width.set(window.innerWidth / z)
    shell.height.set(window.innerHeight / z)
  }
}

/**
 * The lyrics screen and nothing else: the same look, cover colours, moving background and lyrics as the app window, filling
 * a hidden window of the export's size. It only listens (settings, song, lyrics): it never changes a setting, never moves the
 * real window and never answers a key, so it can not disturb the player while a video is being made.
 */
export function CaptureApp(): ReactElement | null {
  const [ready, setReady] = useState(false)
  const settings = useSettings((s) => s.settings)
  useThemeVars()

  useEffect(() => {
    void (async () => {
      await useSettings.getState().init()
      await usePlayer.getState().init()
      useLyrics.getState().init()
      const ui = useUi.getState()
      ui.setMode('full')
      // the look the app window shows right now (a vibe picked with V is temporary and not in the settings)
      const want = new URLSearchParams(location.search).get('vibe')
      if (want && /^[a-z0-9-]{2,30}$/.test(want)) ui.setVibeNow(want as Vibe, 'export')
      if (!ui.distractionFree) ui.toggleDistractionFree() // artwork and lyrics only: no buttons in the video
      fillCapture()
      setReady(true)
    })()
    const onResize = (): void => fillCapture()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // tell the main process the first picture of the song is on screen: the song is known, its lyrics have been looked
  // up (or the wait ran out) and the fonts are loaded, so the first frames of the video are not an empty screen
  const hasTrack = usePlayer((s) => !!s.snapshot?.track)
  const lyricsPhase = useLyrics((s) => s.state.phase)
  const [waited, setWaited] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 6000)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    if (!ready || !hasTrack || (lyricsPhase !== 'ready' && !waited)) return
    let cancelled = false
    const t = setTimeout(() => {
      void (document.fonts?.ready ?? Promise.resolve()).then(() => {
        if (cancelled) return
        fillCapture() // the zoom may have arrived after the first layout
        requestAnimationFrame(() => {
          document.documentElement.dataset.captureReady = '1'
        })
      })
    }, 600)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [ready, hasTrack, lyricsPhase, waited])

  if (!ready) return null
  return (
    <MotionConfig reducedMotion="never">
      <div className="root capture" data-theme={settings.theme} data-mode="full" style={{ ['--alpha' as string]: 1 }}>
        <motion.div className="shell" style={{ x: shell.x, y: shell.y, width: shell.width, height: shell.height }}>
          <Backdrop rich animated />
          <VibeFx />
          <EdgeFx />
          <div className="content">
            <FullscreenPlayer />
          </div>
        </motion.div>
      </div>
    </MotionConfig>
  )
}
