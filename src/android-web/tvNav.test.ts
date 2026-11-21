import { describe, expect, it } from 'vitest'
import { decide, nativeKey, pickNext, remoteKey, SEEK_MS, type Box } from './tvNav'

const box = (x: number, y: number, w = 100, h = 60): Box => ({ x, y, w, h })

describe('remoteKey', () => {
  it('maps D-pad, select, back and media keys', () => {
    expect(remoteKey({ key: 'ArrowLeft' })).toBe('left')
    expect(remoteKey({ key: 'Enter' })).toBe('select')
    expect(remoteKey({ key: 'MediaPlayPause' })).toBe('playpause')
    expect(remoteKey({ key: 'Escape' })).toBe('back')
    expect(remoteKey({ key: 'x' })).toBeNull()
  })
  it('knows the names the activity sends', () => {
    expect(nativeKey('ffwd')).toBe('ffwd')
    expect(nativeKey('bogus')).toBeNull()
  })
})

describe('decide', () => {
  it('with the controls hidden the D-pad is a shortcut pad', () => {
    expect(decide('select', false)).toEqual({ type: 'toggle' })
    expect(decide('right', false)).toEqual({ type: 'seek', ms: SEEK_MS })
    expect(decide('left', false)).toEqual({ type: 'seek', ms: -SEEK_MS })
    expect(decide('up', false)).toEqual({ type: 'look', dir: -1 })
    expect(decide('down', false)).toEqual({ type: 'look', dir: 1 })
  })
  it('with the controls shown the D-pad moves focus and OK presses', () => {
    expect(decide('right', true)).toEqual({ type: 'move', dir: 'right' })
    expect(decide('select', true)).toEqual({ type: 'pass' })
  })
  it('media keys never depend on the controls', () => {
    for (const shown of [true, false]) {
      expect(decide('playpause', shown)).toEqual({ type: 'toggle' })
      expect(decide('next', shown)).toEqual({ type: 'track', dir: 1 })
      expect(decide('rew', shown)).toEqual({ type: 'seek', ms: -SEEK_MS })
    }
  })
})

describe('pickNext', () => {
  const prev = box(100, 500)
  const play = box(300, 500)
  const next = box(500, 500)
  const like = box(300, 300)
  const all = [prev, play, next, like]
  it('moves along a row', () => {
    expect(pickNext(all, play, 'right')).toBe(next)
    expect(pickNext(all, play, 'left')).toBe(prev)
  })
  it('moves between rows', () => {
    expect(pickNext(all, play, 'up')).toBe(like)
    expect(pickNext(all, like, 'down')).toBe(play)
  })
  it('stays put at an edge', () => {
    expect(pickNext(all, next, 'right')).toBeNull()
    expect(pickNext(all, like, 'up')).toBeNull()
  })
  it('prefers the control straight ahead over one far off to the side', () => {
    const ahead = box(300, 100)
    const aside = box(900, 200)
    expect(pickNext([play, ahead, aside], play, 'up')).toBe(ahead)
  })
  it('starts at the first control in reading order', () => {
    expect(pickNext(all, null, 'down')).toBe(like)
    expect(pickNext([], null, 'down')).toBeNull()
  })
})
