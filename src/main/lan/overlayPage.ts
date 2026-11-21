/**
 * The stream / OBS overlay: a self-contained page (no build step, no external requests, no imports) that the local
 * viewer server hands out at `/overlay`. Add it to OBS as a Browser Source, or open it on any screen.
 *
 *   http://<pc>:47813/overlay?k=<key>&vibe=neon&size=72&chroma=00ff00
 *
 * The page keeps a `LyraFeed` (see src/shared/lyraFeed.ts) filled from the server's /events + /lyrics + /art, and draws
 * it in one of ten text "looks". Every app vibe maps to the nearest look (LOOKS below): the overlay is DOM text, not the
 * app's full scene renderer, so it stays tiny, transparent and cheap on a streaming PC.
 *
 * OVERLAY_CORE_JS is plain JS shared by the page and by the unit tests (which run it with `new Function`).
 * This file must stay free of imports so a plain script can load it too (scripts/ui-test/overlay-check.mjs).
 */

export const OVERLAY_CORE_JS = String.raw`
var LOOKS = {
  none: 'classic', sunset: 'classic', lens: 'classic', dream: 'classic', wall: 'classic', web: 'classic', route: 'classic', metro: 'classic', picto: 'classic', flap: 'classic',
  neon: 'neon',
  chrome: 'chrome',
  crt: 'terminal', editor: 'terminal', blocks: 'terminal',
  noir: 'subtitle', film: 'subtitle', filmstrip: 'subtitle', trailer: 'subtitle', stadium: 'subtitle',
  chat: 'chat', lock: 'chat', wallet: 'chat',
  sticker: 'sticker', comic: 'sticker', stencil: 'sticker',
  paper: 'hand', sketch: 'hand', cassette: 'hand',
  arcade: 'pixel',
  glitch: 'glitch'
}
var LOOK_NAMES = ['classic', 'neon', 'chrome', 'terminal', 'subtitle', 'chat', 'sticker', 'hand', 'pixel', 'glitch']
/** the look that suits a vibe id (unknown ids fall back to classic) */
function lookFor(vibe) {
  var v = String(vibe || '').toLowerCase()
  return Object.prototype.hasOwnProperty.call(LOOKS, v) ? LOOKS[v] : 'classic'
}
function num(v, d, min, max) {
  if (v === null || v === undefined || v === '') return d
  var n = Number(v)
  if (!isFinite(n)) return d
  return Math.min(max, Math.max(min, n))
}
function bool(v, d) {
  if (v === null || v === undefined || v === '') return d
  return !/^(0|false|no|off)$/i.test(String(v))
}
/** a colour from a URL parameter: 3/6/8 hex digits (with or without #) or a plain colour name; anything else is rejected */
function cleanColor(v, fallback) {
  if (v === null || v === undefined) return fallback
  var s = String(v).trim().replace(/^#/, '')
  if (/^([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return '#' + s.toLowerCase()
  if (/^[a-z]{3,20}$/i.test(s)) return s.toLowerCase()
  return fallback
}
/** a font family from a URL parameter: letters, digits, spaces, dashes, commas only (no quotes, no semicolons) */
function cleanFont(v) {
  if (!v) return ''
  var s = String(v).replace(/[^A-Za-z0-9 ,_-]/g, '').trim().slice(0, 80)
  return s
}
/** everything the page can be told through the URL */
function parseOptions(search) {
  var q = new URLSearchParams(search || '')
  var rawVibe = (q.get('vibe') || 'app').toLowerCase()
  var look = q.get('look')
  look = look && LOOK_NAMES.indexOf(look.toLowerCase()) >= 0 ? look.toLowerCase() : ''
  var bgRaw = q.get('chroma') || q.get('bg') || ''
  var bg = !bgRaw || /^(transparent|none|clear)$/i.test(bgRaw) ? '' : cleanColor(bgRaw, '')
  var lines = Math.round(num(q.get('lines'), 3, 1, 9))
  var mode = (q.get('mode') || '').toLowerCase()
  if (mode !== 'single' && mode !== 'stack') mode = lines === 1 ? 'single' : 'stack'
  var pos = (q.get('pos') || 'bottom').toLowerCase()
  var align = (q.get('align') || 'center').toLowerCase()
  return {
    k: q.get('k') || '',
    vibe: rawVibe,
    look: look,
    lines: lines,
    mode: mode,
    size: num(q.get('size'), 64, 12, 400),
    scale: num(q.get('scale'), 1, 0.25, 4),
    font: cleanFont(q.get('font')),
    align: align === 'left' || align === 'right' ? align : 'center',
    pos: pos === 'top' || pos === 'middle' ? pos : 'bottom',
    bg: bg,
    color: cleanColor(q.get('color'), ''),
    accent: cleanColor(q.get('accent'), ''),
    shadow: bool(q.get('shadow'), true),
    words: bool(q.get('words'), true),
    meta: bool(q.get('meta'), false),
    art: bool(q.get('art'), false),
    progress: bool(q.get('progress'), false),
    idle: bool(q.get('idle'), false),
    debug: bool(q.get('debug'), false),
    nudge: Math.round(num(q.get('nudge'), 0, -5000, 5000))
  }
}
/** the look to draw: an explicit look= wins, then an explicit vibe=, then the app's own vibe (when vibe=app) */
function resolveLook(opts, appVibe) {
  if (opts.look) return opts.look
  if (opts.vibe && opts.vibe !== 'app') return lookFor(opts.vibe)
  return lookFor(appVibe)
}
/** rough per-word timing inside line-synced lyrics (words share the line's window by length) */
function estimate(ls, dur) {
  return ls.map(function (l, i) {
    var next = ls[i + 1] ? ls[i + 1].timeMs : (dur || l.timeMs + 4000)
    var end = Math.min(next - 120, l.timeMs + 7000)
    var ws = String(l.text || '').split(/\s+/).filter(Boolean)
    var total = ws.reduce(function (n, w) { return n + w.length + 1.5 }, 0) || 1
    var at = l.timeMs
    return {
      start: l.timeMs,
      text: l.text,
      words: ws.map(function (w) {
        var from = at
        at += ((w.length + 1.5) / total) * Math.max(300, end - l.timeMs)
        return { w: w, from: from, to: at }
      })
    }
  })
}
/** index of the line being sung at position p (-1 before the first line) */
function activeIndex(lines, p) {
  var lo = 0, hi = lines.length - 1, ans = -1
  while (lo <= hi) {
    var mid = (lo + hi) >> 1
    if (lines[mid].start <= p) { ans = mid; lo = mid + 1 } else hi = mid - 1
  }
  return ans
}
/** which lines to keep on screen: [from, to) around the active one; one earlier line stays as context when 3 or more fit */
function windowRange(idx, count, total) {
  var keepPrev = count >= 3 ? 1 : 0
  var from = idx < 0 ? 0 : Math.max(0, idx - keepPrev)
  var to = Math.min(total, from + count)
  from = Math.max(0, Math.min(from, to - count))
  return [from, to]
}
/** 0..1 progress of a word at position p */
function wordProgress(w, p) {
  return Math.min(1, Math.max(0, (p - w.from) / Math.max(1, w.to - w.from)))
}
/** the play position of a LyraFeed at local time nowMs (extrapolates while playing; never negative) */
function positionAt(feed, nowMs, nudgeMs) {
  var c = feed.positionClock
  var run = c.playing ? nowMs + c.skewMs - c.sampledAt : 0
  return Math.max(0, c.positionMs + run + (nudgeMs || 0))
}
function emptyFeed() {
  return { nowPlaying: null, positionClock: { positionMs: 0, sampledAt: 0, playing: false, skewMs: 0 }, lyrics: { status: 'none', lines: [] }, vibe: null, videoRef: null }
}
/** applies one /events message to a feed; reports whether the song changed */
function applyState(feed, m, localNow) {
  var changed = false
  if (m.now) feed.positionClock.skewMs = m.now - localNow
  if (!m.trackId) {
    changed = !!feed.nowPlaying
    feed.nowPlaying = null
    feed.lyrics = { status: 'none', lines: [] }
  } else {
    var prev = feed.nowPlaying ? feed.nowPlaying.trackId : ''
    changed = prev !== m.trackId
    feed.nowPlaying = { trackId: m.trackId, title: m.title || '', artists: m.artists || '', durationMs: m.durationMs || 0, artUrl: m.hasArt ? '/art' : null }
    if (changed) feed.lyrics = { status: 'loading', lines: [] }
  }
  feed.positionClock.positionMs = m.positionMs || 0
  feed.positionClock.sampledAt = m.sampledAt || localNow
  feed.positionClock.playing = !!m.playing
  if (m.vibe) feed.vibe = m.vibe
  return changed
}
`

