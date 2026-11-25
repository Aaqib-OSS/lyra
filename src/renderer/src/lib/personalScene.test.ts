import { describe, expect, it } from 'vitest'
import { matchScene } from './personalScene'
import type { PersonalScene, Track } from '@shared/types'

describe('matchScene', () => {
  const s: PersonalScene = { id: 'x', match: { title: 'Her', artist: 'JVKE' }, pageUrl: 'lyra-media://personal/x/files/web/index.html' }
  const t = (title: string, artists: string[]): Track => ({ title, artists }) as Track
  it('matches the song ignoring case and brackets', () => {
    expect(matchScene([s], t('her', ['JVKE']))).toBe(s)
    expect(matchScene([s], t('Her (Remastered)', ['jvke']))).toBe(s)
    expect(matchScene([s], t('her', ['Someone', 'JVKE']))).toBe(s)
  })
  it('does not match another song or no song', () => {
    expect(matchScene([s], t('hers', ['JVKE']))).toBeNull()
    expect(matchScene([s], t('her', ['Someone else']))).toBeNull()
    expect(matchScene([s], null)).toBeNull()
    expect(matchScene([], t('her', ['JVKE']))).toBeNull()
  })
})
