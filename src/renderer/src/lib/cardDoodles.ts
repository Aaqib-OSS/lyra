/**
 * Doodle kits for the share card: every vibe draws its own little drawings around the lyric (stars for Dream, a sun for Sunset,
 * pixel hearts for Arcade, a speech burst for Comic ...). A kit is a pool of drawings plus the way the pen underlines. The song's
 * lyric seeds the random generator, so the same song always gets the same doodles and different songs get different ones.
 * Everything is drawn with canvas paths and squares: no images, no fonts besides the system hand.
 */
type Rnd = () => number
type Pt = [number, number]

export interface Kit {
  /** how the underline under a word is drawn */
  under: 'wobble' | 'wave' | 'double' | 'dash' | 'pixel' | 'straight'
  /** drawings to pick from (3 are placed per card) */
  pool: string[]
  /** neon tube: the pen glows */
  glow?: boolean
  /** hard square ink for pixel looks */
  pixel?: boolean
}

export const KITS: Record<string, Kit> = {
  marker: { under: 'wobble', pool: ['burst', 'face', 'heart', 'star', 'spiral', 'note'] },
  neon: { under: 'straight', glow: true, pool: ['bolt', 'star', 'heart', 'wave', 'sparkle', 'note'] },
  chrome: { under: 'straight', pool: ['sparkle', 'swoosh', 'star', 'sparkle', 'orbit'] },
  dream: { under: 'wave', pool: ['moon', 'sparkle', 'cloud', 'star', 'heart', 'sparkle'] },
  term: { under: 'pixel', pool: ['cursor', 'bracket', 'zigzag', 'bolt', 'prompt'], pixel: true },
  sticker: { under: 'double', pool: ['pow', 'star', 'heart', 'face', 'bolt', 'flower'] },
  chat: { under: 'wobble', pool: ['bubble', 'heart', 'dots', 'face', 'sparkle'] },
  paper: { under: 'wobble', pool: ['flower', 'arrow', 'star', 'heart', 'spiral', 'cloud', 'note'] },
  pixel: { under: 'pixel', pool: ['pxheart', 'pxstar', 'invader', 'pxheart', 'coin'], pixel: true },
  cine: { under: 'double', pool: ['crop', 'clapper', 'star', 'frame', 'sparkle'] },
  sun: { under: 'wave', pool: ['sun', 'wave', 'bird', 'star', 'heart', 'palm'] },
  sport: { under: 'straight', pool: ['ball', 'star', 'confetti', 'bolt', 'arrow'] },
  tape: { under: 'dash', pool: ['reel', 'note', 'wave', 'star', 'heart'] },
  comic: { under: 'double', pool: ['pow', 'bubble', 'bolt', 'star', 'dotsgrid'] },
  spray: { under: 'dash', pool: ['arrow', 'drips', 'star', 'crown', 'bolt', 'dotsgrid'] },
  grid: { under: 'straight', pool: ['bracket', 'crop', 'star', 'zigzag', 'orbit', 'bolt'] },
  soft: { under: 'wave', pool: ['heart', 'sparkle', 'moon', 'cloud', 'note', 'star'] },
  route: { under: 'dash', pool: ['arrow', 'pin', 'wave', 'star', 'orbit'] },
  wall: { under: 'double', pool: ['pow', 'star', 'crown', 'drips', 'zigzag'] },
  flap: { under: 'pixel', pool: ['bracket', 'arrow', 'zigzag', 'pxstar', 'coin'], pixel: true }
}

function path(ctx: CanvasRenderingContext2D, pts: Pt[], color: string, w: number, close = false): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = w
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(pts[0]![0], pts[0]![1])
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1])
  if (close) ctx.closePath()
  ctx.stroke()
  ctx.restore()
}

function curve(ctx: CanvasRenderingContext2D, pts: Pt[], color: string, w: number): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = w
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(pts[0]![0], pts[0]![1])
  for (let i = 1; i < pts.length - 1; i++) ctx.quadraticCurveTo(pts[i]![0], pts[i]![1], (pts[i]![0] + pts[i + 1]![0]) / 2, (pts[i]![1] + pts[i + 1]![1]) / 2)
  const l = pts[pts.length - 1]!
  ctx.lineTo(l[0], l[1])
  ctx.stroke()
  ctx.restore()
}

