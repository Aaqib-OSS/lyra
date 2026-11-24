import { describe, expect, it } from 'vitest'
import { friendlyUpdateError, isTransient, pickNightlyTag, releaseNotesToText, retryDelayMs } from './updateHelpers'

describe('friendlyUpdateError', () => {
  it('explains the common failures in plain words', () => {
    expect(friendlyUpdateError('net::ERR_INTERNET_DISCONNECTED')).toMatch(/connection/)
    expect(friendlyUpdateError('getaddrinfo ENOTFOUND github.com')).toMatch(/connection/)
    expect(friendlyUpdateError('HTTP 403 rate limit exceeded')).toMatch(/rate limiting/)
    expect(friendlyUpdateError('sha512 checksum mismatch, expected abc')).toMatch(/safety check/)
    expect(friendlyUpdateError('ENOSPC: no space left on device')).toMatch(/disk space/)
    expect(friendlyUpdateError('Cannot find latest.yml in the latest release')).toMatch(/No update information/)
  })
  it('caps anything unknown', () => {
    expect(friendlyUpdateError('x'.repeat(500)).length).toBe(160)
  })
})

describe('retry policy', () => {
  it('retries network problems soon, three times, then leaves it to the normal cadence', () => {
    expect(isTransient('ECONNRESET')).toBe(true)
    expect(isTransient('HTTP 503')).toBe(true)
    expect(isTransient('sha512 checksum mismatch')).toBe(false)
    expect(isTransient('404 Not Found')).toBe(false)
    expect([1, 2, 3].map(retryDelayMs)).toEqual([300_000, 900_000, 3_600_000])
    expect(retryDelayMs(4)).toBeNull()
    expect(retryDelayMs(0)).toBeNull()
  })
})

describe('releaseNotesToText', () => {
  it('turns release HTML into plain text, never markup', () => {
    const t = releaseNotesToText('<h2>New</h2><ul><li>Fast &amp; fixed</li><li><script>alert(1)</script>Two</li></ul>')
    expect(t).toBe('New\n- Fast & fixed\n- alert(1)Two')
    expect(t).not.toMatch(/<|>/)
  })
  it('accepts the array form and caps the length', () => {
    expect(releaseNotesToText([{ version: '1', note: 'one' }, { version: '2', note: 'two' }])).toBe('one\ntwo')
    expect(releaseNotesToText('a'.repeat(5000), 100)!.length).toBe(101)
  })
  it('returns nothing for empty or missing notes', () => {
    expect(releaseNotesToText(undefined)).toBeUndefined()
    expect(releaseNotesToText('  <p></p> ')).toBeUndefined()
    expect(releaseNotesToText(null)).toBeUndefined()
  })
})

describe("pickNightlyTag", () => {
  const r = (tag_name: string, prerelease = true, draft = false) => ({ tag_name, prerelease, draft })
  it("takes the newest published nightly pre-release and nothing else", () => {
    expect(pickNightlyTag([r("android-v0.12.1", false), r("nightly-20261124"), r("nightly-20261125"), r("v0.27.1", false)])).toBe("nightly-20261125")
  })
  it("ignores drafts, stable releases named nightly, and junk", () => {
    expect(pickNightlyTag([r("nightly-20261125", true, true), r("nightly-20261124", false)])).toBeNull()
    expect(pickNightlyTag([r("nightly-latest")])).toBeNull()
    expect(pickNightlyTag(null)).toBeNull()
  })
})
