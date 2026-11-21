import { useMemo } from 'react'
import { useEffectiveVibe } from '@/hooks/useVibe'

/** Background effects of the active vibe. Pure decoration: sits behind the content and never takes input. */
export function VibeFx() {
  const { vibe } = useEffectiveVibe()
  const sparkles = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        x: (i * 37 + 11) % 100,
        y: (i * 53 + 7) % 100,
        s: 10 + ((i * 7) % 18),
        d: (i * 0.37) % 3
      })),
    []
  )
  if (vibe === 'none') return null
  return (
    <div className={`vibefx vibefx--${vibe}`} aria-hidden="true">
      <i className="vibeflash" key={vibe} />
      {vibe === 'arcade' && (
        <>
          <div className="vibefx__hud"><span>1UP</span><span className="vibefx__score" /><span>HI 099950</span></div>
          <div className="vibefx__stars" />
          <div className="vibefx__stars vibefx__stars--b" />
        </>
      )}
      {vibe === 'noir' && (
        <>
          <div className="vibefx__bar vibefx__bar--t" />
          <div className="vibefx__bar vibefx__bar--b" />
          <div className="vibefx__dust" />
        </>
      )}
      {vibe === 'paper' && <div className="vibefx__lines" />}
      {vibe === 'neon' && (
        <>
          <div className="vibefx__sun" />
          <div className="vibefx__grid" />
        </>
      )}
      {vibe === 'crt' && <div className="vibefx__scan" />}
      {vibe === 'dream' && (
        <>
          <i className="vibefx__orb vibefx__orb--a" />
          <i className="vibefx__orb vibefx__orb--b" />
          <i className="vibefx__orb vibefx__orb--c" />
        </>
      )}
      {vibe === 'chrome' &&
        sparkles.map((p, i) => (
          <svg key={i} className="vibefx__spark" viewBox="-12 -12 24 24" style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s, animationDelay: `${p.d}s` }}>
            <path d="M0 -11 C1 -3 3 -1 11 0 C3 1 1 3 0 11 C-1 3 -3 1 -11 0 C-3 -1 -1 -3 0 -11Z" />
          </svg>
        ))}
      {vibe === 'sticker' && <div className="vibefx__dots" />}
    </div>
  )
}
