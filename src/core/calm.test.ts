import { describe, expect, it } from 'vitest'
import { allowThrottling, isCalm } from './calm'

describe('allowThrottling', () => {
  const base = { playing: true, visible: true, minimized: false }
  it('never throttles a playing window on screen, covered or not', () => {
    expect(allowThrottling(base)).toBe(false)
    expect(allowThrottling({ ...base, covered: true })).toBe(false)
  })
  it('throttles when minimized, hidden or nothing plays', () => {
    expect(allowThrottling({ ...base, minimized: true })).toBe(true)
    expect(allowThrottling({ ...base, visible: false })).toBe(true)
    expect(allowThrottling({ ...base, playing: false })).toBe(true)
  })
})

describe('isCalm', () => {
  it('is not calm while playing and visible', () => expect(isCalm({ playing: true, hidden: false })).toBe(false))
  it('is calm when paused, hidden or exporting', () => {
    expect(isCalm({ playing: false, hidden: false })).toBe(true)
    expect(isCalm({ playing: true, hidden: true })).toBe(true)
    expect(isCalm({ playing: true, hidden: false, exporting: true })).toBe(true)
  })
})
