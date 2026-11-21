import { describe, expect, it } from 'vitest'
import { parsePlayerctlLine, playerctlArgs } from './parse'

const line = (...f: string[]): string => f.join('\t')

describe('parsePlayerctlLine', () => {
  it('reads a playing track (MPRIS microseconds -> ms)', () => {
    const s = parsePlayerctlLine(line('Playing', '12500000', '215000000', 'Daft Punk', 'Digital Love', 'Discovery', 'https://i.scdn.co/image/abc', 'spotify'))
    expect(s).toEqual({ playing: true, idle: false, positionMs: 12500, durationMs: 215000, artist: 'Daft Punk', title: 'Digital Love', album: 'Discovery', artUrl: 'https://i.scdn.co/image/abc', player: 'spotify' })
  })
  it('handles paused, stopped and missing fields', () => {
    expect(parsePlayerctlLine(line('Paused', '', '', 'A', 'T', '', '', 'vlc'))).toMatchObject({ playing: false, idle: false, positionMs: 0, durationMs: 0, artUrl: null })
    expect(parsePlayerctlLine(line('Stopped', '', '', '', '', '', '', 'vlc'))).toMatchObject({ idle: true })
  })
  it('only trusts https artwork, not file:// or http', () => {
    expect(parsePlayerctlLine(line('Playing', '0', '1', 'A', 'T', '', 'file:///tmp/c.jpg', 'x'))!.artUrl).toBeNull()
    expect(parsePlayerctlLine(line('Playing', '0', '1', 'A', 'T', '', 'http://x/c.jpg', 'x'))!.artUrl).toBeNull()
  })
  it('ignores noise lines', () => {
    expect(parsePlayerctlLine('')).toBeNull()
    expect(parsePlayerctlLine('No players found')).toBeNull()
    expect(parsePlayerctlLine(line('Weird', '0', '0', 'a', 'b', 'c', 'd', 'e'))).toBeNull()
    expect(parsePlayerctlLine('Playing\t1\t2')).toBeNull()
  })
  it('copes with a bad number and a trailing newline', () => {
    expect(parsePlayerctlLine(line('Playing', 'abc', '-5', 'A', 'T', '', '', 'x') + '\r\n')).toMatchObject({ positionMs: 0, durationMs: 0 })
  })
})

describe('playerctlArgs', () => {
  it('maps transport commands', () => {
    expect(playerctlArgs({ type: 'toggle' })).toEqual(['play-pause'])
    expect(playerctlArgs({ type: 'next' })).toEqual(['next'])
    expect(playerctlArgs({ type: 'previous' })).toEqual(['previous'])
    expect(playerctlArgs({ type: 'seek', positionMs: 90500 })).toEqual(['position', '90.500'])
    expect(playerctlArgs({ type: 'volume', percent: 250 })).toEqual(['volume', '1.00'])
    expect(playerctlArgs({ type: 'shuffle' })).toBeNull()
    expect(playerctlArgs({ type: 'seek' })).toBeNull()
  })
})
