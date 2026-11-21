import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { BackgroundSpec } from '@shared/types'
import { useArtwork, useTinyArt } from '@/hooks/useArtwork'
import { useBackground } from '@/hooks/useBackground'
import { failedVideos, rememberFailure } from '@/lib/failMemory'
import { trackKey } from '@core/songKey'
import { useReducedMotion } from '@/hooks/useMotion'
import { DriftController, VIDEO_EL_DRIFT, YT_DRIFT, isTimelineSyncable, videoTargetSec } from '@core/clock'
import { getPosition, usePlayer } from '@/store/player'
import { useBgState, type VideoProblem } from '@/store/bgState'
import { useSettings } from '@/store/settings'

/** True while the window is actually on screen (not minimised / fully covered). */
function usePageVisible(): boolean {
  const [v, setV] = useState(!document.hidden)
  useEffect(() => {
    const on = (): void => setV(!document.hidden)
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return v
}

interface Crop {
  t: number
  r: number
  b: number
  l: number
}
const NO_CROP: Crop = { t: 0, r: 0, b: 0, l: 0 }
const MAX_BAR = 0.3

/**
 * Samples the playing video a few times a second (tiny canvas) to learn
 *  - how bright it is (drives the auto-dim), and
 *  - whether the clip itself has black letterbox / pillarbox bars (they get cropped away).
 * Bars must persist across several samples, so a genuinely dark scene is never mistaken for one.
 */
function useFrameStats(video: MutableRefObject<HTMLVideoElement | null>, active: boolean, resetKey: string): { luma: number; crop: Crop } {
  const [stats, setStats] = useState({ luma: 0.35, crop: NO_CROP })
  useEffect(() => {
    setStats({ luma: 0.35, crop: NO_CROP })
    if (!active) return
    const W = 64
    const H = 36
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    const history: Crop[] = []
    let luma = 0.35
    let dead = false
    const tick = (): void => {
      const v = video.current
      if (dead || !v || v.readyState < 2 || v.paused) return
      let data: Uint8ClampedArray
      try {
        ctx.drawImage(v, 0, 0, W, H)
        data = ctx.getImageData(0, 0, W, H).data
      } catch {
        dead = true // tainted: no sampling for this source
        return
      }
      const lum = (x: number, y: number): number => {
        const i = (y * W + x) * 4
        return (0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!) / 255
      }
      const rowDark = (y: number): boolean => {
        let sum = 0
        let max = 0
        for (let x = 0; x < W; x++) {
          const l = lum(x, y)
          sum += l
          if (l > max) max = l
        }
        return sum / W < 0.045 && max < 0.14
      }
      const colDark = (x: number): boolean => {
        let sum = 0
        let max = 0
        for (let y = 0; y < H; y++) {
          const l = lum(x, y)
          sum += l
          if (l > max) max = l
        }
        return sum / H < 0.045 && max < 0.14
      }
      let t = 0
      while (t < H * MAX_BAR && rowDark(t)) t++
      let b = 0
      while (b < H * MAX_BAR && rowDark(H - 1 - b)) b++
      let l = 0
      while (l < W * MAX_BAR && colDark(l)) l++
      let r = 0
      while (r < W * MAX_BAR && colDark(W - 1 - r)) r++
      history.push({ t: t / H, b: b / H, l: l / W, r: r / W })
      if (history.length > 5) history.shift()
      // a bar only counts if it was there in every recent sample
      const agreed: Crop = {
        t: Math.min(...history.map((h) => h.t)),
        b: Math.min(...history.map((h) => h.b)),
        l: Math.min(...history.map((h) => h.l)),
        r: Math.min(...history.map((h) => h.r))
      }
      // brightness of the visible part only
      let sum = 0
      let n = 0
      for (let y = t; y < H - b; y += 2) for (let x = l; x < W - r; x += 2) (sum += lum(x, y)), n++
      if (n) luma = luma * 0.6 + (sum / n) * 0.4
      setStats((s) => {
        const same = (['t', 'b', 'l', 'r'] as const).every((k) => Math.abs(s.crop[k] - agreed[k]) < 0.012)
        return { luma: Math.round(luma * 100) / 100, crop: history.length >= 3 && !same ? agreed : s.crop }
      })
    }
    const id = window.setInterval(tick, 650)
    return () => {
      dead = true
      window.clearInterval(id)
    }
  }, [video, active, resetKey])
  return stats
}

/** Two stacked copies of the clip that cross-fade into each other, so a short clip loops without a visible jump. */
/** Pictures further than this from the window's shape are shown whole (contain) over a blurred copy instead of cropped. */
const FIT_TOLERANCE = 0.12

/**
 * Watches the window the media sits in (the parent stage) and compares its shape with the picture's.
 * True = the shapes differ enough that `cover` would crop badly: show the whole picture and fill the rest.
 */
function useContain(anchor: MutableRefObject<HTMLElement | null>, ar: number): boolean {
  const [win, setWin] = useState(0)
  useEffect(() => {
    const host = anchor.current?.parentElement
    if (!host) return
    const read = (): void => {
      const w = host.clientWidth
      const h = host.clientHeight
      if (w && h) setWin((o) => (Math.abs(o - w / h) < 0.005 ? o : w / h))
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(host)
    return () => ro.disconnect()
  }, [anchor])
  if (win > 2.2 && ar >= 1.5) return false // a deliberately cinemascope window (trailer) crops ordinary widescreen on purpose
  return ar > 0 && win > 0 && Math.abs(ar / win - 1) > FIT_TOLERANCE
}

/**
 * The blurred fill behind a contained video: ONE tiny canvas that copies the playing frame ~7 times a second.
 * No second <video>, so there is nothing to keep in step with the song clock: it shows whatever the front video shows.
 */
function VideoFill({ fillRef, video, active, ar, crop }: { fillRef: MutableRefObject<HTMLCanvasElement | null>; video: MutableRefObject<HTMLVideoElement | null>; active: boolean; ar: number; crop: Crop }) {
  const cropRef = useRef(crop)
  cropRef.current = crop
  useEffect(() => {
    const c = fillRef.current
    if (!active || !c || document.documentElement.dataset.platform === 'android') return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const draw = (): void => {
      const v = video.current
      if (!v || v.readyState < 2 || !v.videoWidth || document.hidden || document.documentElement.dataset.perf === 'low') return
      const k = cropRef.current
      try {
        ctx.drawImage(v, k.l * v.videoWidth, k.t * v.videoHeight, v.videoWidth * (1 - k.l - k.r), v.videoHeight * (1 - k.t - k.b), 0, 0, c.width, c.height)
      } catch {
        /* a frame that can not be read: the dark fill stays */
      }
    }
    draw()
    const id = window.setInterval(draw, 140)
    return () => window.clearInterval(id)
  }, [active, ar, fillRef, video])
  const h = Math.max(8, Math.round(64 / (ar || 1.78)))
  return <canvas ref={fillRef} className="backdrop__fill" data-fit={active ? 'contain' : undefined} width={64} height={h} />
}

function LoopVideo({ url, run, crop, videoRef, onFail }: { url: string; run: boolean; crop: Crop; videoRef: MutableRefObject<HTMLVideoElement | null>; onFail: () => void }) {
  const refA = useRef<HTMLVideoElement>(null)
  const refB = useRef<HTMLVideoElement>(null)
  const els = [refA, refB] as const
  const [front, setFront] = useState<0 | 1>(0)
  const frontRef = useRef<0 | 1>(0)
  const swapping = useRef(false)
  const [shown, setShown] = useState(false) // fade in only once frames really play: no black box while the clip loads
  useEffect(() => setShown(false), [url])
  const runRef = useRef(run)
  runRef.current = run
  const fillRef = useRef<HTMLCanvasElement | null>(null)
  const [dims, setDims] = useState({ w: 0, h: 0 })
  useEffect(() => setDims({ w: 0, h: 0 }), [url])
  const ar = dims.w && dims.h ? (dims.w * (1 - crop.l - crop.r)) / (dims.h * (1 - crop.t - crop.b)) : 0
  const contain = useContain(fillRef, ar)

  useEffect(() => {
    videoRef.current = els[front]!.current
  }, [front, videoRef]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cur = els[frontRef.current]!.current
    if (run) void cur?.play().catch(() => undefined)
    else els.forEach((e) => e.current?.pause())
  }, [run]) // eslint-disable-line react-hooks/exhaustive-deps

  /** a video file as long as the song follows the song clock instead of looping on its own */
  const locked = (v: HTMLVideoElement): boolean => {
    const t = usePlayer.getState().snapshot?.track
    return !!t && isTimelineSyncable(v.duration, t.durationMs)
  }
  useEffect(() => {
    const dc = new DriftController(VIDEO_EL_DRIFT)
    const id = window.setInterval(() => {
      const v = els[frontRef.current]!.current
      const snap = usePlayer.getState().snapshot
      if (!v || !runRef.current || !snap?.track || snap.isAdOrUnknown || !locked(v)) {
        dc.reset()
        if (v && v.playbackRate !== 1) v.playbackRate = 1
        return
      }
      v.loop = false
      const act = dc.update({
        nowMs: performance.now(),
        videoSec: v.currentTime,
        targetSec: videoTargetSec(getPosition(), v.duration),
        playing: !v.paused && !v.ended,
        buffering: v.readyState < 3 || v.seeking,
        rate: v.playbackRate
      })
      if (act.seekToSec !== undefined) v.currentTime = act.seekToSec
      if (act.rate !== undefined) v.playbackRate = act.rate
    }, 400)
    return () => window.clearInterval(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = window.setInterval(() => {
      const cur = els[frontRef.current]!.current
      const next = els[1 - frontRef.current]!.current
      if (!cur || !next || swapping.current || !runRef.current) return
      if (locked(cur)) return // a clip as long as the song is locked to the song clock: no loop crossfade
      if (cur.duration > 4 && cur.duration - cur.currentTime < 1.3) {
        swapping.current = true
        next.currentTime = 0
        void next.play().catch(() => undefined)
        const old = frontRef.current
        frontRef.current = (1 - old) as 0 | 1
        setFront(frontRef.current)
        window.setTimeout(() => {
          els[old]!.current?.pause()
          swapping.current = false
        }, 1500)
      }
    }, 200)
    return () => window.clearInterval(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const view = `inset(${crop.t * 100}% ${crop.r * 100}% ${crop.b * 100}% ${crop.l * 100}%)`
  const common = {
    className: 'backdrop__media',
    src: url,
    muted: true,
    playsInline: true,
    preload: 'auto' as const,
    crossOrigin: 'anonymous' as const,
    disablePictureInPicture: true,
    onError: onFail
  }
  return (
    <>
      <VideoFill fillRef={fillRef} video={videoRef} active={contain} ar={ar} crop={crop} />
      {[0, 1].map((i) => (
        <video
          key={i}
          ref={els[i]!}
          {...common}
          autoPlay={i === 0}
          data-fit={contain ? 'contain' : undefined}
          style={{ opacity: front === i && shown ? 1 : 0, transition: 'opacity .6s ease', ['objectViewBox' as string]: view }}
          onPlaying={() => setShown(true)}
          onLoadedData={() => setShown(true)}
          onLoadedMetadata={(e) => {
            if (i === 0) setDims({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })
            // very short clips just loop natively
            if (i === 0 && e.currentTarget.duration <= 4) e.currentTarget.loop = true
          }}
        />
      ))}
    </>
  )
}

function ImageLayer({ url, onFail }: { url: string; onFail: () => void }) {
  const fillRef = useRef<HTMLImageElement | null>(null)
  const [ar, setAr] = useState(0)
  useEffect(() => setAr(0), [url])
  const contain = useContain(fillRef, ar)
  const fit = contain ? 'contain' : undefined
  return (
    <>
      {/* images (GIFs, living art): a second copy of the same file is the blurred fill, it animates by itself */}
      <img ref={fillRef} className="backdrop__fill" data-fit={fit} src={url} alt="" draggable={false} />
      <img className="backdrop__media" data-fit={fit} src={url} alt="" draggable={false} onError={onFail} onLoad={(e) => setAr(e.currentTarget.naturalWidth / (e.currentTarget.naturalHeight || 1))} />
    </>
  )
}

function phoneInit(): boolean {
  return document.documentElement.dataset.platform === 'android'
}

function YoutubeLayer({ spec, run, onFail }: { spec: Extract<BackgroundSpec, { kind: 'youtube' }>; run: boolean; onFail: (why?: string) => void }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [xf, setXf] = useState('translate(-50%, -50%) scale(1)')
  const onFailRef = useRef(onFail)
  onFailRef.current = onFail
  const timer = useRef(0)
  /** On the phone the muted video is never paused: pausing and resuming makes YouTube re-buffer and flash its own controls. */
  const phone = document.documentElement.dataset.platform === 'android'
  const lastState = useRef(-1)
  // YouTube flashes its own controls for a few seconds after it starts and after the app is reopened: keep it invisible then
  const [masked, setMasked] = useState(phoneInit())
  const maskTimer = useRef(0)
  useEffect(() => {
    useBgState.setState({ ytReady: ready })
    return () => useBgState.setState({ ytReady: false })
  }, [ready])
  const holdMask = (ms = 4000): void => {
    setMasked(true)
    window.clearTimeout(maskTimer.current)
    maskTimer.current = window.setTimeout(() => setMasked(false), ms)
  }
  const runRef = useRef(run)
  runRef.current = run
  const [start] = useState(() => {
    // join the video roughly where the song is, when the lengths plausibly match
    const pos = getPosition() / 1000
    return spec.durationSec && pos > 3 && pos < spec.durationSec - 8 ? Math.floor(pos) : 0
  })

  const cmd = (func: string, args: unknown[] = []): void =>
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), 'https://www.youtube-nocookie.com')

  // Keeps the video on the song clock: the embed reports its own time, the shared clock says where the song is.
  const drift = useRef(new DriftController(YT_DRIFT))
  const vInfo = useRef({ dur: 0, rate: 1 })
  const syncFromEmbed = (videoSec: number): void => {
    const snap = usePlayer.getState().snapshot
    if (!runRef.current || !snap?.track || snap.isAdOrUnknown || !isTimelineSyncable(vInfo.current.dur, snap.track.durationMs)) return
    const act = drift.current.update({
      nowMs: performance.now(),
      videoSec,
      targetSec: videoTargetSec(getPosition(), vInfo.current.dur),
      playing: lastState.current === 1,
      buffering: lastState.current === 3,
      rate: vInfo.current.rate
    })
    if (act.seekToSec !== undefined) cmd('seekTo', [act.seekToSec, true])
    if (act.rate !== undefined) cmd('setPlaybackRate', [act.rate])
  }
  /** No captions, ever: the embed parameter is not always honoured (account / language settings), so also unload the module. */
  const noCaptions = (): void => {
    cmd('unloadModule', ['captions'])
    cmd('unloadModule', ['cc'])
    cmd('setOption', ['captions', 'track', {}])
  }

  // always render the embed at 1080p and scale it down/up to cover, so YouTube serves its best stream even in the small mini player.
  // Ambient mode (dim, soft, on battery) asks for 480p instead: far cheaper to decode and it looks just as good that dim.
  const W = document.documentElement.dataset.ambient === '1' ? 854 : 1920
  const H = document.documentElement.dataset.ambient === '1' ? 480 : 1080
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    // trim the video's own black bars (found from its thumbnail), then scale to cover with a little extra to hide the player's edge UI
    const c = spec.crop ?? { t: 0, r: 0, b: 0, l: 0 }
    const aw = 1 - c.l - c.r
    const ah = 1 - c.t - c.b
    const ro = new ResizeObserver(() => {
      const k = Math.max(el.clientWidth / (W * aw), el.clientHeight / (H * ah)) * 1.1
      const dx = ((c.l - c.r) / 2) * W * k
      const dy = ((c.t - c.b) / 2) * H * k
      setXf(`translate(calc(-50% - ${dx}px), calc(-50% - ${dy}px)) scale(${k})`)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [spec.crop])

  useEffect(() => {
    setReady(false)
    drift.current.reset()
    vInfo.current = { dur: 0, rate: 1 }
    const onMsg = (e: MessageEvent): void => {
      if (e.source !== frame.current?.contentWindow || e.origin !== 'https://www.youtube-nocookie.com') return
      let d: { event?: string; info?: { playerState?: number; currentTime?: number; duration?: number; playbackRate?: number } } | null = null
      try {
        d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      } catch {
        return
      }
      if (d?.info?.playerState !== undefined) {
        const previousState = lastState.current
        lastState.current = d.info.playerState
        // playing, paused (we pause it while the song is paused) or cued all mean the player works: no need to give up on it
        if (d.info.playerState === 1 || d.info.playerState === 2 || d.info.playerState === 5) window.clearTimeout(timer.current)
        // YouTube re-shows its transport overlay when playback resumes after a pause (not after buffering or a seek).
        if (!phone && d.info.playerState === 1 && previousState === 2) holdMask(1800)
      }
      if (typeof d?.info?.duration === 'number' && d.info.duration > 0) vInfo.current.dur = d.info.duration
      if (typeof d?.info?.playbackRate === 'number') vInfo.current.rate = d.info.playbackRate
      if (d?.event === 'infoDelivery' && typeof d.info?.currentTime === 'number') syncFromEmbed(d.info.currentTime)
      if (d?.event === 'onError') onFailRef.current(`error ${(d as { info?: unknown }).info ?? ''}`)
      else if (d?.event === 'onReady') {
        cmd('setPlaybackQuality', [document.documentElement.dataset.ambient === '1' ? 'large' : 'hd1080'])
        noCaptions()
        if (!runRef.current) cmd('pauseVideo')
      } else if (d?.event === 'infoDelivery' && d.info?.playerState === 1) {
        window.clearTimeout(timer.current)
        setReady((was) => {
          if (!was) noCaptions()
          // Keep the embed hidden while YouTube's startup transport overlay is visible.
          if (!was) holdMask(phone ? 4000 : 6500)
          return true
        })
      }
    }
    window.addEventListener('message', onMsg)
    // if it never starts (blocked embed, offline) fall back instead of showing a black box
    timer.current = window.setTimeout(() => onFailRef.current('timeout'), 25_000)
    return () => {
      window.removeEventListener('message', onMsg)
      window.clearTimeout(timer.current)
      window.clearTimeout(maskTimer.current)
    }
  }, [spec.videoId])

  useEffect(() => {
    if (!ready) return
    // paused or resumed: forget the old drift state, the first playing sample re-joins at the song's current position
    drift.current.reset()
    if (!run && vInfo.current.rate !== 1) cmd('setPlaybackRate', [1])
    if (phone) {
      // Pause with the music like on the PC. YouTube re-shows its own controls when a paused video resumes, so on the
      // phone the picture is hidden while paused and for a moment after resuming (the cover shows through meanwhile).
      if (run) {
        holdMask(2600)
        cmd('playVideo')
      } else {
        window.clearTimeout(maskTimer.current)
        setMasked(true)
        cmd('pauseVideo')
      }
      return
    }
    cmd(run ? 'playVideo' : 'pauseVideo')
  }, [run, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  const src =
    `https://www.youtube-nocookie.com/embed/${spec.videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${spec.videoId}&start=${start}` +
    '&modestbranding=1&playsinline=1&disablekb=1&rel=0&fs=0&iv_load_policy=3&cc_load_policy=0&enablejsapi=1&vq=' + (document.documentElement.dataset.ambient === '1' ? 'large' : 'hd1080')
  return (
    <div ref={wrap} className="backdrop__ytwrap">
      <iframe
        ref={frame}
        className="backdrop__yt"
        data-ready={ready || undefined}
      data-mask={masked || undefined}
        style={{ width: W, height: H, transform: xf }}
        src={src}
        title="Background video"
        allow="autoplay; encrypted-media"
        referrerPolicy="strict-origin-when-cross-origin"
        tabIndex={-1}
        onLoad={() => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), 'https://www.youtube-nocookie.com')}
      />
    </div>
  )
}

/**
 * Artwork-derived atmosphere: a blurred copy of the cover plus two slow colour fields
 * from the palette (set as CSS variables on :root). A dark shade keeps text readable.
 * In the cinematic modes it can be replaced by a looping video / GIF / image (see useBackground).
 */
export function Backdrop({ rich = false, animated = false }: { rich?: boolean; animated?: boolean }) {
  const url = usePlayer((s) => s.snapshot?.track?.artworkUrl ?? null)
  const playing = usePlayer((s) => s.snapshot?.isPlaying ?? false)
  const full = useArtwork(url)
  const src = useTinyArt(full)
  const dim = useSettings((s) => s.settings.backgroundDim)
  const autoDim = useSettings((s) => s.settings.autoDim)
  const reduced = useReducedMotion()
  const visible = usePageVisible()
  const res = useBackground(animated)
  const [failed, setFailed] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  // a YouTube video that can not be played here (embedding blocked, never started) hands over to the Apple clip
  const [ytFailed, setYtFailed] = useState<string | null>(null)
  const [ytWhy, setYtWhy] = useState('')
  // ...but first the next best videos of the song are tried (one that blocks embedding is common, a re-upload often plays)
  const [ytSkip, setYtSkip] = useState(0)
  const track = usePlayer((s) => s.snapshot?.track ?? null)
  const songId = track ? trackKey(track) : ''
  // videos that failed for this song before (blocked, never started) are tried last, so the problem does not repeat
  const bad = songId ? failedVideos(songId) : new Set<string>()
  const ordered: BackgroundSpec[] = res?.spec.kind === 'youtube' ? [res.spec, ...(res.alternates ?? [])] : []
  const tries = [...ordered.filter((t) => t.kind !== 'youtube' || !bad.has(t.videoId)), ...ordered.filter((t) => t.kind === 'youtube' && bad.has(t.videoId))]
  const baseSpec = tries.length ? (tries[ytSkip] ?? tries[tries.length - 1]!) : (res?.spec ?? null)
  useEffect(() => {
    setYtFailed(null)
    setYtSkip(0)
  }, [res])
  const ytDead = baseSpec?.kind === 'youtube' && ytFailed === baseSpec.videoId
  const spec = ytDead && res?.fallback ? res.fallback : baseSpec
  const specKey = spec?.kind === 'youtube' ? `yt:${spec.videoId}` : spec && 'url' in spec ? spec.url : (spec?.kind ?? '')
  useEffect(() => setFailed(null), [specKey])
  const fail = (why?: string): void => {
    if (spec?.kind === 'youtube') {
      console.warn('[background] YouTube video failed:', spec.videoId, why)
      if (songId && spec.scope !== 'song') rememberFailure(songId, spec.videoId) // a video the user pinned is never given up on
      if (ytSkip < tries.length - 1) {
        setYtSkip(ytSkip + 1) // try the next video of this song
        return
      }
      setYtWhy(why ?? '')
      setYtFailed(spec.videoId)
    } else setFailed(specKey)
  }

  const usable = animated && !reduced && !(failed && failed === specKey) && !(ytDead && !res?.fallback)
  const isVideoFile = !!spec && (spec.kind === 'preview' || (spec.kind === 'media' && spec.media === 'video'))
  const isImage = !!spec && spec.kind === 'media' && spec.media === 'image'
  const isYt = spec?.kind === 'youtube'
  const mediaUrl = spec && 'url' in spec ? spec.url : null
  const showMedia = usable && (isVideoFile || isImage)
  const showYt = usable && isYt
  const hasMedia = showMedia || showYt
  const exporting = useBgState((s) => s.exporting)
  const adBreak = usePlayer((s) => s.snapshot?.isAdOrUnknown ?? false)
  const run = visible && playing && !adBreak && !exporting // pause (never unmount) when the window is hidden or the song is paused
  const alive = animated && !reduced && spec?.kind !== 'still'

  const stats = useFrameStats(videoRef, usable && isVideoFile && run, specKey)

  // let the rest of the UI know a video is behind it, so it can switch to glass panels
  useEffect(() => {
    if (hasMedia) document.documentElement.dataset.bgMedia = rich ? 'full' : 'mini'
    else delete document.documentElement.dataset.bgMedia
    useBgState.getState().set({ media: hasMedia ? (rich ? 'full' : 'mini') : 'none', kind: hasMedia ? (spec?.kind ?? null) : null })
    return () => {
      delete document.documentElement.dataset.bgMedia
      useBgState.getState().set({ media: 'none', kind: null })
    }
  }, [hasMedia, rich, spec?.kind])

  // when a video was expected but none is playing, say why (the mini player shows it)
  const settingStyle = useSettings((s) => s.settings.backgroundStyle)
  useEffect(() => {
    let text: string | null = null
    if (animated && !reduced && res && !hasMedia && (settingStyle === 'auto' || settingStyle === 'youtube')) {
      if (ytDead) text = ytWhy === 'timeout' ? 'The video didn’t start in time. It may be slow to load or blocked here.' : /error (101|150|152|153)/.test(ytWhy) ? 'This video can’t be played in Lyra (the uploader blocks it).' : `This video can’t be played in Lyra (YouTube said: ${ytWhy || 'unknown'}).`
      else if (res.youtube === 'no-key') text = 'No video for this song yet. Add a YouTube key or pick a video.'
      else if (res.youtube === 'none') text = 'No music video found for this song.'
      else if (res.youtube === 'error') text = res.youtubeMessage ? `Video search failed: ${res.youtubeMessage}` : 'Video search failed.'
    }
    useBgState.getState().setReason(text ? { text } : null)
    return () => useBgState.getState().setReason(null)
  }, [animated, reduced, res, hasMedia, ytDead, ytWhy, settingStyle])

  // the whole video story in one place, for the status card in the UI
  const ytReady = useBgState((s) => s.ytReady)
  useEffect(() => {
    const wants = animated && !reduced && (settingStyle === 'auto' || settingStyle === 'youtube')
    const store = useBgState.getState()
    if (hasMedia && spec) {
      const title = 'title' in spec ? String(spec.title) : spec.kind === 'media' ? spec.name : ''
      const channel = spec.kind === 'youtube' ? spec.channel : ''
      if (spec.kind === 'youtube') store.setVideo({ phase: ytReady ? 'live' : 'loading', title, channel })
      else if (spec.kind === 'preview') store.setVideo({ phase: 'fallback', title, problem: ytDead ? 'blocked' : null })
      else store.setVideo({ phase: 'live', title })
    } else if (wants && !res) store.setVideo({ phase: 'searching' })
    else if (wants && res && !hasMedia) {
      const problem: VideoProblem | null = ytDead ? (ytWhy === 'timeout' ? 'timeout' : 'blocked') : res.youtube === 'no-key' ? 'no-key' : res.youtube === 'none' ? 'none' : res.youtube === 'error' ? (navigator.onLine ? 'error' : 'offline') : null
      store.setVideo(problem ? { phase: 'failed', problem } : { phase: 'off' })
    } else store.setVideo({ phase: 'off' })
    return () => useBgState.getState().setVideo({ phase: 'off' })
  }, [animated, reduced, res, hasMedia, spec, ytReady, ytDead, ytWhy, settingStyle])

  // gentle parallax: the picture drifts against the cursor
  useEffect(() => {
    if (!hasMedia) return
    let raf = 0
    const move = (e: PointerEvent): void => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const el = root.current
        if (!el) return
        el.style.setProperty('--px', String((e.clientX / window.innerWidth - 0.5) * 2))
        el.style.setProperty('--py', String((e.clientY / window.innerHeight - 0.5) * 2))
      })
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => {
      window.removeEventListener('pointermove', move)
      cancelAnimationFrame(raf)
    }
  }, [hasMedia])

  // dim: your slider is the base; the auto part lifts it for bright scenes and eases it for dark ones
  const base = rich ? dim * 0.8 : dim * 0.3
  const factor = autoDim && isVideoFile ? Math.min(1.45, Math.max(0.6, 0.62 + stats.luma * 1.5)) : isYt ? 0.7 : 1
  const dimNow = Math.min(0.9, Math.max(0.1, base * factor)) + (playing ? 0 : 0.12)

  return (
    <div
      ref={root}
      className={`backdrop ${rich ? 'backdrop--rich' : ''} ${alive ? 'backdrop--alive' : ''} ${hasMedia ? 'backdrop--media' : ''}`}
      aria-hidden="true"
      data-paused={!playing || undefined}
    >
      <div className="backdrop__field" />
      <AnimatePresence initial={false}>
        {src && (
          <motion.img
            key={src}
            src={src}
            alt=""
            className="backdrop__img"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9 }}
            draggable={false}
          />
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {hasMedia && spec && (
          <motion.div key={specKey} className="backdrop__stage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1 }}>
            {showMedia && mediaUrl && (isImage ? <ImageLayer url={mediaUrl} onFail={fail} /> : <LoopVideo url={mediaUrl} run={run} crop={stats.crop} videoRef={videoRef} onFail={fail} />)}
            {showYt && spec.kind === 'youtube' && <YoutubeLayer spec={spec} run={run} onFail={fail} />}
          </motion.div>
        )}
      </AnimatePresence>
      {rich && (
        <>
          <i className="backdrop__blob backdrop__blob--a" />
          <i className="backdrop__blob backdrop__blob--b" />
        </>
      )}
      <div className="backdrop__shade" />
      {hasMedia && <div className="backdrop__dim" style={{ opacity: dimNow }} />}
      {hasMedia && <div className="backdrop__grade" />}
    </div>
  )
}
