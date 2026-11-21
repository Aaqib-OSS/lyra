/**
 * Draws a shareable lyric card (story size, 1080x1920) on a canvas: the song's colours, a soft blurred cover,
 * a few chosen lines in big type, the song title and a small Lyra mark. Entirely local; nothing is uploaded.
 */
export interface CardInput {
  lines: string[]
  title: string
  artist: string
  artworkUrl: string | null
  accent: string
  tint1: string
  tint2: string
  /** classic: big type on the blurred cover; doodle: a dark card with hand-drawn marks on the words */
  style?: 'classic' | 'doodle'
  /** the card's own look (colours, paper, handwriting): each vibe has one, see cardTheme */
  theme?: CardTheme
}


/** How a doodle card looks for one vibe: the paper, the pen and the type. */
export interface CardTheme {
  bg: string
  card: [string, string]
  border: string
  borderW: number
  /** a hard offset shadow (sticker / arcade look); empty for none */
  shadow: string
  radius: number
  ink: string
  ink2: string
  /** pen colours: underline, circle, strike-through, handwriting */
  pen: [string, string, string, string]
  accentMarks: string
  font?: string
  /** the font to wait for before drawing, e.g. '800 40px "Caveat"' */
  load?: string
  fontScale?: number
  pattern: 'none' | 'grid' | 'lines' | 'scan' | 'dots'
  patternColor: string
  markBg: string
  markInk: string
}

const DARK: CardTheme = {
  bg: '#050505', card: ['#2c2928', '#1f1d1c'], border: 'rgba(255,255,255,0.08)', borderW: 2, shadow: '', radius: 72, ink: '#ffffff', ink2: 'rgba(255,255,255,0.78)',
  pen: ['#ee6a62', '#d86bd0', '#e34a45', '#e9a6e4'], accentMarks: 'rgba(190,225,235,0.75)', pattern: 'none', patternColor: '', markBg: '#ffffff', markInk: '#111111'
}

