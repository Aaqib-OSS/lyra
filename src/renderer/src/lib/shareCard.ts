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
  const rnd = seeded(c.lines.join('|'))
  // backdrop: near black, a breath of the song's colour at the corners
  ctx.fillStyle = '#050505'
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
  const grad = ctx.createLinearGradient(cx, cy, cx, cy + ch)
  grad.addColorStop(0, '#2c2928')
  grad.addColorStop(1, '#1f1d1c')
  ctx.fillStyle = grad
  roundRect(ctx, cx, cy, cw, ch, 72)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 2
  ctx.stroke()

  // header: cover + title
  const pad = 70
  const cover = 156
  if (art) {
    ctx.save()
    roundRect(ctx, cx + pad, cy + pad, cover, cover, 30)
    ctx.clip()
    ctx.drawImage(art, cx + pad, cy + pad, cover, cover)
    ctx.restore()
  }
  const hx = cx + pad + (art ? cover + 44 : 0)
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#fff'
  ctx.font = `700 60px ${family}`
  ctx.fillText(ellipsize(ctx, c.title, cx + cw - pad - hx), hx, cy + pad + 18)
  ctx.fillStyle = 'rgba(255,255,255,0.78)'
  ctx.font = `500 46px ${family}`
  ctx.fillText(ellipsize(ctx, c.artist, cx + cw - pad - hx), hx, cy + pad + 96)

  // the lines
  const left = cx + pad
  const maxW = cw - pad * 2
  let size = 118
  let rows: string[] = []
  for (; size >= 56; size -= 4) {
    ctx.font = `800 ${size}px ${family}`
    rows = c.lines.flatMap((l) => wrap(ctx, l, maxW))
    if (rows.length * size * 1.42 <= 640) break
  }
  const lh = size * 1.42
  const top = cy + 330
  ctx.fillStyle = '#fff'
  ctx.font = `800 ${size}px ${family}`
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

  const base = size * 0.92
  wobbleLine(ctx, underlined.x, underlined.y + base + 12, underlined.x + underlined.w, underlined.y + base + 14, '#ee6a62', 8, rnd)
  if (circled) scribbleCircle(ctx, circled.x + circled.w / 2, circled.y + size * 0.52, circled.w / 2 + 26, size * 0.62, '#d86bd0', rnd)
  if (struck) {
    wobbleLine(ctx, struck.x - 6, struck.y + size * 0.34, struck.x + struck.w + 6, struck.y + size * 0.7, '#e34a45', 9, rnd)
    wobbleLine(ctx, struck.x - 6, struck.y + size * 0.7, struck.x + struck.w + 6, struck.y + size * 0.34, '#e34a45', 9, rnd)
    ctx.save()
    ctx.translate(struck.x + struck.w * 0.1, struck.y - size * 0.34)
    ctx.rotate(-0.1)
    ctx.fillStyle = '#e9a6e4'
    ctx.font = `600 ${Math.round(size * 0.62)}px ${HAND}`
    ctx.fillText(SCRIBBLES[Math.floor(rnd() * SCRIBBLES.length)]!, 0, 0)
    ctx.restore()
  }
  const lastY = top + (rows.length - 1) * lh + size * 1.12
  burst(ctx, left + 90, lastY + 8, 'rgba(190,225,235,0.75)', rnd)
  face(ctx, cx + cw - pad - 90, lastY + 40, 46, 'rgba(120,200,200,0.85)', rnd() > 0.35, rnd)

  // the mark
  const my = cy + ch - pad - 74
  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.arc(left + 37, my + 37, 37, 0, 7); ctx.fill()
  ctx.fillStyle = '#111'
  ctx.font = `800 44px ${family}`
  ctx.textBaseline = 'middle'
  ctx.fillText('L', left + 26, my + 40)
  ctx.fillStyle = '#fff'
  ctx.font = `800 58px ${family}`
  ctx.fillText('Lyra', left + 90, my + 40)
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = `500 30px ${family}`
  ctx.fillText(SITE, CARD_W / 2 - ctx.measureText(SITE).width / 2, cy + ch + 70)
  return true
}
