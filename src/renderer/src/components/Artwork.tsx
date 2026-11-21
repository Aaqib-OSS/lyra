import { AnimatePresence, motion } from 'framer-motion'
import { useArtwork } from '@/hooks/useArtwork'
import { useReducedMotion } from '@/hooks/useMotion'
import { useEffect, useRef } from 'react'
import { KITS, drawDecor } from '@/lib/cardDoodles'
import { cardTheme, seeded } from '@/lib/shareCard'
import { Icon } from './Icon'

/** The cover wears the look: doodles from the look's own kit drawn over it, seeded by the song so every song gets its own set. */
function ArtDoodle({ vibe, seed }: { vibe: string; seed: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const th = cardTheme(vibe)
    const kit = KITS[th.kit ?? 'marker'] ?? KITS.marker!
    const css = getComputedStyle(document.documentElement)
    const accent = css.getPropertyValue('--accent').trim() || th.accentMarks
    ctx.clearRect(0, 0, cv.width, cv.height)
    ctx.scale(cv.width / 600, cv.height / 600)
    drawDecor(ctx, kit, { below: { y: 440, left: 20, right: 580 }, top: { x: 95, y: 95 }, bottom: { x: 505, y: 95 } }, th.accentMarks || accent, th.pen[1], seeded(seed))
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }, [vibe, seed])
  return <canvas ref={ref} width={600} height={600} className="artwork__doodle" aria-hidden />
}

interface Props {
  url: string | null
  size?: number | string
  radius?: number
  className?: string
  /** layoutId for shared-element transitions between widget sizes */
  layoutId?: string
  /** dress the cover in the look's doodles and effects (fullscreen scene looks) */
  doodle?: { vibe: string; seed: string; kit: string }
}

/** Album art with a soft crossfade between tracks and a graceful empty state. */
export function Artwork({ url, size, radius = 10, className = '', layoutId, doodle }: Props) {
  const src = useArtwork(url)
  const reduced = useReducedMotion()
  return (
    <motion.div
      layoutId={layoutId}
      className={`artwork ${className}`}
      data-kit={doodle?.kit}
      style={{ width: size, height: size, borderRadius: radius }}
      transition={{ type: 'spring', stiffness: 360, damping: 38 }}
    >
      <AnimatePresence initial={false}>
        {src ? (
          <motion.img
            key={src}
            src={src}
            alt=""
            draggable={false}
            className="artwork__img"
            initial={reduced ? false : { opacity: 0, scale: 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
          />
        ) : (
          <div key="empty" className="artwork__empty">
            <Icon name="note" size={typeof size === 'number' ? Math.round(size * 0.35) : 28} />
          </div>
        )}
      </AnimatePresence>
      {doodle && <ArtDoodle vibe={doodle.vibe} seed={doodle.seed} />}
      {className.includes('artwork--lift') && (
        <>
          <i className="artwork__deco artwork__deco--a" />
          <i className="artwork__deco artwork__deco--b" />
          <i className="artwork__deco artwork__deco--c" />
        </>
      )}
    </motion.div>
  )
}
