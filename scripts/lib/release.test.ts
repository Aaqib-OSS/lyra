import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs helper shared with scripts/release.mjs
import * as r from './release.mjs'

describe('versions', () => {
  it('compares numbers as numbers (0.9.0 < 0.10.1)', () => {
    expect(r.compareSemver('0.9.0', '0.10.1')).toBe(-1)
    expect(r.compareSemver('0.10.1', '0.9.9')).toBe(1)
    expect(r.compareSemver('1.0.0', '1.0.0')).toBe(0)
  })
  it('ranks a pre-release below its release and orders identifiers', () => {
    expect(r.compareSemver('0.4.0-beta.1', '0.4.0')).toBe(-1)
    expect(r.compareSemver('0.4.0-beta.2', '0.4.0-beta.10')).toBe(-1)
    expect(r.compareSemver('0.4.0-1', '0.4.0-alpha')).toBe(-1)
  })
  it('parses tags with a prefix, rejects partial versions', () => {
    expect(r.parseSemver('android-v0.12.1')).toMatchObject({ major: 0, minor: 12, patch: 1 })
    expect(r.parseSemver('0.12')).toBeNull()
  })
  it('derives the Android versionCode', () => {
    expect(r.versionCodeFor('0.12.1')).toBe(12001)
    expect(r.versionCodeFor('0.10.0')).toBe(10000)
    expect(r.versionCodeFor('1.0.0')).toBe(1000000)
    expect(() => r.versionCodeFor('0.1000.0')).toThrow()
  })
})

const html = `<article class="rel rv" id="v0-27-1"><div><h3>0.27.1</h3><small>Windows 0.27.1 &middot; Android 0.12.1</small></div><ul>
<li><b>Back.</b> Karaoke &amp; &ldquo;More&rdquo;.</li></ul></article>
<article class="rel rv" id="v0-27"><div><h3>0.27</h3><small>Windows 0.27</small></div><ul><li>x</li></ul></article>`

describe('notes card', () => {
  it('finds a card by version, with the ".0 patch" title form', () => {
    expect(r.findNotesCard(html, '0.27.1').bullets).toEqual(['Back. Karaoke & "More".'])
    expect(r.findNotesCard(html, '0.27.0').title).toBe('0.27')
    expect(r.findNotesCard(html, '0.28.0')).toBeNull()
  })
  it('does not confuse 0.2 with 0.27', () => {
    expect(r.findNotesCard(html, '0.2.0')).toBeNull()
    expect(r.cardMentionsAndroid(r.findNotesCard(html, '0.27.1'), '0.12.1')).toBe(true)
    expect(r.cardMentionsAndroid(r.findNotesCard(html, '0.27.1'), '0.12.10')).toBe(false)
  })
  it('renders a markdown body', () => {
    expect(r.notesMarkdown(r.findNotesCard(html, '0.27.1'), { version: '0.27.1', repo: 'o/r' })).toContain('- Back.')
  })
})

describe('file bumps', () => {
  it('bumps package.json, the lock in both places, and version.properties', () => {
    expect(r.bumpPackageJson('{\n  "name": "x",\n  "version": "0.1.0",\n  "a": {"version": "9"}\n}', '0.2.0')).toContain('"version": "0.2.0"')
    const lock = r.bumpPackageLock(JSON.stringify({ name: 'x', version: '0.1.0', packages: { '': { version: '0.1.0' }, a: { version: '5.0.0' } } }, null, 2) + '\n', '0.2.0')
    const j = JSON.parse(lock)
    expect([j.version, j.packages[''].version, j.packages.a.version]).toEqual(['0.2.0', '0.2.0', '5.0.0'])
    expect(r.bumpVersionProperties('versionName=0.12.1\nversionCode=12001\n', '0.13.0')).toBe('versionName=0.13.0\nversionCode=13000\n')
  })
})

