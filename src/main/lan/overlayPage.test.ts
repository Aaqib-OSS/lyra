import { describe, expect, it } from 'vitest'
import { buildManifest, safeToken } from './pwa'
import { OVERLAY_CORE_JS, OVERLAY_HTML } from './overlayPage'

// the overlay's runtime logic is plain JS in a string (the page has no build step); run it here to test it
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const core = new Function(
  OVERLAY_CORE_JS + '; return { LOOKS, LOOK_NAMES, lookFor, cleanColor, cleanFont, parseOptions, resolveLook, estimate, activeIndex, windowRange, wordProgress, positionAt, emptyFeed, applyState }'
)() as {
  LOOKS: Record<string, string>
  LOOK_NAMES: string[]
  lookFor: (v: unknown) => string
  parseOptions: (s: string) => any
  resolveLook: (o: unknown, appVibe: string | null) => string
  estimate: (ls: { timeMs: number; text: string }[], dur: number) => any[]
  activeIndex: (lines: unknown[], p: number) => number
  windowRange: (idx: number, count: number, total: number) => number[]
  wordProgress: (w: unknown, p: number) => number
  positionAt: (feed: unknown, now: number, nudge: number) => number
  emptyFeed: () => any
  applyState: (feed: unknown, m: unknown, now: number) => boolean
}

describe('vibe -> look mapping', () => {
  it('covers every vibe id with a known look', () => {
    const ids = ['none', 'sticker', 'chat', 'crt', 'neon', 'chrome', 'dream', 'paper', 'arcade', 'noir', 'sunset', 'blocks', 'stadium', 'cassette', 'trailer', 'sketch', 'glitch', 'comic', 'stencil', 'film', 'filmstrip', 'lock', 'wallet', 'route', 'editor', 'metro', 'web', 'lens', 'picto', 'wall', 'flap']
    for (const id of ids) expect(core.LOOK_NAMES).toContain(core.lookFor(id))
    expect(Object.keys(core.LOOKS).sort()).toEqual([...ids].sort())
  })
  it('falls back to classic for unknown ids, ignoring case', () => {
    expect(core.lookFor('nope')).toBe('classic')
    expect(core.lookFor('')).toBe('classic')
    expect(core.lookFor('NEON')).toBe('neon')
    expect(core.lookFor('constructor')).toBe('classic')
  })
})

describe('parseOptions', () => {
  it('has sane defaults', () => {
    const o = core.parseOptions('')
    expect(o).toMatchObject({ vibe: 'app', lines: 3, mode: 'stack', size: 64, scale: 1, bg: '', pos: 'bottom', align: 'center', shadow: true, words: true, meta: false })
  })
  it('reads chroma colours with or without #, rejects junk', () => {
    expect(core.parseOptions('?chroma=00ff00').bg).toBe('#00ff00')
    expect(core.parseOptions('?bg=%23F0F').bg).toBe('#f0f')
    expect(core.parseOptions('?bg=magenta').bg).toBe('magenta')
    expect(core.parseOptions('?bg=transparent').bg).toBe('')
    expect(core.parseOptions('?bg=red;}body{display:none').bg).toBe('')
    expect(core.parseOptions('?bg=url(x)').bg).toBe('')
  })
  it('clamps numbers and switches to single mode for one line', () => {
    expect(core.parseOptions('?size=9999').size).toBe(400)
    expect(core.parseOptions('?size=-3').size).toBe(12)
    expect(core.parseOptions('?size=abc').size).toBe(64)
    expect(core.parseOptions('?lines=1').mode).toBe('single')
    expect(core.parseOptions('?lines=99').lines).toBe(9)
    expect(core.parseOptions('?lines=1&mode=stack').mode).toBe('stack')
  })
  it('cleans fonts and booleans', () => {
    expect(core.parseOptions('?font=' + encodeURIComponent('Segoe UI; background:url(x)')).font).toBe('Segoe UI backgroundurlx')
    expect(core.parseOptions('?shadow=0').shadow).toBe(false)
    expect(core.parseOptions('?words=off').words).toBe(false)
    expect(core.parseOptions('?meta=1').meta).toBe(true)
  })
  it('resolves the look: look= beats vibe= beats the app vibe', () => {
    expect(core.resolveLook(core.parseOptions('?look=glitch&vibe=neon'), 'crt')).toBe('glitch')
    expect(core.resolveLook(core.parseOptions('?vibe=neon'), 'crt')).toBe('neon')
    expect(core.resolveLook(core.parseOptions(''), 'crt')).toBe('terminal')
    expect(core.resolveLook(core.parseOptions(''), null)).toBe('classic')
    expect(core.resolveLook(core.parseOptions('?look=bogus'), 'noir')).toBe('subtitle')
  })
})

