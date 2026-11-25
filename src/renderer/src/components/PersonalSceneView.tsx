import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { PersonalScene } from '@shared/types'
import { useWindowDrag } from '@/hooks/useWindowDrag'
import { getPosition, usePlayer } from '@/store/player'
import { useLyrics } from '@/store/lyrics'
import { useLyricOffset } from '@/store/offsets'
import { requestMode, useUi } from '@/store/ui'

/**
 * A personal scene (src/main/personal.ts): the page you made for one song, shown instead of Lyra's own screen while that song
 * plays. It runs in a sandboxed frame: it cannot reach Lyra, your settings or the network. It gets what it needs by message
 * (the song, where the song is, the lyrics) and can ask for a short list of things back (play / pause / next / previous /
 * seek, a few window buttons, a few keys). The messages are described in docs/personal-scenes.md.
 */
const KEYS = new Set(['f', 'F', 'Escape', ' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'v', 'V', 'd', 'D', '[', ']', 'm', 'M', '?'])

export function PersonalSceneView({ scene, mini }: { scene: PersonalScene; mini: boolean }): ReactElement {
  const drag = useWindowDrag()
  const frame = useRef<HTMLIFrameElement>(null)
  const [shown, setShown] = useState(false) // the page fades in once it has started, over the colour the scene asked for
  const track = usePlayer((s) => s.snapshot?.track ?? null)
  const playing = usePlayer((s) => s.snapshot?.isPlaying ?? false)
  const lyrics = useLyrics((s) => s.state)
  const offset = useLyricOffset()
  const togglePanel = useUi((s) => s.togglePanel)

  const send = (msg: Record<string, unknown>): void => frame.current?.contentWindow?.postMessage(msg, '*')
  const sendState = (): void => {
    const s = usePlayer.getState().snapshot
    const t = s?.track
    send({
      type: 'lyra:state',
      track: t ? { id: t.id, title: t.title, artists: t.artists, album: t.album, durationMs: t.durationMs, artworkUrl: t.artworkUrl } : null,
      playing: s?.isPlaying ?? false,
      // where the song is, as an anchor: position at that moment (the page adds the time that has passed while the song plays)
      positionMs: getPosition(),
      at: Date.now()
    })
  }
  const sendLyrics = (): void => {
    const ready = lyrics.phase === 'ready' ? lyrics.result : null
    send({
      type: 'lyra:lyrics',
      trackId: track?.id ?? null,
      status: ready ? ready.status : lyrics.phase,
      lines: ready ? ready.lines.map((l) => ({ timeMs: l.timeMs, text: l.text })) : [],
      offsetMs: offset
    })
  }
  const sendAll = (): void => {
    send({ type: 'lyra:mode', mode: mini ? 'mini' : 'full' })
    sendState()
    sendLyrics()
  }
  // keep the latest senders for the message handler and the timers below
  const latest = useRef({ sendAll, sendState })
  latest.current = { sendAll, sendState }

  useEffect(() => {
    const onMessage = (e: MessageEvent): void => {
      if (e.source !== frame.current?.contentWindow) return
      const d = e.data as { type?: unknown; cmd?: unknown; ms?: unknown; action?: unknown; key?: unknown; shiftKey?: unknown } | null
      if (!d || typeof d.type !== 'string') return
      const p = usePlayer.getState()
      if (d.type === 'lyra:ready') {
        setShown(true)
        latest.current.sendAll()
      }
      else if (d.type === 'lyra:cmd') {
        if (d.cmd === 'toggle') p.toggle()
        else if (d.cmd === 'next') void p.command({ type: 'next' })
        else if (d.cmd === 'prev') void p.command({ type: 'previous' })
        else if (d.cmd === 'seek' && typeof d.ms === 'number' && Number.isFinite(d.ms)) p.seek(Math.max(0, Math.round(d.ms)))
      } else if (d.type === 'lyra:window') {
        if (d.action === 'settings') togglePanel('settings')
        else if (d.action === 'fullscreen') requestMode(useUi.getState().mode === 'full' ? 'mini' : 'full')
        else if (d.action === 'minimize') window.lyra.window.minimize()
        else if (d.action === 'collapse') requestMode('compact')
        else if (d.action === 'quit') window.lyra.window.quit()
      } else if (d.type === 'lyra:key' && typeof d.key === 'string' && KEYS.has(d.key)) {
        // a key pressed inside the page goes to Lyra's own shortcuts
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: d.key, shiftKey: d.shiftKey === true, bubbles: true }))
      }
    }
    window.addEventListener('message', onMessage)
    // the song and its place move all the time: a fresh anchor on every update from the player, and every two seconds anyway
    const unsub = usePlayer.subscribe(() => latest.current.sendState())
    const tick = window.setInterval(() => latest.current.sendState(), 2000)
    return () => {
      window.removeEventListener('message', onMessage)
      unsub()
      clearInterval(tick)
    }
  }, [togglePanel])

  useEffect(sendState, [track?.id, playing]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(sendLyrics, [lyrics, offset, track?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => send({ type: 'lyra:mode', mode: mini ? 'mini' : 'full' }), [mini]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pscene" style={{ background: scene.background }}>
      <iframe ref={frame} className={`pscene__frame${shown ? ' is-shown' : ''}`} src={scene.pageUrl} sandbox="allow-scripts" allow="autoplay" title={track ? `${track.title} by ${track.artists.join(', ')}` : 'Scene'} onLoad={sendAll} />
      {mini && <div className="pscene__drag" {...drag} />}
    </div>
  )
}
