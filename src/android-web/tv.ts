/**
 * The TV side of the shared page (`?tv=1`, data-platform="tv"): a remote-control layer on top of the same renderer.
 * It adds no player of its own. It
 *  - turns D-pad / OK / media keys into player actions and focus moves (rules in tvNav.ts),
 *  - shows a tiny HUD (hints, seek / pause feedback) that lives outside React,
 *  - shows the one-time setup screen: pair with Lyra on a phone or computer (QR + short code), or listen to this TV's own
 *    media session (needs notification access, which many TVs hide from Settings; the screen says how to grant it).
 * Styling is in styles/tv.css.
 */
import { cycleVibe } from '@/hooks/useVibe'
import { getPosition, usePlayer } from '@/store/player'
import { useUi } from '@/store/ui'
import { decide, nativeKey, pickNext, remoteKey, type Dir, type RemoteKey } from './tvNav'

export interface TvState {
  /** 'local': mirror a media session on this TV; 'paired': follow a Lyra app on another device */
  mode: 'local' | 'paired'
  hasAccess: boolean
  canOpenAccessSettings: boolean
  paired: boolean
  /** short code shown on screen, e.g. K7M-2QX */
  code: string
  /** what the QR code encodes */
  link: string
  deviceName: string
  /** adb command that grants notification access when the TV has no Settings screen for it */
  adb: string
}

export interface TvHost {
  rpc<T = unknown>(method: string, ...args: unknown[]): Promise<T>
  /** leave the app (Back from the home screen) */
  exit(): void
  /** harness only: show the setup screen whatever the state */
  forceSetup?: boolean
}

declare global {
  interface Window {
    /** the activity calls this for keys the WebView never sees as DOM events (media keys, Menu) */
    __lyraTv?: { key(name: string): void }
  }
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

/** true while the player chrome is on screen (it fades away after a few idle seconds) */
const controlsShown = (): boolean => !document.querySelector('.full.is-idle')
const wake = (): void => void window.dispatchEvent(new Event('mousemove')) // the renderer's idle timer listens for this

const visible = (e: HTMLElement): boolean => {
  const r = e.getBoundingClientRect()
  if (r.width < 4 || r.height < 4) return false
  const cs = getComputedStyle(e)
  return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.pointerEvents !== 'none'
}

interface Focusable {
  node: HTMLElement
  x: number
  y: number
  w: number
  h: number
}

function focusables(root: ParentNode): Focusable[] {
  const out: Focusable[] = []
  root.querySelectorAll<HTMLElement>('button:not([disabled]), [role="slider"], [data-tvfocus]').forEach((node) => {
    if (!visible(node)) return
    const r = node.getBoundingClientRect()
    out.push({ node, x: r.left, y: r.top, w: r.width, h: r.height })
  })
  return out
}

function moveFocus(root: ParentNode, dir: Dir): boolean {
  const all = focusables(root)
  const cur = document.activeElement as HTMLElement | null
  const from = all.find((f) => f.node === cur) ?? null
  if (!from) {
    const play = all.find((f) => /play|pause/i.test(f.node.getAttribute('aria-label') ?? '')) ?? pickNext(all, null, dir)
    play?.node.focus()
    return !!play
  }
  const next = pickNext(all, from, dir)
  next?.node.focus()
  return !!next
}

// ---------------------------------------------------------------- HUD (hints + feedback)

function makeHud(): { say(text: string): void } {
  const hud = el('div', 'tvhud')
  const say = el('div', 'tvhud__say')
  say.setAttribute('role', 'status')
  const hints = el('div', 'tvhud__hints')
  for (const [k, t] of [['◀ ▶', 'Seek 10 s'], ['▲ ▼', 'Change look'], ['OK', 'Play / pause'], ['☰', 'Set up']] as const) {
    const h = el('span', 'tvhud__hint')
    h.append(el('b', undefined, k), document.createTextNode(` ${t}`))
    hints.append(h)
  }
  hud.append(say, hints)
  document.body.append(hud)
  // the key hints are for the first moments only; after that they would sit on top of the lyrics
  hud.classList.add('is-hints')
  setTimeout(() => hud.classList.remove('is-hints'), 10_000)
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    say(text) {
      say.textContent = text
      say.classList.add('is-on')
      clearTimeout(timer)
      timer = setTimeout(() => say.classList.remove('is-on'), 1400)
    }
  }
}

// ---------------------------------------------------------------- setup screen

interface Setup {
  open(): void
  close(): void
  isOpen(): boolean
  /** a key while the screen is open; returns true when handled */
  key(k: RemoteKey): boolean
}

