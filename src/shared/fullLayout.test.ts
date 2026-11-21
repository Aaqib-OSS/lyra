import { describe, expect, it } from 'vitest'
import { resolveAutoFullLayout } from './fullLayout'
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

  it('supports flipping lyrics in Auto Split on ultra-wide viewports', () => {
    expect(resolveAutoFullLayout(3440, 1440)).toBe('split')
    expect(getFullscreenShortcutAction('L')).toEqual({ type: 'flip-side' })
  })

  it('uses Cinema for wide landscape windows', () => {
    expect(resolveAutoFullLayout(1920, 1080)).toBe('cinema')
    expect(resolveAutoFullLayout(1920, 1200)).toBe('cinema')
  })
})