function jit(rnd: Rnd, a: number): number {
  return (rnd() - 0.5) * a
}

/** a square pixel sprite: rows of '#' on a grid */
function sprite(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, px: number, color: string): void {
  ctx.fillStyle = color
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] === '#') ctx.fillRect(x + c * px, y + r * px, px, px)
  })
}

type Drawer = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number, c: string, c2: string, rnd: Rnd) => void

const star5 = (cx: number, cy: number, r: number, rot: number): Pt[] => {
  const pts: Pt[] = []
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5
    const rr = i % 2 ? r * 0.42 : r
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr])
  }
  return pts
}

const DRAW: Record<string, Drawer> = {
  burst(ctx, x, y, s, c, _c2, rnd) {
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (1.15 + (i / 6) * 0.7)
      const r1 = s * 0.7 + rnd() * 8
      const r2 = r1 + s * 0.45 + rnd() * 18
      path(ctx, [[x + Math.cos(a) * r1, y - Math.sin(a) * r1], [x + Math.cos(a) * r2, y - Math.sin(a) * r2]], c, 6)
    }
  },
  face(ctx, x, y, s, c, _c2, rnd) {
    const r = s * 0.5
    curve(ctx, Array.from({ length: 22 }, (_, i): Pt => [x + Math.cos(i * 0.31) * r * (1 + jit(rnd, 0.06)), y + Math.sin(i * 0.31) * r * (1 + jit(rnd, 0.06))]), c, 6)
    ctx.fillStyle = c
    ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.2, 5, 0, 7); ctx.fill()
    ctx.beginPath(); ctx.arc(x + r * 0.35, y - r * 0.2, 5, 0, 7); ctx.fill()
    const sad = rnd() > 0.5
    const my = y + r * (sad ? 0.5 : 0.28)
    curve(ctx, [[x - r * 0.4, my], [x, my + (sad ? -r * 0.3 : r * 0.3)], [x + r * 0.4, my]], c, 5)
  },
  heart(ctx, x, y, s, c) {
    const r = s * 0.28
    ctx.save()
    ctx.strokeStyle = c
    ctx.lineWidth = 7
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(x, y + r * 1.9)
    ctx.bezierCurveTo(x - r * 3, y + r * 0.2, x - r * 1.4, y - r * 1.6, x, y - r * 0.3)
    ctx.bezierCurveTo(x + r * 1.4, y - r * 1.6, x + r * 3, y + r * 0.2, x, y + r * 1.9)
    ctx.stroke()
    ctx.restore()
  },
  star(ctx, x, y, s, c, _c2, rnd) {
    path(ctx, star5(x, y, s * 0.5, -Math.PI / 2 + jit(rnd, 0.5)), c, 6, true)
  },
  sparkle(ctx, x, y, s, c) {
    const r = s * 0.5
    ctx.save()
    ctx.fillStyle = c
    ctx.beginPath()
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 - Math.PI / 2
      const rr = i % 2 ? r * 0.18 : r
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
    }
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = c
    ctx.beginPath(); ctx.arc(x + r * 1.1, y - r * 0.9, r * 0.14, 0, 7); ctx.fill()
  },
  note(ctx, x, y, s, c) {
    const r = s * 0.16
    ctx.fillStyle = c
    ctx.beginPath(); ctx.ellipse(x - r, y + s * 0.3, r * 1.3, r, -0.4, 0, 7); ctx.fill()
    ctx.beginPath(); ctx.ellipse(x + s * 0.34, y + s * 0.22, r * 1.3, r, -0.4, 0, 7); ctx.fill()
    path(ctx, [[x - r * 0.1, y + s * 0.26], [x - r * 0.1, y - s * 0.3], [x + s * 0.46, y - s * 0.42], [x + s * 0.46, y + s * 0.2]], c, 6)
  },
  bolt(ctx, x, y, s, c) {
    ctx.fillStyle = c
    ctx.beginPath()
    ;[[0.1, -0.5], [-0.3, 0.08], [-0.02, 0.08], [-0.12, 0.5], [0.32, -0.12], [0.04, -0.12], [0.2, -0.5]].forEach(([a, b], i) => (i ? ctx.lineTo(x + a! * s, y + b! * s) : ctx.moveTo(x + a! * s, y + b! * s)))
    ctx.closePath()
    ctx.fill()
  },
  arrow(ctx, x, y, s, c, _c2, rnd) {
    const bend = jit(rnd, s * 0.5)
    curve(ctx, [[x - s * 0.6, y + s * 0.2], [x, y - s * 0.3 + bend], [x + s * 0.6, y]], c, 6)
    path(ctx, [[x + s * 0.34, y - s * 0.22], [x + s * 0.62, y], [x + s * 0.3, y + s * 0.2]], c, 6)
  },
  flower(ctx, x, y, s, c, c2) {
    const r = s * 0.2
    ctx.strokeStyle = c
    ctx.lineWidth = 5
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3
      ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3, r, r * 0.75, a, 0, 7); ctx.stroke()
    }
    ctx.fillStyle = c2
    ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, 7); ctx.fill()
  },
  cloud(ctx, x, y, s, c) {
    const r = s * 0.2
    ctx.save()
    ctx.strokeStyle = c
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x - r * 2, y + r * 0.8)
    ctx.arc(x - r * 1.4, y, r * 0.85, Math.PI * 0.75, Math.PI * 1.55)
    ctx.arc(x - r * 0.2, y - r * 0.6, r * 1.1, Math.PI * 1.1, Math.PI * 1.9)
    ctx.arc(x + r * 1.3, y, r * 0.9, Math.PI * 1.35, Math.PI * 0.45)
    ctx.lineTo(x - r * 2, y + r * 0.8)
    ctx.stroke()
    ctx.restore()
  },
  sun(ctx, x, y, s, c, c2) {
    const r = s * 0.24
    ctx.fillStyle = c2
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill()
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      path(ctx, [[x + Math.cos(a) * r * 1.5, y + Math.sin(a) * r * 1.5], [x + Math.cos(a) * r * (i % 2 ? 2 : 2.4), y + Math.sin(a) * r * (i % 2 ? 2 : 2.4)]], c, 6)
    }
  },
  moon(ctx, x, y, s, c) {
    const r = s * 0.36
    ctx.save()
    ctx.strokeStyle = c
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(x, y, r, Math.PI * 0.55, Math.PI * 1.65)
    ctx.arc(x + r * 0.45, y - r * 0.15, r * 0.82, Math.PI * 1.55, Math.PI * 0.62, true)
    ctx.stroke()
    ctx.restore()
  },
  wave(ctx, x, y, s, c) {
    const pts: Pt[] = []
    for (let i = 0; i <= 12; i++) pts.push([x - s * 0.7 + (i / 12) * s * 1.4, y + Math.sin(i * 1.1) * s * 0.12])
    curve(ctx, pts, c, 6)
    curve(ctx, pts.map(([a, b]): Pt => [a, b + s * 0.2]), c, 6)
  },
  spiral(ctx, x, y, s, c) {
    const pts: Pt[] = []
    for (let i = 0; i < 40; i++) pts.push([x + Math.cos(i * 0.5) * (i * s * 0.012), y + Math.sin(i * 0.5) * (i * s * 0.012)])
    curve(ctx, pts, c, 5)
  },
  zigzag(ctx, x, y, s, c) {
    path(ctx, Array.from({ length: 8 }, (_, i): Pt => [x - s * 0.6 + i * s * 0.17, y + (i % 2 ? s * 0.14 : -s * 0.14)]), c, 7)
  },
  swoosh(ctx, x, y, s, c) {
    curve(ctx, [[x - s * 0.7, y + s * 0.2], [x - s * 0.1, y - s * 0.3], [x + s * 0.7, y - s * 0.15]], c, 9)
    curve(ctx, [[x - s * 0.5, y + s * 0.34], [x + s * 0.1, y - s * 0.05], [x + s * 0.7, y + s * 0.02]], c, 4)
  },
  orbit(ctx, x, y, s, c) {
    ctx.save()
    ctx.strokeStyle = c
    ctx.lineWidth = 5
    ctx.beginPath(); ctx.ellipse(x, y, s * 0.55, s * 0.2, -0.45, 0, 7); ctx.stroke()
    ctx.beginPath(); ctx.ellipse(x, y, s * 0.2, s * 0.55, -0.45, 0, 7); ctx.stroke()
    ctx.fillStyle = c
    ctx.beginPath(); ctx.arc(x, y, s * 0.07, 0, 7); ctx.fill()
    ctx.restore()
  },
  cursor(ctx, x, y, s, c) {
    ctx.fillStyle = c
    ctx.fillRect(x - s * 0.15, y - s * 0.3, s * 0.3, s * 0.6)
    ctx.fillRect(x - s * 0.7, y - s * 0.05, s * 0.4, s * 0.1)
  },
  prompt(ctx, x, y, s, c) {
    path(ctx, [[x - s * 0.5, y - s * 0.3], [x - s * 0.1, y], [x - s * 0.5, y + s * 0.3]], c, 8)
    ctx.fillStyle = c
    ctx.fillRect(x + s * 0.05, y + s * 0.22, s * 0.5, 8)
  },
  bracket(ctx, x, y, s, c) {
    path(ctx, [[x - s * 0.25, y - s * 0.5], [x - s * 0.5, y - s * 0.5], [x - s * 0.5, y + s * 0.5], [x - s * 0.25, y + s * 0.5]], c, 7)
    path(ctx, [[x + s * 0.25, y - s * 0.5], [x + s * 0.5, y - s * 0.5], [x + s * 0.5, y + s * 0.5], [x + s * 0.25, y + s * 0.5]], c, 7)
  },
  pxheart(ctx, x, y, s, c) {
    const px = s / 9
    sprite(ctx, ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'], x - px * 3.5, y - px * 3, px, c)
  },
  pxstar(ctx, x, y, s, c) {
    const px = s / 9
    sprite(ctx, ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'], x - px * 3.5, y - px * 3.5, px, c)
  },
  invader(ctx, x, y, s, c) {
    const px = s / 11
    sprite(ctx, ['..#.....#..', '...#...#...', '..#######..', '.##.###.##.', '###########', '#.#######.#', '#.#.....#.#', '...##.##...'], x - px * 5.5, y - px * 4, px, c)
  },
  coin(ctx, x, y, s, c, c2) {
    const px = s / 10
    sprite(ctx, ['..####..', '.######.', '########', '###..###', '###..###', '########', '.######.', '..####..'], x - px * 4, y - px * 4, px, c)
    sprite(ctx, ['...##...', '...##...'], x - px * 4 + px * 3, y - px * 4 + px * 2, px, c2)
  },
  crop(ctx, x, y, s, c) {
    const a = s * 0.5
    ;[[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => path(ctx, [[x + sx! * a, y + sy! * (a - s * 0.3)], [x + sx! * a, y + sy! * a], [x + sx! * (a - s * 0.3), y + sy! * a]], c, 6))
    ctx.fillStyle = c
    ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill()
  },
  frame(ctx, x, y, s, c) {
    ctx.strokeStyle = c
    ctx.lineWidth = 6
    ctx.strokeRect(x - s * 0.5, y - s * 0.34, s, s * 0.68)
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = c
      ctx.fillRect(x - s * 0.5 + i * (s / 5) + s * 0.04, y - s * 0.34 - 18, s * 0.1, 10)
      ctx.fillRect(x - s * 0.5 + i * (s / 5) + s * 0.04, y + s * 0.34 + 8, s * 0.1, 10)
    }
  },
  clapper(ctx, x, y, s, c) {
    ctx.strokeStyle = c
    ctx.lineWidth = 6
    ctx.strokeRect(x - s * 0.5, y - s * 0.12, s, s * 0.52)
    path(ctx, [[x - s * 0.5, y - s * 0.12], [x - s * 0.44, y - s * 0.4], [x + s * 0.5, y - s * 0.3], [x + s * 0.5, y - s * 0.12]], c, 6, true)
    for (let i = 0; i < 3; i++) path(ctx, [[x - s * 0.3 + i * s * 0.3, y - s * 0.38], [x - s * 0.18 + i * s * 0.3, y - s * 0.12]], c, 6)
  },
  bird(ctx, x, y, s, c) {
    curve(ctx, [[x - s * 0.45, y], [x - s * 0.2, y - s * 0.3], [x, y]], c, 6)
    curve(ctx, [[x, y], [x + s * 0.2, y - s * 0.3], [x + s * 0.45, y]], c, 6)
  },
  palm(ctx, x, y, s, c) {
    curve(ctx, [[x, y + s * 0.5], [x + s * 0.06, y], [x - s * 0.04, y - s * 0.4]], c, 7)
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (1.05 + i * 0.22)
      curve(ctx, [[x - s * 0.04, y - s * 0.4], [x - s * 0.04 + Math.cos(a) * s * 0.3, y - s * 0.4 + Math.sin(a) * s * 0.3 - 8], [x - s * 0.04 + Math.cos(a) * s * 0.55, y - s * 0.4 + Math.sin(a) * s * 0.4 + 24]], c, 6)
    }
  },
  ball(ctx, x, y, s, c) {
    const r = s * 0.4
    ctx.save()
    ctx.strokeStyle = c
    ctx.lineWidth = 6
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke()
    path(ctx, star5(x, y, r * 0.42, -Math.PI / 2).filter((_, i) => i % 2 === 0), c, 6, true)
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5
      path(ctx, [[x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42], [x + Math.cos(a) * r, y + Math.sin(a) * r]], c, 5)
    }
    ctx.restore()
  },
  confetti(ctx, x, y, s, c, c2, rnd) {
    for (let i = 0; i < 14; i++) {
      ctx.save()
      ctx.translate(x + jit(rnd, s * 1.3), y + jit(rnd, s * 0.9))
      ctx.rotate(rnd() * 3)
      ctx.fillStyle = i % 2 ? c : c2
      ctx.fillRect(-7, -3, 14, 6)
      ctx.restore()
    }
  },
  reel(ctx, x, y, s, c) {
    const r = s * 0.4
    ctx.strokeStyle = c
    ctx.lineWidth = 6
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke()
    ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, 7); ctx.stroke()
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3
      path(ctx, [[x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3], [x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62]], c, 5)
    }
  },
  pow(ctx, x, y, s, c, c2, rnd) {
    const pts: Pt[] = []
    const n = 16
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2
      const r = (i % 2 ? s * 0.28 : s * 0.55) * (1 + jit(rnd, 0.12))
      pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r * 0.82])
    }
    ctx.save()
    ctx.fillStyle = c2
    ctx.beginPath()
    pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)))
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = c
    ctx.lineWidth = 7
    ctx.lineJoin = 'round'
    ctx.stroke()
    ctx.restore()
  },
  bubble(ctx, x, y, s, c) {
    ctx.save()
    ctx.strokeStyle = c
    ctx.lineWidth = 6
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.roundRect(x - s * 0.55, y - s * 0.34, s * 1.1, s * 0.6, s * 0.2)
    ctx.moveTo(x - s * 0.25, y + s * 0.26)
    ctx.lineTo(x - s * 0.4, y + s * 0.5)
    ctx.lineTo(x - s * 0.05, y + s * 0.26)
    ctx.stroke()
    ctx.fillStyle = c
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(x + i * s * 0.22, y - s * 0.04, 6, 0, 7); ctx.fill() }
    ctx.restore()
  },
  dots(ctx, x, y, s, c) {
    ctx.fillStyle = c
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x - s * 0.3 + i * s * 0.3, y, 9 + i * 2, 0, 7); ctx.fill() }
  },
  dotsgrid(ctx, x, y, s, c) {
    ctx.fillStyle = c
    for (let r = 0; r < 4; r++) for (let q = 0; q < 6; q++) { ctx.beginPath(); ctx.arc(x - s * 0.5 + q * (s / 5), y - s * 0.3 + r * (s / 5), 4 + (r + q) % 3, 0, 7); ctx.fill() }
  },
  drips(ctx, x, y, s, c, _c2, rnd) {
    for (let i = 0; i < 5; i++) {
      const dx = x - s * 0.5 + i * (s / 4)
      const l = s * (0.2 + rnd() * 0.45)
      path(ctx, [[dx, y - s * 0.3], [dx, y - s * 0.3 + l]], c, 8)
      ctx.fillStyle = c
      ctx.beginPath(); ctx.arc(dx, y - s * 0.3 + l + 4, 8, 0, 7); ctx.fill()
    }
  },
  crown(ctx, x, y, s, c) {
    path(ctx, [[x - s * 0.45, y + s * 0.3], [x - s * 0.5, y - s * 0.25], [x - s * 0.2, y], [x, y - s * 0.38], [x + s * 0.2, y], [x + s * 0.5, y - s * 0.25], [x + s * 0.45, y + s * 0.3]], c, 7, true)
  },
  pin(ctx, x, y, s, c) {
    ctx.save()
    ctx.strokeStyle = c
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.arc(x, y - s * 0.12, s * 0.28, Math.PI * 0.85, Math.PI * 0.15)
    ctx.lineTo(x, y + s * 0.5)
    ctx.closePath()
    ctx.stroke()
    ctx.beginPath(); ctx.arc(x, y - s * 0.12, s * 0.1, 0, 7); ctx.stroke()
    ctx.restore()
  }
}

