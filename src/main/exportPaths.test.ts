import { describe, expect, it } from 'vitest'
import { ExportPaths, validChunk } from './exportPaths'

describe('ExportPaths', () => {
  it('only knows paths the save dialog returned', () => {
    const p = new ExportPaths()
    p.allow(process.platform === 'win32' ? 'C:\\Users\\me\\Videos\\song.mp4' : '/home/me/song.mp4')
    expect(p.has(process.platform === 'win32' ? 'C:\\Users\\me\\Videos\\song.mp4' : '/home/me/song.mp4')).toBe(true)
    expect(p.has(process.platform === 'win32' ? 'C:\\Users\\me\\Documents\\wedding.mp4' : '/home/me/wedding.mp4')).toBe(false)
  })

  it('does not follow ../ out of a known folder', () => {
    const p = new ExportPaths()
    const base = process.platform === 'win32' ? 'C:\\Videos\\a.mp4' : '/v/a.mp4'
    p.allow(base)
    expect(p.has(process.platform === 'win32' ? 'C:\\Videos\\x\\..\\..\\Other\\b.mp4' : '/v/x/../../o/b.mp4')).toBe(false)
    expect(p.has(process.platform === 'win32' ? 'C:\\Videos\\x\\..\\a.mp4' : '/v/x/../a.mp4')).toBe(true)
  })

  it('rejects non-strings and forgets a path on request', () => {
    const p = new ExportPaths()
    p.allow('a.mp4')
    expect(p.has(42)).toBe(false)
    expect(p.has('')).toBe(false)
    p.forget('a.mp4')
    expect(p.has('a.mp4')).toBe(false)
  })

  it('keeps at most `max` paths', () => {
    const p = new ExportPaths(2)
    p.allow('a.mp4')
    p.allow('b.mp4')
    p.allow('c.mp4')
    expect(p.has('a.mp4')).toBe(false)
    expect(p.has('c.mp4')).toBe(true)
  })
})

describe('validChunk', () => {
  it('accepts bytes at a sane position', () => {
    expect(validChunk(0, new Uint8Array(10))).toBe(true)
  })
  it('refuses bad positions, empty or oversize chunks and non-bytes', () => {
    expect(validChunk(-1, new Uint8Array(1))).toBe(false)
    expect(validChunk(1.5, new Uint8Array(1))).toBe(false)
    expect(validChunk(Number.NaN, new Uint8Array(1))).toBe(false)
    expect(validChunk(2 ** 40, new Uint8Array(1))).toBe(false)
    expect(validChunk(0, new Uint8Array(0))).toBe(false)
    expect(validChunk(0, 'abc')).toBe(false)
    expect(validChunk(0, { byteLength: 5 })).toBe(false)
  })
})
