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
      fillWindow()
      setReady(true)
    })()
    const onResize = (): void => fillWindow()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // tell the main process the first picture of the song is on screen
  const hasTrack = usePlayer((s) => !!s.snapshot?.track)
  useEffect(() => {
    if (!ready || !hasTrack) return
    const t = setTimeout(() => {
      document.documentElement.dataset.captureReady = '1'
    }, 800)
    return () => clearTimeout(t)
  }, [ready, hasTrack])

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