function makeSetup(host: TvHost, onClosed: () => void): Setup {
  let root: HTMLElement | null = null
  let state: TvState | null = null
  let poll: ReturnType<typeof setInterval> | undefined
  let renderedFor = ''
  let qrFor = ''
  let qrUrl = ''

  const sig = (s: TvState): string => JSON.stringify([s.mode, s.hasAccess, s.paired, s.code, s.canOpenAccessSettings])

  const button = (label: string, run: () => void, primary = false): HTMLButtonElement => {
    const b = el('button', `tvsetup__btn${primary ? ' is-primary' : ''}`, label)
    b.type = 'button'
    b.dataset.tvfocus = '1'
    b.addEventListener('click', run)
    return b
  }

  const needsSetup = (s: TvState): boolean => (s.mode === 'local' && !s.hasAccess) || (s.mode === 'paired' && !s.paired)

  async function choose(mode: TvState['mode']): Promise<void> {
    await host.rpc('tvSetMode', mode)
    await refresh(true)
  }

  async function refresh(force = false): Promise<void> {
    const s = await host.rpc<TvState>('tvState').catch(() => null)
    if (!s || !root) return
    state = s
    if (!force && sig(s) === renderedFor) return
    renderedFor = sig(s)
    await render(s)
  }

  async function render(s: TvState): Promise<void> {
    if (!root) return
    const focusedLabel = (document.activeElement as HTMLElement | null)?.textContent ?? ''
    root.replaceChildren()
    const head = el('header', 'tvsetup__head')
    head.append(el('h1', undefined, 'Lyrics on your TV'), el('p', undefined, `This is “${s.deviceName}”. Choose where the music comes from.`))

    const choices = el('div', 'tvsetup__choices')
    const pair = button('Pair with Lyra on my phone or computer', () => void choose('paired'), s.mode === 'paired')
    pair.classList.toggle('is-current', s.mode === 'paired')
    const local = button('Use the music playing on this TV', () => void choose('local'), s.mode === 'local')
    local.classList.toggle('is-current', s.mode === 'local')
    choices.append(pair, local)

    const detail = el('section', 'tvsetup__detail')
    if (s.mode === 'paired') {
      if (qrFor !== s.link) {
        qrFor = s.link
        try {
          const QR = (await import('qrcode')).default
          qrUrl = await QR.toDataURL(s.link, { margin: 1, width: 440, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
        } catch {
          qrUrl = ''
        }
      }
      const qr = el('div', 'tvsetup__qr')
      if (qrUrl) {
        const img = el('img')
        img.src = qrUrl
        img.alt = 'QR code for pairing'
        qr.append(img)
      }
      const text = el('div', 'tvsetup__how')
      text.append(
        el('p', 'tvsetup__step', 'On your phone or computer open Lyra, choose Connect to a TV, then scan this code or type:'),
        el('p', 'tvsetup__code', s.code),
        el('p', 'tvsetup__status', s.paired ? 'Connected. Start a song.' : 'Waiting for your device…')
      )
      text.append(button('New code', () => void host.rpc('tvResetCode').then(() => refresh(true))))
      detail.append(qr, text)
    } else if (!s.hasAccess) {
      const text = el('div', 'tvsetup__how')
      text.append(
        el('p', 'tvsetup__step', 'Lyra reads the song from the music app on this TV (for example Spotify). Android asks you to allow it first: notification access for Lyra. Lyra never reads your notifications.')
      )
      if (s.canOpenAccessSettings) {
        text.append(button('Open the notification access screen', () => void host.rpc('tvOpenAccess'), true))
      } else {
        text.append(
          el('p', 'tvsetup__step', 'This TV has no Settings screen for that. Allow it once from a computer on the same network:'),
          el('p', 'tvsetup__cmd', s.adb)
        )
      }
      text.append(button('I allowed it, check again', () => void host.rpc('refresh').then(() => refresh(true))), el('p', 'tvsetup__status', 'Waiting for access…'))
      detail.append(text)
    } else {
      const text = el('div', 'tvsetup__how')
      text.append(el('p', 'tvsetup__step', 'Lyra can see what this TV plays. Start a song in your music app and the lyrics appear here.'), el('p', 'tvsetup__status', 'Ready.'))
      detail.append(text)
    }

    const foot = el('footer', 'tvsetup__foot')
    foot.append(button(needsSetup(s) ? 'Exit' : 'Done', () => (needsSetup(s) ? host.exit() : close())))
    root.append(head, choices, detail, foot)
    // keep the highlight where it was after a redraw, otherwise start on the current choice
    const all = focusables(root)
    const again = all.find((f) => f.node.textContent === focusedLabel) ?? all.find((f) => f.node.classList.contains('is-current')) ?? all[0]
    again?.node.focus()
  }

  function open(): void {
    if (root) return
    root = el('div', 'tvsetup')
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-label', 'Set up Lyra on this TV')
    document.body.append(root)
    document.documentElement.dataset.tvSetup = '1'
    renderedFor = ''
    void refresh(true)
    poll = setInterval(() => void refresh(), 2000)
  }

  function close(): void {
    if (!root) return
    clearInterval(poll)
    root.remove()
    root = null
    delete document.documentElement.dataset.tvSetup
    onClosed()
  }

  return {
    open,
    close,
    isOpen: () => !!root,
    key(k) {
      if (!root) return false
      if (k === 'back') {
        if (state && needsSetup(state)) host.exit()
        else close()
        return true
      }
      if (k === 'up' || k === 'down' || k === 'left' || k === 'right') {
        moveFocus(root, k)
        return true
      }
      return k !== 'select' // Enter clicks the focused button by itself
    }
  }
}

// ---------------------------------------------------------------- start

export function startTv(host: TvHost): void {
  const hud = makeHud()
  const setup = makeSetup(host, () => (document.activeElement as HTMLElement | null)?.blur())

  // first start: a TV is watched from a sofa, so the look changes with every song and the screen stays on
  try {
    if (!localStorage.getItem('lyra.tvDefaultsV1')) {
      localStorage.setItem('lyra.tvDefaultsV1', '1')
      void window.lyra.settings.set({ vibeMode: 'cycle', vibe: 'neon', keepScreenOn: true, backgroundInMini: true })
    }
  } catch {
    /* storage unavailable: the shared defaults are fine */
  }

  const player = (): ReturnType<typeof usePlayer.getState> => usePlayer.getState()

  const run = (k: RemoteKey, e?: KeyboardEvent): void => {
    if (setup.isOpen()) {
      if (setup.key(k)) {
        e?.preventDefault()
        e?.stopImmediatePropagation()
      }
      return
    }
    const shown = controlsShown()
    let action = decide(k, shown)
    const onControl = !!document.activeElement?.closest('.full button, .full [role="slider"]')
    if (action.type === 'pass' && k === 'select' && !onControl) action = { type: 'toggle' }
    if (action.type === 'move' && !onControl) {
      // first D-pad press with the chrome up: land on play / pause instead of jumping somewhere unexpected
      const full = document.querySelector('.full')
      if (full) moveFocus(full, action.dir)
      e?.preventDefault()
      e?.stopImmediatePropagation()
      return
    }
    if (action.type === 'pass') return
    e?.preventDefault()
    e?.stopImmediatePropagation()
    switch (action.type) {
      case 'toggle': {
        const was = player().snapshot?.isPlaying
        player().toggle()
        hud.say(was ? 'Paused' : 'Playing')
        wake()
        break
      }
      case 'play':
        void player().command({ type: 'play' })
        break
      case 'pause':
        void player().command({ type: 'pause' })
        break
      case 'seek':
        player().seek(Math.max(0, getPosition() + action.ms))
        hud.say(`${action.ms > 0 ? '+' : '−'}${Math.abs(action.ms) / 1000} s`)
        break
      case 'track':
        void player().command({ type: action.dir > 0 ? 'next' : 'previous' })
        hud.say(action.dir > 0 ? 'Next song' : 'Previous song')
        break
      case 'look':
        cycleVibe(action.dir) // announces itself with the app's own toast
        break
      case 'move': {
        const full = document.querySelector('.full')
        if (full) moveFocus(full, action.dir)
        break
      }
      case 'setup':
        setup.open()
        break
    }
  }

  window.addEventListener(
    'keydown',
    (e) => {
      const k = remoteKey(e)
      if (!k || e.repeat && k === 'select') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      run(k, e)
    },
    true
  )
  window.__lyraTv = {
    key: (name) => {
      const k = nativeKey(name)
      if (k) run(k)
    }
  }

  // Back: the activity asks the page first. Close what is open, otherwise let the app leave.
  window.__lyraNative ??= { push: () => undefined, back: () => false }
  window.__lyraNative.back = () => {
    if (setup.isOpen()) return setup.key('back')
    const ui = useUi.getState()
    if (ui.panel !== 'none') {
      ui.setPanel('none')
      return true
    }
    return false
  }

  void (async () => {
    const s = await host.rpc<TvState>('tvState').catch(() => null)
    if (host.forceSetup || (s && ((s.mode === 'local' && !s.hasAccess) || (s.mode === 'paired' && !s.paired)))) setup.open()
  })()
}
