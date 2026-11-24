import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let dir = ''
vi.mock('electron', () => ({ app: { getPath: () => dir } }))
vi.mock('./logger', () => ({ createLogger: () => ({ warn: () => undefined, error: () => undefined, info: () => undefined, debug: () => undefined }) }))

import { JsonStore } from './jsonStore'

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lyra-store-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('JsonStore recovery', () => {
  it('writes atomically and reads back', () => {
    const a = new JsonStore('s.json', { n: 1 }, true)
    a.set({ n: 2 })
    a.flush()
    expect(existsSync(join(dir, 's.json.tmp'))).toBe(false)
    expect(new JsonStore('s.json', { n: 1 }, true).get()).toEqual({ n: 2 })
  })

  it('keeps a broken file and restores the last good copy', () => {
    const a = new JsonStore('s.json', { n: 1 }, true)
    a.set({ n: 2 })
    a.flush()
    a.set({ n: 3 })
    a.flush() // the previous file (n = 2) is now the backup
    writeFileSync(join(dir, 's.json'), '{ broken')
    const b = new JsonStore('s.json', { n: 1 }, true)
    expect(b.get()).toEqual({ n: 2 })
    expect(readFileSync(join(dir, 's.json.corrupt'), 'utf8')).toBe('{ broken')
    b.flush() // must not replace the good backup with the broken file
    expect(JSON.parse(readFileSync(join(dir, 's.json.bak'), 'utf8'))).toEqual({ n: 2 })
  })

  it('falls back to the defaults when there is no usable backup', () => {
    writeFileSync(join(dir, 's.json'), 'nope')
    expect(new JsonStore('s.json', { n: 1 }, true).get()).toEqual({ n: 1 })
  })

  it('does not keep extra copies for stores that did not ask for them', () => {
    const a = new JsonStore('h.json', { n: 1 })
    a.set({ n: 2 })
    a.flush()
    a.set({ n: 3 })
    a.flush()
    expect(existsSync(join(dir, 'h.json.bak'))).toBe(false)
  })
})