export const OVERLAY_CSS = String.raw`
:root { --fs: 64px; --fg: #fff; --ac: #ff7a59; --dim: .42; --ease: cubic-bezier(.22,1,.36,1); }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: transparent; overflow: hidden; color: var(--fg); -webkit-font-smoothing: antialiased; font-family: var(--ff, Inter, 'Segoe UI', system-ui, sans-serif); }
#stage { position: fixed; inset: 0; display: flex; flex-direction: column; padding: 4vh 5vw; gap: calc(var(--fs) * .3); }
body[data-pos=bottom] #stage { justify-content: flex-end; }
body[data-pos=middle] #stage { justify-content: center; }
body[data-pos=top] #stage { justify-content: flex-start; }
body[data-align=left] #stage { align-items: flex-start; text-align: left; }
body[data-align=right] #stage { align-items: flex-end; text-align: right; }
body[data-align=center] #stage { align-items: center; text-align: center; }
#lines { display: flex; flex-direction: column; gap: calc(var(--fs) * .22); max-width: 100%; }
body[data-align=left] #lines { align-items: flex-start; } body[data-align=right] #lines { align-items: flex-end; } body[data-align=center] #lines { align-items: center; }
.ln { font-size: var(--fs); line-height: 1.14; font-weight: 800; letter-spacing: -.02em; opacity: var(--dim); max-width: 100%; overflow-wrap: anywhere; transition: opacity .35s; }
.ln.on { opacity: 1; animation: in .45s var(--ease); }
.ln:not(.on) { font-size: calc(var(--fs) * .62); }
body[data-shadow="1"] .ln { text-shadow: 0 .04em .12em rgba(0,0,0,.65), 0 0 .5em rgba(0,0,0,.35); }
.wd { transition: opacity .15s; }
body[data-words="1"] .ln.on .wd.todo { opacity: .5; }
@keyframes in { from { opacity: 0; transform: translateY(.3em) scale(.97); } to { opacity: 1; transform: none; } }
#meta { display: none; align-items: center; gap: calc(var(--fs) * .25); font-size: calc(var(--fs) * .36); font-weight: 700; padding: .5em .8em; border-radius: 1em; background: rgba(10,10,14,.55); backdrop-filter: blur(8px); max-width: 100%; }
body[data-meta="1"] #meta.show { display: flex; }
#meta img { width: 2.6em; height: 2.6em; border-radius: .5em; object-fit: cover; display: none; }
body[data-art="1"] #meta img.show { display: block; }
#meta .t { font-weight: 800; } #meta .a { opacity: .7; font-weight: 600; }
#bar { display: none; height: calc(var(--fs) * .07); min-height: 3px; width: min(70vw, 900px); background: rgba(255,255,255,.2); border-radius: 9px; overflow: hidden; }
body[data-progress="1"] #bar { display: block; }
#bar b { display: block; height: 100%; background: var(--ac); transform-origin: left; transform: scaleX(0); }
#msg { font-size: calc(var(--fs) * .5); opacity: .7; font-weight: 700; }
#dbg { position: fixed; left: 8px; top: 6px; font: 12px/1.3 ui-monospace, monospace; color: #fff; background: rgba(0,0,0,.6); padding: 4px 8px; border-radius: 6px; display: none; white-space: pre; }
body[data-debug="1"] #dbg { display: block; }

/* classic: clean white lines with a soft glow */
body[data-look=classic] .ln.on { text-shadow: 0 0 .6em color-mix(in srgb, var(--ac) 55%, transparent), 0 .04em .12em rgba(0,0,0,.6); }
/* neon: glowing tube text */
body[data-look=neon] { --ac: #ff3df0; }
body[data-look=neon] .ln { font-weight: 700; letter-spacing: .02em; text-transform: lowercase; }
body[data-look=neon] .ln.on { color: #fff; text-shadow: 0 0 .08em #fff, 0 0 .25em var(--ac), 0 0 .6em var(--ac), 0 0 1.2em var(--ac); }
body[data-look=neon] .ln:not(.on) { color: var(--ac); text-shadow: 0 0 .3em var(--ac); }
/* chrome: liquid metal */
body[data-look=chrome] { --ac: #8fb7ff; }
body[data-look=chrome] .ln.on { background: linear-gradient(180deg, #fff 0%, #cfd8ee 38%, #6c7aa0 50%, #e9eefc 62%, #8190b8 100%); -webkit-background-clip: text; background-clip: text; color: transparent; text-shadow: none; filter: drop-shadow(0 .04em .06em rgba(0,0,0,.55)); font-style: italic; }
body[data-look=chrome] .ln:not(.on) { font-style: italic; }
body[data-look=chrome] .ln.on .wd.todo { opacity: .7; }
/* terminal: a lyric log */
body[data-look=terminal] { --ff: 'Cascadia Mono', 'JetBrains Mono', Consolas, ui-monospace, monospace; --ac: #4ade80; --fg: #c8f7d4; }
body[data-look=terminal] #lines { background: rgba(4,12,6,.78); border: 1px solid rgba(74,222,128,.45); border-radius: .3em; padding: .5em .8em; align-items: flex-start; text-align: left; }
body[data-look=terminal] .ln { font-weight: 500; letter-spacing: 0; }
body[data-look=terminal] .ln::before { content: '> '; color: var(--ac); }
body[data-look=terminal] .ln.on::after { content: '█'; color: var(--ac); animation: blink 1s steps(2) infinite; margin-left: .15em; }
@keyframes blink { 50% { opacity: 0; } }
/* subtitle: film subtitles, white with a black outline */
body[data-look=subtitle] .ln { font-weight: 600; letter-spacing: 0; font-family: var(--ff, Georgia, 'Times New Roman', serif); }
body[data-look=subtitle] .ln.on { -webkit-text-stroke: .05em #000; paint-order: stroke fill; text-shadow: 0 .05em .1em rgba(0,0,0,.8); }
body[data-look=subtitle] .ln:not(.on) { display: none; }
body[data-look=subtitle][data-lines-many="1"] .ln:not(.on) { display: block; }
/* chat: message bubbles */
body[data-look=chat] { --ac: #0a84ff; }
body[data-look=chat] #lines { align-items: stretch; }
body[data-look=chat] .ln { display: block; width: fit-content; max-width: 88%; font-size: calc(var(--fs) * .8); font-weight: 600; letter-spacing: 0; padding: .35em .75em; border-radius: 1em; background: #2c2c30; color: #fff; text-shadow: none; }
body[data-look=chat] .ln:not(.on) { font-size: calc(var(--fs) * .8); }
body[data-look=chat] .ln.alt { align-self: flex-end; background: var(--ac); }
body[data-look=chat] .ln:not(.alt) { align-self: flex-start; }
/* sticker: die-cut pop */
body[data-look=sticker] { --ac: #ffd23f; }
body[data-look=sticker] .ln { font-weight: 900; text-transform: uppercase; letter-spacing: 0; color: #111; background: #fff; padding: .1em .4em; border: .07em solid #111; border-radius: .25em; box-shadow: .08em .08em 0 #111; text-shadow: none; transform: rotate(-1.2deg); }
body[data-look=sticker] .ln.on { background: var(--ac); }
body[data-look=sticker] .ln.alt { transform: rotate(1.2deg); }
body[data-look=sticker] .ln.on .wd.todo { opacity: .55; }
/* hand: handwriting on paper */
body[data-look=hand] { --ff: 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive; --fg: #2b2a33; --ac: #c2410c; }
body[data-look=hand] .ln { font-weight: 600; letter-spacing: 0; background: #fbf5e6; padding: .1em .5em; border-radius: .15em; box-shadow: 0 .06em .2em rgba(0,0,0,.35); text-shadow: none; transform: rotate(-.8deg); }
body[data-look=hand] .ln.alt { transform: rotate(.8deg); }
/* pixel: 8-bit arcade */
body[data-look=pixel] { --ff: 'Press Start 2P', 'Courier New', ui-monospace, monospace; --ac: #fde047; }
body[data-look=pixel] .ln { font-weight: 700; letter-spacing: .02em; text-transform: uppercase; font-size: calc(var(--fs) * .7); line-height: 1.35; text-shadow: .08em .08em 0 #000; }
body[data-look=pixel] .ln:not(.on) { font-size: calc(var(--fs) * .45); }
body[data-look=pixel] .ln.on { color: var(--ac); }
/* glitch: RGB split */
body[data-look=glitch] { --ac: #00e5ff; }
body[data-look=glitch] .ln.on { text-shadow: .04em 0 #ff2a6d, -.04em 0 #00e5ff; animation: in .3s var(--ease), jit 2.4s infinite 0.6s; }
@keyframes jit { 0%, 92%, 100% { transform: none; } 94% { transform: translateX(.04em); } 96% { transform: translateX(-.05em) skewX(-4deg); } 98% { transform: translateX(.02em); } }
@media (prefers-reduced-motion: reduce) { .ln.on, body[data-look=glitch] .ln.on { animation: none; } }
`

