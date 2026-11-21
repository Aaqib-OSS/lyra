import { describe, expect, it } from 'vitest'
import { resolveAutoFullLayout, resolveFullscreenFlipSide } from './fullLayout'
import { getFullscreenShortcutAction } from './shortcuts'

describe('resolveAutoFullLayout', () => {
  it('uses Poster for narrow and portrait windows', () => {
    expect(resolveAutoFullLayout(699, 900)).toBe('poster')
    expect(resolveAutoFullLayout(900, 1200)).toBe('poster')
  })

  it('uses Split for medium landscape windows', () => {
    expect(resolveAutoFullLayout(900, 700)).toBe('split')
    expect(resolveAutoFullLayout(1100, 700)).toBe('split')
  })

  it('uses Split for ultra-wide windows', () => {
    expect(resolveAutoFullLayout(3440, 1440)).toBe('split')
    expect(resolveAutoFullLayout(2560, 1080)).toBe('split')
  })

  it('resolves Auto to Split and flips the lyric side for the L shortcut', () => {
    const action = getFullscreenShortcutAction('L')
    expect(action).toEqual({ type: 'flip-side' })
    const before = false
    const after = resolveFullscreenFlipSide('auto', 3440, 1440, before)
    expect(after.layout).toBe('split')
    expect(after.lyricSideFlipped).toBe(!before)
  })

  it('does not flip the lyric side outside Split layout', () => {
    expect(resolveFullscreenFlipSide('auto', 1920, 1080, false)).toEqual({
      layout: 'cinema',
      lyricSideFlipped: false
    })
  })

  it('uses Cinema for wide landscape windows', () => {
    expect(resolveAutoFullLayout(1920, 1080)).toBe('cinema')
    expect(resolveAutoFullLayout(1920, 1200)).toBe('cinema')
  })
})