/** The underline under the picked word, in the kit's pen. */
export function underline(ctx: CanvasRenderingContext2D, kit: Kit, x1: number, x2: number, y: number, color: string, rnd: Rnd): void {
  const w = 8
  ctx.save()
  if (kit.glow) { ctx.shadowColor = color; ctx.shadowBlur = 26 }
  switch (kit.under) {
    case 'wave': {
      const pts: Pt[] = []
      const n = Math.max(4, Math.round((x2 - x1) / 26))
      for (let i = 0; i <= n; i++) pts.push([x1 + ((x2 - x1) * i) / n, y + (i % 2 ? 9 : -9)])
      curve(ctx, pts, color, w - 1)
      break
    }
    case 'double':
      path(ctx, [[x1, y - 6], [x2, y - 8 + jit(rnd, 6)]], color, w - 2)
      path(ctx, [[x1 + 14, y + 12], [x2 - 10, y + 10 + jit(rnd, 6)]], color, w - 3)
      break
    case 'dash': {
      for (let x = x1; x < x2 - 10; x += 38) path(ctx, [[x, y], [Math.min(x + 24, x2), y + jit(rnd, 3)]], color, w)
      break
    }
    case 'pixel': {
      ctx.fillStyle = color
      for (let x = x1; x < x2; x += 14) ctx.fillRect(x, y - 6 + (Math.floor((x - x1) / 14) % 2) * 0, 12, 10)
      break
    }
    case 'straight':
      path(ctx, [[x1, y], [x2, y]], color, w)
      break
    default: {
      const pts: Pt[] = []
      for (let i = 0; i <= 7; i++) pts.push([x1 + ((x2 - x1) * i) / 7 + jit(rnd, 4), y + jit(rnd, 7)])
      curve(ctx, pts, color, w)
    }
  }
  ctx.restore()
}

