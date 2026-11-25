import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fileResponse, personalFile, personalScenes } from './personal'

let dir = ''
const prev = process.env['LYRA_PERSONAL_DIR']
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lyra-personal-'))
  process.env['LYRA_PERSONAL_DIR'] = dir
})
afterEach(() => {
  if (prev === undefined) delete process.env['LYRA_PERSONAL_DIR']
  else process.env['LYRA_PERSONAL_DIR'] = prev
  rmSync(dir, { recursive: true, force: true })
})

const scene = (name: string, cfg: Record<string, unknown>, files: Record<string, string> = { 'web/index.html': '<p>hi</p>' }): void => {
  mkdirSync(join(dir, name), { recursive: true })
  for (const [f, body] of Object.entries(files)) {
    mkdirSync(join(dir, name, f, '..'), { recursive: true })
    writeFileSync(join(dir, name, f), body)
  }
  writeFileSync(join(dir, name, 'config.json'), JSON.stringify(cfg))
}
const good = { match: { title: 'A song', artist: 'An artist' } }

describe('personal scenes', () => {
  it('finds nothing when the folder does not exist, so Lyra works as it always did', () => {
    rmSync(dir, { recursive: true, force: true })
    expect(personalScenes()).toEqual([])
  })

  it('reads a scene: which song, and where its page is served from', () => {
    scene('mine', good)
    const [s] = personalScenes()
    expect(s?.id).toBe('mine')
    expect(s?.match).toEqual({ title: 'A song', artist: 'An artist' })
    expect(s?.pageUrl).toBe('lyra-media://personal/mine/files/web/index.html')
  })

  it('uses the page named in the config', () => {
    scene('mine', { ...good, page: 'x/my page.html' }, { 'x/my page.html': '<p/>' })
    expect(personalScenes()[0]?.pageUrl).toBe('lyra-media://personal/mine/files/x/my%20page.html')
  })

  it('skips a scene whose config or page is missing or wrong', () => {
    scene('no-page', { ...good, page: 'missing.html' })
    scene('page-is-not-html', { ...good, page: 'a.js' }, { 'a.js': 'x' })
    scene('no-match', {})
    scene('not-json', good)
    writeFileSync(join(dir, 'not-json', 'config.json'), '{ nope')
    expect(personalScenes()).toEqual([])
  })

  it('serves files only from inside the scene folder and only of a known type', () => {
    scene('mine', good, { 'web/index.html': '<p/>', 'web/a.css': 'x', 'media/v.mp4': 'xx', 'web/run.exe': 'x', 'config.json': '{}' })
    writeFileSync(join(dir, 'secret.html'), 'secret')
    expect(personalFile('mine', 'web/a.css')).toMatch(/a\.css$/)
    expect(personalFile('mine', 'media/v.mp4')).toMatch(/v\.mp4$/)
    expect(personalFile('mine', '../secret.html')).toBeNull()
    expect(personalFile('mine', 'web/../../secret.html')).toBeNull()
    expect(personalFile('mine', 'web/run.exe')).toBeNull()
    expect(personalFile('mine', 'web/missing.css')).toBeNull()
    expect(personalFile('..', 'secret.html')).toBeNull()
    expect(personalFile('nope', 'web/a.css')).toBeNull()
  })
})

describe('fileResponse', () => {
  const body = Buffer.from(Array.from({ length: 100 }, (_, i) => i))
  const file = (name = 'f.mp4'): string => {
    const f = join(dir, name)
    writeFileSync(f, body)
    return f
  }
  it('answers a whole-file request and says it can be asked for parts', async () => {
    const r = fileResponse(file(), null)
    expect(r.status).toBe(200)
    expect(r.headers.get('accept-ranges')).toBe('bytes')
    expect(Buffer.from(await r.arrayBuffer()).equals(body)).toBe(true)
  })
  it('answers a Range request with 206 and the right bytes', async () => {
    const r = fileResponse(file(), 'bytes=10-19')
    expect(r.status).toBe(206)
    expect(r.headers.get('content-range')).toBe('bytes 10-19/100')
    expect(Buffer.from(await r.arrayBuffer()).equals(body.subarray(10, 20))).toBe(true)
  })
  it('answers open-ended and suffix ranges, and rejects one past the end', async () => {
    expect(Buffer.from(await fileResponse(file(), 'bytes=90-').arrayBuffer()).equals(body.subarray(90))).toBe(true)
    expect(Buffer.from(await fileResponse(file(), 'bytes=-5').arrayBuffer()).equals(body.subarray(95))).toBe(true)
    expect(fileResponse(file(), 'bytes=100-').status).toBe(416)
  })
  it('keeps a page inside Lyra: its policy allows only the media scheme and no frames', () => {
    const csp = fileResponse(file('p.html'), null).headers.get('content-security-policy') ?? ''
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain('connect-src lyra-media:')
    expect(csp).toContain("frame-src 'none'")
    expect(csp).not.toMatch(/https?:/)
    expect(fileResponse(file('a.css'), null).headers.get('content-security-policy')).toBeNull()
  })
})