describe('timing', () => {
  const ls = [
    { timeMs: 1000, text: 'Hello there world' },
    { timeMs: 5000, text: 'Second line' },
    { timeMs: 9000, text: '' }
  ]
  it('finds the active line', () => {
    const lines = core.estimate(ls, 20000)
    expect(core.activeIndex(lines, 0)).toBe(-1)
    expect(core.activeIndex(lines, 1000)).toBe(0)
    expect(core.activeIndex(lines, 4999)).toBe(0)
    expect(core.activeIndex(lines, 5000)).toBe(1)
    expect(core.activeIndex(lines, 99999)).toBe(2)
    expect(core.activeIndex([], 5)).toBe(-1)
  })
  it('spreads word timing inside the line window', () => {
    const lines = core.estimate(ls, 20000)
    const w = lines[0].words
    expect(w.map((x: { w: string }) => x.w)).toEqual(['Hello', 'there', 'world'])
    expect(w[0].from).toBe(1000)
    expect(w[2].to).toBeLessThanOrEqual(1000 + 7000 + 1)
    expect(w[1].from).toBeCloseTo(w[0].to, 5)
    expect(lines[2].words).toEqual([])
  })
  it('word progress is clamped', () => {
    const w = { w: 'a', from: 100, to: 200 }
    expect(core.wordProgress(w, 50)).toBe(0)
    expect(core.wordProgress(w, 150)).toBe(0.5)
    expect(core.wordProgress(w, 999)).toBe(1)
  })
  it('keeps a window of lines around the active one', () => {
    expect(core.windowRange(-1, 3, 10)).toEqual([0, 3])
    expect(core.windowRange(0, 3, 10)).toEqual([0, 3])
    expect(core.windowRange(4, 3, 10)).toEqual([3, 6])
    expect(core.windowRange(9, 3, 10)).toEqual([7, 10])
    expect(core.windowRange(4, 1, 10)).toEqual([4, 5])
    expect(core.windowRange(2, 5, 3)).toEqual([0, 3])
    expect(core.windowRange(0, 3, 0)).toEqual([0, 0])
  })
})

describe('feed', () => {
  it('extrapolates the position while playing, with the sender clock skew', () => {
    const feed = core.emptyFeed()
    core.applyState(feed, { type: 'state', now: 10_500, trackId: 'a', title: 'T', artists: 'A', durationMs: 1000, hasArt: true, playing: true, positionMs: 2000, sampledAt: 10_000 }, 1000)
    expect(feed.positionClock.skewMs).toBe(9500)
    expect(core.positionAt(feed, 1500, 0)).toBe(2000 + (1500 + 9500 - 10_000))
    expect(core.positionAt(feed, 1500, -5000)).toBe(0)
    feed.positionClock.playing = false
    expect(core.positionAt(feed, 5000, 100)).toBe(2100)
  })
  it('reports song changes and clears lyrics on a new song or silence', () => {
    const feed = core.emptyFeed()
    const m = { type: 'state', now: 1, trackId: 'a', title: 'T', artists: 'A', durationMs: 1, hasArt: false, playing: true, positionMs: 0, sampledAt: 1, vibe: 'neon' }
    expect(core.applyState(feed, m, 1)).toBe(true)
    expect(core.applyState(feed, m, 2)).toBe(false)
    expect(feed.nowPlaying.artUrl).toBeNull()
    expect(feed.vibe).toBe('neon')
    feed.lyrics = { status: 'synced', lines: [{ timeMs: 1, text: 'x' }] }
    expect(core.applyState(feed, { ...m, trackId: 'b' }, 3)).toBe(true)
    expect(feed.lyrics).toEqual({ status: 'loading', lines: [] })
    expect(core.applyState(feed, { ...m, trackId: '' }, 4)).toBe(true)
    expect(feed.nowPlaying).toBeNull()
  })
})

describe('pages', () => {
  it('the overlay is transparent by default and loads nothing external', () => {
    expect(OVERLAY_HTML).toContain('background: transparent')
    expect(OVERLAY_HTML).not.toMatch(/https?:\/\//)
    expect(OVERLAY_HTML).toContain('/events?k=')
  })
  it('manifest keeps the key in start_url and only accepts hex keys into pages', () => {
    const m = buildManifest({ token: 'ab12cd', iconSize: 512 }) as { start_url: string; icons: { sizes: string }[] }
    expect(m.start_url).toBe('/?k=ab12cd')
    expect(m.icons[0]!.sizes).toBe('512x512')
    expect(safeToken('ab12cd34')).toBe('ab12cd34')
    expect(safeToken('"><script>')).toBe('')
    expect(safeToken('')).toBe('')
  })
})
