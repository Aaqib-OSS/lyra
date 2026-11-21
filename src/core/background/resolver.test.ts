import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Track, YoutubeVideo } from '@shared/types'

const find = vi.fn()
vi.mock('./youtube', () => ({ youtube: { find: (t: Track) => find(t), hasKey: () => true } }))
vi.mock('./itunes', () => ({ itunes: { find: async () => null } }))

import { createBackgroundResolver, type ResolverHost } from './resolver'

const A = 'aaaaaaaaaaa'
const B = 'bbbbbbbbbbb'
const C = 'ccccccccccc'
const vid = (videoId: string): YoutubeVideo => ({ videoId, title: videoId, channel: 'ch', durationSec: 200, acceptable: true })
const track = { id: 'p1', title: 'Song', artists: ['Artist'], album: '', durationMs: 200_000 } as unknown as Track

const host = (over: Partial<ResolverHost> = {}): ResolverHost => ({
  settings: () => ({ backgroundStyle: 'auto', customBackground: null }),
  songs: () => ({}),
  mediaSpec: () => null,
  clipUrl: (u) => u,
  crop: async () => null,
  pinnedVideo: () => null,
  failedVideos: () => new Set(),
  ...over
})

describe('background resolver: choices and failures', () => {
  beforeEach(() => find.mockReset())

  it('plays the video from the user-choices store first, without searching', async () => {
    const r = await createBackgroundResolver(host({ pinnedVideo: () => C }))(track)
    expect(r.spec).toMatchObject({ kind: 'youtube', videoId: C, scope: 'song' })
    expect(r.youtube).toBe('pinned')
    expect(find).not.toHaveBeenCalled()
  })

  it('uses the ranker pick when nothing is pinned', async () => {
    find.mockResolvedValue({ state: 'found', video: vid(A), list: [vid(A), vid(B)] })
    const r = await createBackgroundResolver(host())(track)
    expect(r.spec).toMatchObject({ kind: 'youtube', videoId: A, scope: 'auto' })
  })

  it('skips a video that failed before and uses the next good one', async () => {
    find.mockResolvedValue({ state: 'found', video: vid(A), list: [vid(A), vid(B)] })
    const r = await createBackgroundResolver(host({ failedVideos: () => new Set([A]) }))(track)
    expect(r.spec).toMatchObject({ kind: 'youtube', videoId: B })
    expect(r.alternates ?? []).not.toContainEqual(expect.objectContaining({ videoId: A }))
  })

  it('falls back to artwork when every candidate failed', async () => {
    find.mockResolvedValue({ state: 'found', video: vid(A), list: [vid(A)] })
    const r = await createBackgroundResolver(host({ failedVideos: () => new Set([A]) }))(track)
    expect(r.spec.kind).toBe('living')
  })
})
