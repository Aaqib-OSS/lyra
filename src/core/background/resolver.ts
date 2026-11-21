import type { BackgroundMedia, BackgroundResolution, BackgroundSpec, Settings, Track, VideoCrop, YoutubeVideo } from '@shared/types'
import { rememberTrack } from '../trackIndex'
import { userChoices } from '../userChoices'
import { avoidFailed, failedVideos } from './failedVideos'
import { itunes } from './itunes'
import { youtube } from './youtube'

/** What the user has pinned for one song. */
export interface SongBg {
  media?: BackgroundMedia
  youtube?: YoutubeVideo
}

/** The few things that differ per platform (where files live, how clip URLs are served, how thumbnails are decoded). */
export interface ResolverHost {
  settings(): Pick<Settings, 'backgroundStyle' | 'customBackground'>
  songs(): Record<string, SongBg>
  /** A playable spec for a file the user imported, or null if the file is gone. */
  mediaSpec(m: BackgroundMedia, scope: 'song' | 'global'): BackgroundSpec | null
  /** URL the player should use for an Apple preview clip (Electron proxies it so frames can be read). */
  clipUrl(url: string): string
  crop(videoId: string): Promise<VideoCrop | null>
  /** Overrides for tests; by default the app-wide user-choices and failed-videos stores are used. */
  pinnedVideo?(songKey: string): string | null
  failedVideos?(songKey: string): ReadonlySet<string>
}

const safe = <T>(f: () => T, fallback: T): T => {
  try {
    return f()
  } catch {
    return fallback // stores unavailable (not started yet): behave as "nothing remembered"
  }
}

/**
 * Decides what plays behind the lyrics. Order in Auto:
 * your file for this song, then your file for all songs, then a free Apple clip (YouTube instead when the clip is
 * only 640p and a key exists), then YouTube (only with a key), then animated cover art.
 */
export function createBackgroundResolver(host: ResolverHost): (track: Track) => Promise<BackgroundResolution> {
  return async (track) => {
    const s = host.settings()
    // your choices belong to the SONG: found by the player's id, or by the song's identity (another player, a re-release)
    const songs = host.songs()
    const sk = rememberTrack(track)
    const song = songs[track.id] ?? songs[sk]
    // the video you picked (user-choices store) comes first; what failed for this song before is never used again
    const pinnedId = safe(() => (host.pinnedVideo ? host.pinnedVideo(sk) : (userChoices().getChoice(sk)?.video?.videoId ?? null)), null)
    const bad: ReadonlySet<string> = safe(() => (host.failedVideos ? host.failedVideos(sk) : failedVideos().failed(sk)), new Set<string>())
    const pinned: YoutubeVideo | undefined = pinnedId ? (song?.youtube?.videoId === pinnedId ? song.youtube : { videoId: pinnedId, title: '', channel: '', durationSec: null }) : song?.youtube
    const wantSec = track.durationMs / 1000
    const songSpec = song?.media ? host.mediaSpec(song.media, 'song') : null
    const globalSpec = s.customBackground ? host.mediaSpec(s.customBackground, 'global') : null
    const base = { hasSongMedia: !!songSpec, hasGlobalMedia: !!globalSpec }
    const living: BackgroundSpec = { kind: 'living' }
    const ytSpec = async (v: YoutubeVideo, scope: 'song' | 'auto'): Promise<BackgroundSpec> => ({
      kind: 'youtube',
      videoId: v.videoId,
      title: v.title,
      channel: v.channel,
      durationSec: v.durationSec,
      crop: await host.crop(v.videoId),
      scope
    })

    /** the next best videos of the song (about the right length), in case the first one is blocked from playing in an app */
    const alternates = async (best: YoutubeVideo, list: YoutubeVideo[]): Promise<{ alternates?: BackgroundSpec[] }> => {
      const want = track.durationMs / 1000
      const near = list.filter((v) => v.videoId !== best.videoId && (!v.durationSec || !want || Math.abs(v.durationSec - want) <= 25)).slice(0, 2)
      return near.length ? { alternates: await Promise.all(near.map((v) => ytSpec(v, 'auto'))) } : {}
    }

    if (s.backgroundStyle === 'still') return { ...base, spec: { kind: 'still' }, youtube: 'off' }
    if (s.backgroundStyle === 'living') return { ...base, spec: living, youtube: 'off' }
    if (s.backgroundStyle === 'custom') return { ...base, spec: songSpec ?? globalSpec ?? living, youtube: 'off' }

    // pinned choices first: the user's own file for this song (auto), or the video they picked for it
    if (s.backgroundStyle === 'auto' && songSpec) return { ...base, spec: songSpec, youtube: pinned ? 'pinned' : 'off' }
    if (pinned) return { ...base, spec: await ytSpec(pinned, 'song'), youtube: 'pinned' }

    const asClip = async (): Promise<Extract<BackgroundSpec, { kind: 'preview' }> | null> => {
      const clip = await itunes.find(track)
      return clip ? { kind: 'preview', url: host.clipUrl(clip.url), title: clip.title, width: clip.width } : null
    }
    const yt = async (): ReturnType<typeof youtube.find> => {
      const r = await youtube.find(track)
      if (r.state !== 'found') return r
      const list = r.list.filter((v) => !bad.has(v.videoId))
      const video = avoidFailed(r.video, r.list, bad, wantSec)
      return video ? { state: 'found', video, list } : { state: 'none', list }
    }
    const report = (r: Awaited<ReturnType<typeof youtube.find>>): Pick<BackgroundResolution, 'youtube' | 'youtubeMessage'> =>
      r.state === 'error' ? { youtube: 'error', youtubeMessage: r.message } : { youtube: r.state === 'found' ? 'found' : r.state }

    if (s.backgroundStyle === 'youtube') {
      // "Video": YouTube first, then Apple's clip, then your file, then living artwork
      const r = await yt()
      const clip = await asClip()
      if (r.state === 'found') return { ...base, spec: await ytSpec(r.video, 'auto'), youtube: 'found', ...(clip ? { fallback: clip } : {}), ...(await alternates(r.video, r.list)) }
      return { ...base, spec: clip ?? globalSpec ?? living, ...report(r) }
    }

    // Auto
    if (globalSpec) return { ...base, spec: globalSpec, youtube: youtube.hasKey() ? 'off' : 'no-key' }
    const clip = await asClip()
    // a 640p clip looks soft on a big screen: prefer a 1080p YouTube video when the user has a key
    if (clip && clip.width < 1280 && youtube.hasKey()) {
      const hd = await yt()
      if (hd.state === 'found') return { ...base, spec: await ytSpec(hd.video, 'auto'), youtube: 'found', fallback: clip, ...(await alternates(hd.video, hd.list)) }
    }
    if (clip) return { ...base, spec: clip, youtube: youtube.hasKey() ? 'off' : 'no-key' }
    const r = await yt()
    if (r.state === 'found') return { ...base, spec: await ytSpec(r.video, 'auto'), youtube: 'found', ...(await alternates(r.video, r.list)) }
    return { ...base, spec: living, ...report(r) }
  }
}