/** One card per vibe, so the card you share looks like the screen you were looking at. */
const THEMES: Record<string, Partial<CardTheme>> = {
  neon: { bg: '#07020f', card: ['#1a0a33', '#0b0418'], border: '#ff3df2', borderW: 6, radius: 44, pen: ['#2ef2ff', '#ff3df2', '#ffe14d', '#7df9ff'], accentMarks: '#ff3df2', pattern: 'grid', patternColor: 'rgba(255,61,242,0.16)' },
  chrome: { bg: '#0b0e14', card: ['#eef2f8', '#aab4c4'], border: '#ffffff', borderW: 6, radius: 90, ink: '#0b1220', ink2: '#2a3446', pen: ['#2b5cff', '#d6246e', '#0b1220', '#5b3df5'], accentMarks: '#2b5cff', pattern: 'lines', patternColor: 'rgba(255,255,255,0.35)', markBg: '#0b1220', markInk: '#ffffff' },
  dream: { bg: '#1b1235', card: ['#f6edff', '#d8cbff'], border: '#ffffff', borderW: 5, radius: 110, ink: '#3a2a66', ink2: '#5b4a8a', pen: ['#ff7ab8', '#7a5cff', '#ff7ab8', '#6c4bd8'], accentMarks: '#7a5cff', pattern: 'dots', patternColor: 'rgba(122,92,255,0.18)', markBg: '#3a2a66', markInk: '#ffffff' },
  crt: { bg: '#000000', card: ['#03150c', '#020d07'], border: '#35ff7a', borderW: 4, radius: 10, ink: '#b9ffcb', ink2: 'rgba(185,255,203,0.75)', pen: ['#35ff7a', '#ffe14d', '#ff5c5c', '#7dffb0'], accentMarks: '#35ff7a', font: "'VT323', monospace", load: '800 40px "VT323"', fontScale: 1.25, pattern: 'scan', patternColor: 'rgba(53,255,122,0.07)', markBg: '#35ff7a', markInk: '#021008' },
  sticker: { bg: '#ffe94a', card: ['#ffffff', '#ffffff'], border: '#111111', borderW: 12, shadow: '#111111', radius: 48, ink: '#111111', ink2: '#333333', pen: ['#ff3d81', '#2b6bff', '#ff3d81', '#2b6bff'], accentMarks: '#ff8a00', font: "'Unbounded Variable', 'Nunito Variable', sans-serif", load: '800 40px "Unbounded Variable"', fontScale: 0.82, pattern: 'dots', patternColor: 'rgba(17,17,17,0.12)', markBg: '#111111', markInk: '#ffffff' },
  chat: { bg: '#0a0f1f', card: ['#18213a', '#111a2e'], border: '#2f6bff', borderW: 3, radius: 64, pen: ['#5ad1ff', '#9b8cff', '#ff6b8b', '#9be7ff'], accentMarks: '#5ad1ff', pattern: 'none', markBg: '#2f6bff', markInk: '#ffffff' },
  paper: { bg: '#e9dfc9', card: ['#fffaf0', '#fbf1dc'], border: '#2d2a3a', borderW: 5, shadow: 'rgba(45,42,58,0.35)', radius: 28, ink: '#2d2a3a', ink2: '#5a5568', pen: ['#e2554d', '#2f6bff', '#e2554d', '#2f6bff'], accentMarks: '#e2554d', font: "'Caveat', cursive", load: '700 40px "Caveat"', fontScale: 1.3, pattern: 'lines', patternColor: 'rgba(60,90,160,0.18)', markBg: '#2d2a3a', markInk: '#fffaf0' },
  arcade: { bg: '#06061a', card: ['#101046', '#0a0a2e'], border: '#ffe600', borderW: 8, shadow: '#ff2d6f', radius: 0, ink: '#ffffff', ink2: '#c9c9ff', pen: ['#ffe600', '#00e5ff', '#ff2d6f', '#00e5ff'], accentMarks: '#ffe600', font: "'Press Start 2P', monospace", load: '40px "Press Start 2P"', fontScale: 0.5, pattern: 'grid', patternColor: 'rgba(0,229,255,0.12)', markBg: '#ffe600', markInk: '#06061a' },
  noir: { bg: '#000000', card: ['#0c0c0c', '#050505'], border: '#ffffff', borderW: 3, radius: 6, ink: '#f4f4f4', ink2: 'rgba(244,244,244,0.7)', pen: ['#ffffff', '#cfcfcf', '#ffffff', '#cfcfcf'], accentMarks: '#ffffff', font: "'Iowan Old Style', 'Palatino Linotype', Georgia, serif", fontScale: 1, pattern: 'lines', patternColor: 'rgba(255,255,255,0.04)', markBg: '#ffffff', markInk: '#000000' },
  sunset: { bg: '#240a3a', card: ['#ff8a5c', '#ff2e93'], border: '#ffd1a6', borderW: 5, radius: 80, ink: '#ffffff', ink2: 'rgba(255,255,255,0.88)', pen: ['#ffe14d', '#2a0b3d', '#2a0b3d', '#fff2b0'], accentMarks: '#ffe14d', pattern: 'lines', patternColor: 'rgba(255,255,255,0.1)', markBg: '#2a0b3d', markInk: '#ffffff' },
  blocks: { bg: '#4b7d34', card: ['#8a8a8a', '#6b6b6b'], border: '#1d1d1d', borderW: 14, radius: 0, ink: '#ffffff', ink2: '#f0f0f0', pen: ['#ffe14d', '#55ff55', '#ff5555', '#55ffff'], accentMarks: '#55ff55', font: "'VT323', monospace", load: '800 40px "VT323"', fontScale: 1.25, pattern: 'grid', patternColor: 'rgba(0,0,0,0.12)', markBg: '#1d1d1d', markInk: '#ffffff', shadow: '#1d1d1d' },
  stadium: { bg: '#04122b', card: ['#0b3b86', '#072a63'], border: '#ffd23f', borderW: 6, radius: 18, pen: ['#ffd23f', '#ffffff', '#ff5c5c', '#ffe9a0'], accentMarks: '#ffd23f', pattern: 'lines', patternColor: 'rgba(255,255,255,0.07)', markBg: '#ffd23f', markInk: '#04122b' },
  cassette: { bg: '#2a1a0e', card: ['#ecdcc0', '#cdb893'], border: '#2a1a0e', borderW: 8, shadow: 'rgba(0,0,0,0.5)', radius: 28, ink: '#2a1a0e', ink2: '#4a3520', pen: ['#c8431b', '#1f5f8b', '#c8431b', '#1f5f8b'], accentMarks: '#c8431b', font: "'VT323', monospace", load: '800 40px "VT323"', fontScale: 1.25, pattern: 'lines', patternColor: 'rgba(42,26,14,0.1)', markBg: '#2a1a0e', markInk: '#ecdcc0' },
  sketch: { bg: '#e9dfb8', card: ['#f4ead0', '#e6d9ae'], border: '#1f1511', borderW: 8, shadow: '#d23a2a', radius: 10, ink: '#1f1511', ink2: '#3a2a22', pen: ['#d23a2a', '#1f1511', '#d23a2a', '#e08a2e'], accentMarks: '#d23a2a', font: "'Unbounded Variable', sans-serif", load: '800 40px "Unbounded Variable"', fontScale: 0.8, pattern: 'dots', patternColor: 'rgba(31,21,17,.12)', markBg: '#d23a2a', markInk: '#f4ead0' },
  glitch: { bg: '#0a0504', card: ['#1b0a07', '#0d0504'], border: '#ff4a2e', borderW: 5, shadow: '#26f0ff', radius: 4, ink: '#ffffff', ink2: 'rgba(255,255,255,0.8)', pen: ['#ff2a1a', '#26f0ff', '#ffffff', '#ff4a2e'], accentMarks: '#26f0ff', font: "'Unbounded Variable', sans-serif", load: '800 40px "Unbounded Variable"', fontScale: 0.8, pattern: 'scan', patternColor: 'rgba(255,255,255,0.06)', markBg: '#ff4a2e', markInk: '#0a0504' },
  comic: { bg: '#ffd400', card: ['#ffffff', '#fff6c9'], border: '#111111', borderW: 12, shadow: '#111111', radius: 16, ink: '#111111', ink2: '#2a2a2a', pen: ['#ff3b6b', '#27b6ff', '#ff3b6b', '#111111'], accentMarks: '#ff3b6b', font: "'Unbounded Variable', sans-serif", load: '800 40px "Unbounded Variable"', fontScale: 0.8, pattern: 'dots', patternColor: 'rgba(255,59,107,.2)', markBg: '#ff3b6b', markInk: '#ffffff' },
  stencil: { bg: '#1d1c1a', card: ['#33312d', '#262421'], border: '#ff6a00', borderW: 8, shadow: '#000000', radius: 2, ink: '#f2efe9', ink2: 'rgba(242,239,233,0.8)', pen: ['#ff6a00', '#f2efe9', '#ff6a00', '#ffb066'], accentMarks: '#ff6a00', font: "'Unbounded Variable', sans-serif", load: '800 40px "Unbounded Variable"', fontScale: 0.8, pattern: 'dots', patternColor: 'rgba(255,255,255,.06)', markBg: '#ff6a00', markInk: '#140d06' },
  film: { bg: '#140d07', card: ['#2a1a0e', '#1b1108'], border: '#e8b873', borderW: 5, shadow: '', radius: 4, ink: '#f6e9cf', ink2: 'rgba(246,233,207,0.78)', pen: ['#e8b873', '#f6e9cf', '#c8431b', '#ffcf8a'], accentMarks: '#e8b873', font: "'Fraunces Variable', Georgia, serif", load: '800 40px "Fraunces Variable"', fontScale: 0.95, pattern: 'lines', patternColor: 'rgba(246,233,207,.05)', markBg: '#e8b873', markInk: '#1b1108' },
  trailer: { bg: '#000000', card: ['#050505', '#000000'], border: '#c9a24a', borderW: 4, radius: 4, ink: '#f5e9c8', ink2: 'rgba(245,233,200,0.75)', pen: ['#c9a24a', '#f5e9c8', '#c9a24a', '#f5e9c8'], accentMarks: '#c9a24a', font: "'Iowan Old Style', 'Palatino Linotype', Georgia, serif", pattern: 'none', patternColor: '', markBg: '#c9a24a', markInk: '#000000' }
}

