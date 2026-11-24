import { describe, expect, it } from 'vitest'
import { isOwnOutput, isTestOutput, outputSibling, sanitizeFileName, testFileName } from './studioPaths'

describe('studio output paths', () => {
  it('cleans the suggested name', () => {
    expect(sanitizeFileName('a/b:c*d?.mp4')).toBe('a-b-c-d-.mp4')
    expect(sanitizeFileName('Song - Artist (9x16 1080p)')).toBe('Song - Artist (9x16 1080p).mp4')
    expect(sanitizeFileName('')).toBe('lyra-video.mp4')
    expect(sanitizeFileName('CON.mp4')).toBe('lyra-video.mp4')
    expect(sanitizeFileName('trailing dots...')).toBe('trailing dots.mp4')
  })
  it('only lets the renderer touch files this session created', () => {
    const made = new Set(['c:\\videos\\a.mp4'])
    expect(isOwnOutput(made, 'C:\\Videos\\A.mp4')).toBe(true)
    expect(isOwnOutput(made, 'C:\\Videos\\other.mp4')).toBe(false)
    expect(isOwnOutput(made, 'C:\\Windows\\system32\\x.dll')).toBe(false)
    expect(isOwnOutput(made, 42)).toBe(false)
  })
  it('only treats lyra-test files in the temp folder as test clips', () => {
    const tmp = 'C:\\Users\\a\\AppData\\Local\\Temp'
    expect(isTestOutput(tmp, `${tmp}\\${testFileName(3)}`)).toBe(true)
    expect(isTestOutput(tmp, `${tmp}\\..\\x.mp4`)).toBe(false)
    expect(isTestOutput(tmp, 'C:\\Videos\\lyra-test-3.mp4')).toBe(false)
    expect(isTestOutput(tmp, `${tmp}\\sub\\lyra-test-3.mp4`)).toBe(false)
  })
  it('names files next to the video', () => {
    expect(outputSibling('C:\\v\\a.mp4', ' (cover)', 'jpg')).toBe('C:\\v\\a (cover).jpg')
    expect(outputSibling('C:\\v\\a.MP4', '', 'srt')).toBe('C:\\v\\a.srt')
    expect(outputSibling('C:\\v\\a.exe', '', 'srt')).toBeNull()
    expect(outputSibling('C:\\v\\a.mp4', '', '../x')).toBeNull()
  })
})
