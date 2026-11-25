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

const scene = (name: string, cfg: Record<string, unknown>, files: Record<string, string> = { 'v.mp4': 'x'.repeat(100) }): void => {
  mkdirSync(join(dir, name), { recursive: true })
  for (const [f, body] of Object.entries(files)) writeFileSync(join(dir, name, f), body)
  writeFileSync(join(dir, name, 'config.json'), JSON.stringify(cfg))
}
const good = { match: { title: 'A song', artist: 'An artist' }, videoAnchors: [[10, 0], [20, 10]], video: 'v.mp4' }

describe('personal scenes', () => {
  it('finds nothing when the folder does not exist, so Lyra works as it always did', () => {
    rmSync(dir, { recursive: true, force: true })
    expect(personalScenes()).toEqual([])
  })

  it('reads a scene: which song, how the video lines up, and where its files are served', () => {
    scene('mine', good)
    const [s] = personalScenes()
    expect(s?.id).toBe('mine')
    expect(s?.match).toEqual({ title: 'A song', artist: 'An artist' })
    expect(s?.anchors).toEqual([[10, 0], [20, 10]])
    expect(s?.videoUrl).toBe('lyra-media://personal/mine/video')
    expect(s?.artUrl).toBeNull()
    expect(personalFile('mine', 'video')).toMatch(/v\.mp4$/)
    expect(personalFile('mine', 'art')).toBeNull()
  })

  it('skips a scene whose config or video is missing or wrong', () => {
    scene('no-video', { ...good, video: 'missing.mp4' })
    scene('one-anchor', { ...good, videoAnchors: [[1, 1]] })
    scene('not-json', good)
    writeFileSync(join(dir, 'not-json', 'config.json'), '{ nope')
    expect(personalScenes()).toEqual([])
  })

  it('never serves a file outside the scene folder or of another kind', () => {
    scene('mine', good)
    writeFileSync(join(dir, 'secret.mp4'), 'secret')
    scene('escape', { ...good, video: '../secret.mp4' })
    scene('abs', { ...good, video: join(dir, 'secret.mp4') })
    scene('wrong-kind', { ...good, video: 'v.txt' }, { 'v.txt': 'x' })
    expect(personalScenes().map((x) => x.id)).toEqual(['mine'])
    expect(personalFile('escape', 'video')).toBeNull()
    expect(personalFile('mine', 'passwd')).toBeNull()
    expect(personalFile('..', 'video')).toBeNull()
  })
})

describe('fileResponse', () => {
  const body = Buffer.from(Array.from({ length: 100 }, (_, i) => i))
  const file = (): string => {
    const f = join(dir, 'f.mp4')
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
})