export function cardTheme(vibe: string): CardTheme {
  return { ...DARK, ...(THEMES[vibe] ?? {}) }
}

export const CARD_W = 1080
export const CARD_H = 1920
const SITE = 'lyra-website-rho.vercel.app'

function loadImage(src: string | null): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null)
    const img = new Image()
    img.crossOrigin = 'anonymous' // a remote image without CORS would taint the canvas: then we skip it
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const out: string[] = []
  let line = ''
  for (const w of words) {
    const t = line ? `${line} ${w}` : w
    if (ctx.measureText(t).width > maxW && line) {
      out.push(line)
      line = w
    } else line = t
  }
  if (line) out.push(line)
  return out
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export async function drawCard(canvas: HTMLCanvasElement, c: CardInput): Promise<boolean> {
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')!
  const family = getComputedStyle(document.body).fontFamily || 'Inter, system-ui, sans-serif'
  const art = await loadImage(c.artworkUrl)
  if (c.theme?.load) await document.fonts.load(c.theme.load).catch(() => undefined)
  if (c.style === 'doodle') return drawDoodle(ctx, c, art, family)

  // background: the song's colours, then a blurred cover, then a dark veil so the type stays readable
  const g = ctx.createLinearGradient(0, 0, CARD_W, CARD_H)
  g.addColorStop(0, c.tint1)
  g.addColorStop(1, c.tint2)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  if (art) {
    ctx.save()
    ctx.filter = 'blur(60px) saturate(1.6) brightness(1.15)'
    const s = Math.max(CARD_W / art.width, CARD_H / art.height) * 1.25
    ctx.globalAlpha = 1
    ctx.drawImage(art, (CARD_W - art.width * s) / 2, (CARD_H - art.height * s) / 2, art.width * s, art.height * s)
    ctx.restore()
  }
  const veil = ctx.createLinearGradient(0, 0, 0, CARD_H)
  veil.addColorStop(0, 'rgba(0,0,0,0.12)')
  veil.addColorStop(0.5, 'rgba(0,0,0,0.22)')
  veil.addColorStop(1, 'rgba(0,0,0,0.62)')
  ctx.fillStyle = veil
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // the lines: as big as will fit
  const margin = 96
  const maxW = CARD_W - margin * 2
  let size = 112
  let wrapped: string[] = []
  const maxBlock = 900
  for (; size >= 52; size -= 4) {
    ctx.font = `800 ${size}px ${family}`
    wrapped = c.lines.flatMap((l) => wrap(ctx, l, maxW))
    if (wrapped.length * size * 1.16 <= maxBlock) break
  }
  const lh = size * 1.16
  const blockH = wrapped.length * lh
  let y = (CARD_H - blockH) / 2 - 40
  ctx.fillStyle = c.accent
  roundRect(ctx, margin, y - 70, 120, 10, 5)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'top'
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 24
  for (const l of wrapped) {
    ctx.fillText(l, margin, y)
    y += lh
  }
  ctx.shadowBlur = 0

  // the song
  const by = CARD_H - 330
  const cover = 150
  if (art) {
    ctx.save()
    roundRect(ctx, margin, by, cover, cover, 30)
    ctx.clip()
    ctx.drawImage(art, margin, by, cover, cover)
    ctx.restore()
  }
  const tx = margin + (art ? cover + 34 : 0)
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 46px ${family}`
  ctx.fillText(ellipsize(ctx, c.title, CARD_W - margin - tx), tx, by + 22)
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = `500 38px ${family}`
  ctx.fillText(ellipsize(ctx, c.artist, CARD_W - margin - tx), tx, by + 88)

  // the mark
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font = `800 40px ${family}`
  ctx.fillText('Lyra', margin, CARD_H - 120)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = `500 30px ${family}`
  ctx.fillText(SITE, margin + 110, CARD_H - 115)
  return true
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
  return `${t}…`
}

export function cardDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png')
}

// ---------------------------------------------------------------------------------------------
// Doodle card: lyrics on a dark card, marked up by hand (underline, circle, strike-through with a
// scribbled replacement, a burst and a little face). The marks are chosen from the text itself, so
// the same lines always get the same doodles.

const HAND = `'Segoe Print', 'Bradley Hand', 'Chalkboard SE', 'Comic Sans MS', cursive`
const SCRIBBLES = ['never', 'always', 'still', 'maybe', 'yes', 'stay', 'soon', 'again']

function seeded(text: string): () => number {
  let a = 2166136261
  for (let i = 0; i < text.length; i++) a = Math.imul(a ^ text.charCodeAt(i), 16777619)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function stroke(ctx: CanvasRenderingContext2D, pts: Array<[number, number]>, color: string, w: number): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = w
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(pts[0]![0], pts[0]![1])
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i]![0] + pts[i + 1]![0]) / 2
    const my = (pts[i]![1] + pts[i + 1]![1]) / 2
    ctx.quadraticCurveTo(pts[i]![0], pts[i]![1], mx, my)
  }
  const last = pts[pts.length - 1]!
  ctx.lineTo(last[0], last[1])
  ctx.stroke()
  ctx.restore()
}

function wobbleLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, w: number, rnd: () => number): void {
  const n = 7
  const pts: Array<[number, number]> = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    pts.push([x1 + (x2 - x1) * t + (rnd() - 0.5) * 4, y1 + (y2 - y1) * t + (rnd() - 0.5) * 7])
  }
  stroke(ctx, pts, color, w)
}

function scribbleCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string, rnd: () => number): void {
  const pts: Array<[number, number]> = []
  const turns = 1.12
  const a0 = rnd() * Math.PI * 2
  for (let i = 0; i <= 28; i++) {
    const a = a0 + (i / 28) * Math.PI * 2 * turns
    const k = 1 + (rnd() - 0.5) * 0.06 + (i / 28) * 0.05
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k])
  }
  stroke(ctx, pts, color, 7)
}

function burst(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string, rnd: () => number): void {
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (1.15 + (i / 6) * 0.7)
    const r1 = 44 + rnd() * 8
    const r2 = r1 + 26 + rnd() * 18
    stroke(ctx, [[cx + Math.cos(a) * r1, cy - Math.sin(a) * r1], [cx + Math.cos(a) * r2, cy - Math.sin(a) * r2]], color, 6)
  }
}

function face(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, sad: boolean, rnd: () => number): void {
  scribbleCircle(ctx, cx, cy, r, r, color, rnd)
  ctx.fillStyle = color
  ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.2, 4.5, 0, 7); ctx.fill()
  ctx.beginPath(); ctx.arc(cx + r * 0.35, cy - r * 0.2, 4.5, 0, 7); ctx.fill()
  const my = cy + r * (sad ? 0.5 : 0.28)
  stroke(ctx, [[cx - r * 0.4, my], [cx, my + (sad ? -r * 0.3 : r * 0.3)], [cx + r * 0.4, my]], color, 5)
}

function drawDoodle(ctx: CanvasRenderingContext2D, c: CardInput, art: HTMLImageElement | null, family: string): boolean {
  const th = c.theme ?? DARK
  const rnd = seeded(c.lines.join('|'))
  const linesFont = th.font ?? family
  // backdrop: the vibe's ground, a breath of the song's colour in the corner
  ctx.fillStyle = th.bg
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  const glow = ctx.createRadialGradient(CARD_W * 0.8, CARD_H * 0.2, 0, CARD_W * 0.8, CARD_H * 0.2, 900)
  glow.addColorStop(0, c.accent)
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.globalAlpha = 0.22
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  ctx.globalAlpha = 1

  // the card
  const cx = 56, cy = 330, cw = CARD_W - 112, ch = 1230
  if (th.shadow) {
    ctx.fillStyle = th.shadow
    roundRect(ctx, cx + 22, cy + 22, cw, ch, th.radius)
    ctx.fill()
  }
  const grad = ctx.createLinearGradient(cx, cy, cx, cy + ch)
  grad.addColorStop(0, th.card[0])
  grad.addColorStop(1, th.card[1])
  ctx.fillStyle = grad
  roundRect(ctx, cx, cy, cw, ch, th.radius)
  ctx.fill()
  // paper: ruled lines, grid, dots or scan lines, clipped to the card
  if (th.pattern !== 'none') {
    ctx.save()
    roundRect(ctx, cx, cy, cw, ch, th.radius)
    ctx.clip()
    ctx.strokeStyle = th.patternColor
    ctx.fillStyle = th.patternColor
    ctx.lineWidth = 2
    const step = th.pattern === 'scan' ? 8 : th.pattern === 'lines' ? 74 : th.pattern === 'dots' ? 46 : 60
    if (th.pattern === 'dots') {
      for (let y = cy + 30; y < cy + ch; y += step) for (let x = cx + 30; x < cx + cw; x += step) { ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill() }
    } else {
      for (let y = cy + step; y < cy + ch; y += step) { ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx + cw, y); ctx.stroke() }
      if (th.pattern === 'grid') for (let x = cx + step; x < cx + cw; x += step) { ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x, cy + ch); ctx.stroke() }
    }
    ctx.restore()
  }
  ctx.strokeStyle = th.border
  ctx.lineWidth = th.borderW
  roundRect(ctx, cx, cy, cw, ch, th.radius)
  ctx.stroke()

  // header: cover + title
  const pad = 70
  const cover = 156
  const coverR = Math.min(30, th.radius)
  if (art) {
    ctx.save()
    roundRect(ctx, cx + pad, cy + pad, cover, cover, coverR)
    ctx.clip()
    ctx.drawImage(art, cx + pad, cy + pad, cover, cover)
    ctx.restore()
    if (th.borderW >= 5) {
      ctx.strokeStyle = th.border
      ctx.lineWidth = Math.min(8, th.borderW)
      roundRect(ctx, cx + pad, cy + pad, cover, cover, coverR)
      ctx.stroke()
    }
  }
  const hx = cx + pad + (art ? cover + 44 : 0)
  ctx.textBaseline = 'top'
  ctx.fillStyle = th.ink
  ctx.font = `700 ${Math.round(60 * Math.min(1, (th.fontScale ?? 1) > 1 ? 1 : (th.fontScale ?? 1) * 1.2))}px ${th.font ?? family}`
  ctx.fillText(ellipsize(ctx, c.title, cx + cw - pad - hx), hx, cy + pad + 18)
  ctx.fillStyle = th.ink2
  ctx.font = `500 46px ${family}`
  ctx.fillText(ellipsize(ctx, c.artist, cx + cw - pad - hx), hx, cy + pad + 96)

  // the lines
  const left = cx + pad
  const maxW = cw - pad * 2
  const scale = th.fontScale ?? 1
  let size = Math.round(118 * scale)
  const minSize = Math.round(56 * scale)
  let rows: string[] = []
  for (; size >= minSize; size -= 4) {
    ctx.font = `800 ${size}px ${linesFont}`
    rows = c.lines.flatMap((l) => wrap(ctx, l, maxW))
    if (rows.length * size * 1.42 <= 640) break
  }
  size = Math.max(size, minSize)
  const lh = size * 1.42
  const top = cy + 330
  ctx.fillStyle = th.ink
  ctx.font = `800 ${size}px ${linesFont}`
  const spots: Array<{ x: number; y: number; w: number; text: string; row: number }> = []
  rows.forEach((row, r) => {
    const parts = row.split(' ')
    let acc = ''
    for (const w of parts) {
      const x = left + ctx.measureText(acc ? acc + ' ' : '').width
      spots.push({ x, y: top + r * lh, w: ctx.measureText(w).width, text: w, row: r })
      acc = acc ? `${acc} ${w}` : w
    }
    ctx.fillText(row, left, top + r * lh)
  })

  // pick the words to mark
  const longs = spots.filter((p) => p.text.replace(/\W/g, '').length >= 4)
  const pool = longs.length >= 2 ? longs : spots
  const pick = (): (typeof spots)[number] => pool.splice(Math.floor(rnd() * pool.length), 1)[0]!
  const underlined = pick()
  const circled = pool.length ? pick() : undefined
  const shorts = spots.filter((p) => p !== underlined && p !== circled && p.text.replace(/\W/g, '').length <= 4)
  const struck = shorts.length ? shorts[Math.floor(rnd() * shorts.length)]! : undefined

  const [penUnder, penCircle, penStrike, penHand] = th.pen
  const base = size * 0.92
  wobbleLine(ctx, underlined.x, underlined.y + base + 12, underlined.x + underlined.w, underlined.y + base + 14, penUnder, 8, rnd)
  if (circled) scribbleCircle(ctx, circled.x + circled.w / 2, circled.y + size * 0.52, circled.w / 2 + 26, size * 0.62, penCircle, rnd)
  if (struck) {
    wobbleLine(ctx, struck.x - 6, struck.y + size * 0.34, struck.x + struck.w + 6, struck.y + size * 0.7, penStrike, 9, rnd)
    wobbleLine(ctx, struck.x - 6, struck.y + size * 0.7, struck.x + struck.w + 6, struck.y + size * 0.34, penStrike, 9, rnd)
    ctx.save()
    ctx.translate(struck.x + struck.w * 0.1, struck.y - size * 0.34)
    ctx.rotate(-0.1)
    ctx.fillStyle = penHand
    ctx.font = `600 ${Math.round(size * 0.62 * (scale < 1 ? 1.4 : 1))}px ${HAND}`
    ctx.fillText(SCRIBBLES[Math.floor(rnd() * SCRIBBLES.length)]!, 0, 0)
    ctx.restore()
  }
  const lastY = top + (rows.length - 1) * lh + size * 1.12
  burst(ctx, left + 90, lastY + 8, th.accentMarks, rnd)
  face(ctx, cx + cw - pad - 90, lastY + 40, 46, th.accentMarks, rnd() > 0.35, rnd)

  // the mark
  const my = cy + ch - pad - 74
  ctx.fillStyle = th.markBg
  ctx.beginPath(); ctx.arc(left + 37, my + 37, 37, 0, 7); ctx.fill()
  ctx.fillStyle = th.markInk
  ctx.font = `800 44px ${family}`
  ctx.textBaseline = 'middle'
  ctx.fillText('L', left + 26, my + 40)
  ctx.fillStyle = th.ink
  ctx.font = `800 58px ${family}`
  ctx.fillText('Lyra', left + 90, my + 40)
  ctx.textBaseline = 'top'
  // the site line sits on the ground, below the card: pick whichever of white / black reads on the ground colour
  ctx.fillStyle = luminance(th.bg) > 0.5 ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.55)'
  ctx.font = `500 30px ${family}`
  ctx.fillText(SITE, CARD_W / 2 - ctx.measureText(SITE).width / 2, cy + ch + 70)
  return true
}

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return 0
  const n = parseInt(m[1]!, 16)
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
}