const OVERLAY_SCRIPT = String.raw`
(function () {
  var opts = parseOptions(location.search)
  var K = opts.k
  var $ = function (id) { return document.getElementById(id) }
  var body = document.body
  var feed = emptyFeed()
  var appVibe = null
  var lines = []
  var lastKey = ''
  var curLook = ''

  function applyStyle() {
    var look = resolveLook(opts, feed.vibe || appVibe)
    curLook = look
    body.dataset.look = look
    body.dataset.pos = opts.pos
    body.dataset.align = opts.align
    body.dataset.shadow = opts.shadow ? '1' : '0'
    body.dataset.words = opts.words ? '1' : '0'
    body.dataset.meta = opts.meta ? '1' : '0'
    body.dataset.art = opts.art ? '1' : '0'
    body.dataset.progress = opts.progress ? '1' : '0'
    body.dataset.debug = opts.debug ? '1' : '0'
    body.dataset.linesMany = opts.lines > 1 ? '1' : '0'
    var fs = opts.size * opts.scale * (innerHeight / 1080)
    var r = document.documentElement.style
    r.setProperty('--fs', Math.max(10, fs).toFixed(1) + 'px')
    if (opts.font) r.setProperty('--ff', opts.font)
    if (opts.color) r.setProperty('--fg', opts.color)
    if (opts.accent) r.setProperty('--ac', opts.accent)
    body.style.background = opts.bg || 'transparent'
  }

  function setMsg(t) { $('msg').textContent = t || ''; $('msg').style.display = t ? '' : 'none' }

  function renderMeta() {
    var np = feed.nowPlaying
    var m = $('meta')
    if (!np) { m.classList.remove('show'); return }
    m.classList.add('show')
    $('mt').textContent = np.title
    $('ma').textContent = np.artists
    var im = $('mi')
    if (np.artUrl) { im.src = np.artUrl + '?k=' + encodeURIComponent(K) + '&t=' + encodeURIComponent(np.trackId); im.classList.add('show') } else { im.classList.remove('show'); im.removeAttribute('src') }
  }

  function loadLyrics() {
    var id = feed.nowPlaying && feed.nowPlaying.trackId
    lines = []; lastKey = ''
    if (!id) return
    fetch('/lyrics?k=' + encodeURIComponent(K)).then(function (r) { return r.json() }).then(function (r) {
      if (!feed.nowPlaying || feed.nowPlaying.trackId !== id) return
      feed.lyrics = { status: r.status, lines: r.lines || [] }
      lines = r.status === 'synced' ? estimate(feed.lyrics.lines, feed.nowPlaying.durationMs) : []
      lastKey = ''
      setMsg(opts.idle && !lines.length ? (r.status === 'instrumental' ? '♪' : '') : '')
    }).catch(function () { feed.lyrics = { status: 'error', lines: [] } })
  }

  function connect() {
    var es = new EventSource('/events?k=' + encodeURIComponent(K))
    es.onerror = function () { es.close(); $('dbg').textContent = 'reconnecting…'; setTimeout(connect, 2000) }
    es.onopen = function () { $('dbg').textContent = 'connected' }
    es.onmessage = function (e) {
      var m
      try { m = JSON.parse(e.data) } catch (x) { return }
      if (m.type !== 'state') return
      var changed = applyState(feed, m, Date.now())
      if (m.vibe) appVibe = m.vibe
      applyStyle()
      if (changed) { renderMeta(); loadLyrics() }
      if (!m.trackId) { lines = []; lastKey = ''; $('lines').textContent = ''; setMsg(opts.idle ? 'Play a song in Lyra' : '') }
    }
  }

  function draw(idx) {
    var host = $('lines')
    host.textContent = ''
    var r = windowRange(idx, opts.mode === 'single' ? 1 : opts.lines, lines.length)
    for (var i = r[0]; i < r[1]; i++) {
      var l = lines[i]
      var p = document.createElement('p')
      p.className = 'ln' + (i === idx ? ' on' : '') + (i % 2 ? ' alt' : '')
      if (l.words.length) {
        l.words.forEach(function (w, k) {
          var s = document.createElement('span'); s.className = 'wd todo'; s.textContent = w.w
          p.appendChild(s)
          if (k < l.words.length - 1) p.appendChild(document.createTextNode(' '))
        })
      } else p.textContent = '♪'
      host.appendChild(p)
    }
  }

  function frame() {
    var np = feed.nowPlaying
    if (np && lines.length) {
      var p = positionAt(feed, Date.now(), opts.nudge)
      var idx = activeIndex(lines, p)
      var key = idx + '|' + curLook
      if (key !== lastKey) { lastKey = key; draw(idx) }
      var on = $('lines').querySelector('.ln.on')
      if (on && idx >= 0) {
        var ws = lines[idx].words, sp = on.children
        for (var k = 0; k < sp.length && ws[k]; k++) {
          var done = wordProgress(ws[k], p) > 0.02
          if (done === sp[k].classList.contains('todo')) { sp[k].classList.toggle('todo', !done); sp[k].classList.toggle('done', done) }
        }
      }
      $('bar').firstElementChild.style.transform = 'scaleX(' + (np.durationMs ? Math.min(1, p / np.durationMs) : 0).toFixed(4) + ')'
    } else if (np) {
      $('bar').firstElementChild.style.transform = 'scaleX(' + (np.durationMs ? Math.min(1, positionAt(feed, Date.now(), 0) / np.durationMs) : 0).toFixed(4) + ')'
    }
    requestAnimationFrame(frame)
  }

  applyStyle()
  addEventListener('resize', applyStyle)
  setMsg('')
  connect(); frame()
})()
`

export const OVERLAY_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Lyra overlay</title>
<style>${OVERLAY_CSS}</style>
</head>
<body data-look="classic" data-pos="bottom" data-align="center">
<div id="stage">
  <div id="meta"><img id="mi" alt="" /><div><div class="t" id="mt"></div><div class="a" id="ma"></div></div></div>
  <div id="msg" style="display:none"></div>
  <div id="lines"></div>
  <div id="bar"><b></b></div>
</div>
<div id="dbg"></div>
<script>${OVERLAY_CORE_JS}${OVERLAY_SCRIPT}</script>
</body>
</html>
`
