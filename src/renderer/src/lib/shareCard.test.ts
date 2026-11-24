import { describe, expect, it } from 'vitest'
import { ALL_VIBES } from '@shared/vibes'
import { KIT_OF, THEMES, cardTheme } from './shareCard'
import { KITS } from './cardDoodles'

describe('share card themes', () => {
  it('gives every look (except the plain artwork one) its own paper and doodle kit', () => {
    for (const id of ALL_VIBES) {
      if (id === 'none') continue
      expect(THEMES[id], `THEMES.${id}`).toBeDefined()
      expect(KIT_OF[id], `KIT_OF.${id}`).toBeDefined()
    }
  })
  it('only names kits that exist', () => {
    for (const [id, kit] of Object.entries(KIT_OF)) expect(Object.keys(KITS), `kit of ${id}`).toContain(kit)
  })
  it('has no entry for a look that no longer exists', () => {
    for (const id of [...Object.keys(THEMES), ...Object.keys(KIT_OF)]) expect(ALL_VIBES).toContain(id)
  })
  it('falls back to the dark card with the marker kit for an unknown look', () => {
    const t = cardTheme('nope')
    expect(t.kit).toBe('marker')
    expect(t.bg).toBe('#050505')
  })
})

describe('share card formats', () => {
  it('keeps story 9:16, portrait 4:5 and square 1:1 at 1080 wide', async () => {
    const { FORMAT_H, CARD_W } = await import('./shareCard')
    expect(FORMAT_H.story / CARD_W).toBeCloseTo(16 / 9, 2)
    expect(FORMAT_H.portrait / CARD_W).toBeCloseTo(5 / 4, 2)
    expect(FORMAT_H.square).toBe(CARD_W)
  })
})
