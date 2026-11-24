import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from './types'
import { changedFromDefault, exportSettings, parseSettingsImport, SETTING_LABELS } from './settingsIo'

const make = (p: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...p })

describe('settings export / import', () => {
  it('never exports the account id, window place or per-song picks', () => {
    const text = exportSettings(make({ spotifyClientId: 'secret-client', position: { x: 1, y: 2 }, songVibes: { a: 'neon' }, vibe: 'neon' }))
    expect(text).not.toContain('secret-client')
    expect(text).not.toContain('position')
    expect(text).not.toContain('songVibes')
    expect(text).toContain('neon')
  })

  it('round-trips', () => {
    const r = parseSettingsImport(exportSettings(make({ vibe: 'neon', opacity: 0.7, alwaysOnTop: false })))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.patch).toMatchObject({ vibe: 'neon', opacity: 0.7, alwaysOnTop: false })
  })

  it('ignores unknown keys, excluded keys and values of the wrong kind', () => {
    const r = parseSettingsImport('{"app":"lyra-settings","settings":{"evil":1,"spotifyClientId":"x","opacity":"high","vibe":"neon","__proto__":{"a":1}}}')
    expect(r.ok && Object.keys(r.patch)).toEqual(['vibe'])
  })

  it('rejects junk, empty and oversized text without throwing', () => {
    expect(parseSettingsImport('').ok).toBe(false)
    expect(parseSettingsImport('{nope').ok).toBe(false)
    expect(parseSettingsImport('[1,2]').ok).toBe(false)
    expect(parseSettingsImport('{"hello":1}').ok).toBe(false)
    expect(parseSettingsImport('x'.repeat(70000)).ok).toBe(false)
  })
})

describe('changed from default', () => {
  it('is empty for the defaults and names what changed', () => {
    expect(changedFromDefault(DEFAULT_SETTINGS)).toEqual([])
    const out = changedFromDefault(make({ opacity: 0.5, volumeFade: true }))
    expect(out.map((c) => c.key).sort()).toEqual(['opacity', 'volumeFade'])
    expect(out.find((c) => c.key === 'volumeFade')?.value).toBe('On')
    expect(out.find((c) => c.key === 'opacity')?.value).toBe('50%')
  })

  it('only labels real settings', () => {
    for (const k of Object.keys(SETTING_LABELS)) expect(k in DEFAULT_SETTINGS).toBe(true)
  })
})