describe('checkRelease', () => {
  const base = (over = {}) => ({
    packageJson: JSON.stringify({ version: '0.27.1' }),
    packageLock: JSON.stringify({ version: '0.27.1', packages: { '': { version: '0.27.1' } } }),
    properties: 'versionName=0.12.1\nversionCode=12001\n',
    whatsNewHtml: html,
    hasChangelog: () => true,
    ...over
  })
  it('passes a consistent release', () => expect(r.checkRelease(base()).errors).toEqual([]))
  it('catches a stale lock, a tag mismatch, a wrong versionCode, a missing card and changelog', () => {
    const e = r.checkRelease(
      base({
        packageLock: JSON.stringify({ version: '0.27.0', packages: { '': { version: '0.27.1' } } }),
        tag: 'v0.28.0',
        properties: 'versionName=0.12.1\nversionCode=12000\n',
        whatsNewHtml: '',
        hasChangelog: () => false
      })
    ).errors
    expect(e.length).toBe(5)
  })
})

describe('fdroid metadata', () => {
  const yml = 'Builds:\n  - versionName: 0.10.1\n    versionCode: 10001\n    commit: android-v0.10.1\n    subdir: android/app\nCurrentVersion: 0.10.1\nCurrentVersionCode: 10001\n'
  const input = (t: string) => ({
    packageJson: JSON.stringify({ version: '0.27.1' }),
    packageLock: JSON.stringify({ version: '0.27.1', packages: { '': { version: '0.27.1' } } }),
    properties: 'versionName=0.12.1\nversionCode=12001\n',
    whatsNewHtml: html,
    hasChangelog: () => true,
    fdroidText: t
  })
  it('is bumped in all five places and then passes the check', () => {
    const bumped = r.bumpFdroid(yml, '0.12.1')
    expect(bumped).toContain('commit: android-v0.12.1')
    expect(bumped).toContain('CurrentVersionCode: 12001')
    expect(r.checkRelease(input(bumped)).errors).toEqual([])
  })
  it('a stale file is an error', () => {
    expect(r.checkRelease(input(yml)).errors.length).toBe(5)
  })
})

describe('changelog', () => {
  it('groups conventional commits and skips release chores', () => {
    const out = r.changelogFromSubjects(['feat(studio): film the screen', 'fix: crash', 'chore(release): 0.27.0', 'random text'])
    expect(out).toContain('### New')
    expect(out).toContain('**studio:** film the screen')
    expect(out).toContain('### Fixed')
    expect(out).not.toContain('0.27.0')
  })
})

describe('verify', () => {
  const asset = (name: string, size = 10, digest?: string) => ({ name, size, digest })
  const latestText = `version: 0.27.1\nfiles:\n  - url: Lyra-Setup-0.27.1.exe\n    sha512: abc\n    size: 10\npath: Lyra-Setup-0.27.1.exe\nsha512: abc\nreleaseDate: '2026-11-24'\n`
  it('parses latest.yml', () => {
    const l = r.parseLatestYml(latestText)
    expect(l.version).toBe('0.27.1')
    expect(l.files[0]).toMatchObject({ url: 'Lyra-Setup-0.27.1.exe', size: '10' })
  })
  it('accepts a complete Windows release and flags missing assets and a wrong version', () => {
    const rel = { assets: [asset('Lyra-Setup-0.27.1.exe'), asset('Lyra-Setup-0.27.1.exe.blockmap'), asset('latest.yml')] }
    expect(r.verifyWindowsRelease(rel, r.parseLatestYml(latestText), '0.27.1')).toEqual([])
    expect(r.verifyWindowsRelease({ assets: [] }, null, '0.27.1').length).toBe(3)
    expect(r.verifyWindowsRelease(rel, r.parseLatestYml(latestText.replace('version: 0.27.1', 'version: 0.27.0')), '0.27.1')[0]).toMatch(/0.27.0/)
  })
  it('checks the Android checksum file against the GitHub digest', () => {
    const h = 'a'.repeat(64)
    const rel = { assets: [asset('Lyra-Android-0.12.1.apk', 5, `sha256:${h}`), asset('Lyra-Android-0.12.1.apk.sha256')] }
    expect(r.verifyAndroidRelease(rel, '0.12.1', `${h}  Lyra-Android-0.12.1.apk`)).toEqual([])
    expect(r.verifyAndroidRelease(rel, '0.12.1', `${'b'.repeat(64)}  x`).length).toBe(1)
  })
})