export interface DecorArea {
  /** the free spots, in canvas pixels */
  below: { y: number; left: number; right: number }
  top: { x: number; y: number }
  bottom: { x: number; y: number }
}

/** Place three drawings from the kit's pool: one under the lyric on the left, one on the right, one in a corner. */
export function drawDecor(ctx: CanvasRenderingContext2D, kit: Kit, area: DecorArea, c1: string, c2: string, rnd: Rnd): void {
  const pool = [...kit.pool]
  const take = (): string => pool.splice(Math.floor(rnd() * pool.length), 1)[0] ?? 'star'
  const spots: Array<[number, number, number]> = [
    [area.below.left + 90, area.below.y, 170],
    [area.below.right - 90, area.below.y + 36, 150],
    [area.bottom.x, area.bottom.y, 120]
  ]
  if (rnd() > 0.35) spots.push([area.top.x, area.top.y, 96])
  ctx.save()
  if (kit.glow) { ctx.shadowColor = c1; ctx.shadowBlur = 22 }
  for (const [x, y, s] of spots) {
    ctx.save()
    ctx.translate(x, y)
    if (!kit.pixel) ctx.rotate(jit(rnd, 0.5))
    ctx.translate(-x, -y)
    DRAW[take()]!(ctx, x, y, s, c1, c2, rnd)
    ctx.restore()
  }
  ctx.restore()
}
