/* Lyra website: hero, looks showcase, state story, rails, release links. Uses REPO and reduce from demo.js. */
const VIBES = window.LYRA_VIBES || []
const shot = (name) => `assets/shots/${name}.jpg`
const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const rootStyle = document.documentElement.style
const setAccent = (v) => rootStyle.setProperty('--acc', v.acc)
const vibeById = (id) => VIBES.find((v) => v.id === id) || VIBES[0]
// when a screenshot is missing the layout must not collapse
document.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.style.visibility = 'hidden' }, true)

/* ---------- reveal ---------- */
{
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } }), { threshold: 0.1 })
  $$('.reveal').forEach((el, i) => { el.style.transitionDelay = `${(i % 4) * 70}ms`; io.observe(el) })
}

/* ---------- cursor spotlight ---------- */
if (!reduce && matchMedia('(pointer: fine)').matches) {
  const spot = $('#spot')
  let raf = 0, x = 0, y = 0
  addEventListener('pointermove', (e) => {
    x = e.clientX; y = e.clientY
    spot.classList.add('on')
    if (!raf) raf = requestAnimationFrame(() => { spot.style.transform = `translate(${x}px, ${y}px)`; raf = 0 })
  }, { passive: true })
}

/* ---------- hero: words light up one by one, then the looks rotate ---------- */
{
  const words = $$('#hero-h1 .w')
  let i = 0
  const lightUp = () => {
    words.forEach((w, k) => w.classList.toggle('on', k <= i))
    i = (i + 1) % (words.length + 3)
    if (i === 0) words.forEach((w) => w.classList.remove('on'))
  }
  lightUp()
  setInterval(lightUp, reduce ? 99999 : 520)
  if (reduce) words.forEach((w) => w.classList.add('on'))

  let hi = Math.max(0, VIBES.findIndex((v) => v.id === 'neon'))
  const order = VIBES.filter((v) => v.id !== 'none')
  let cur = order.findIndex((v) => v.id === 'neon')
  const apply = (v) => {
    setAccent(v)
    const swap = (id, src) => { const el = $(id); if (el) el.src = src }
    swap('#hx-full', shot(`${v.id}-full`)); swap('#hx-phone', shot(`${v.id}-phone`)); swap('#hx-mini', shot(`${v.id}-mini`))
    const a = order[(cur + 5) % order.length], b = order[(cur + 11) % order.length]
    swap('#hx-card-a', shot(`card-${a.id}`)); swap('#hx-card-b', shot(`card-${b.id}`))
    $('#hx-name').textContent = v.name
  }
  const next = () => { cur = (cur + 1) % order.length; apply(order[cur]) }
  $('#hx-next').addEventListener('click', () => { next(); clearInterval(timer); timer = setInterval(next, 4200) })
  let timer = reduce ? 0 : setInterval(next, 4200)
  // hero devices follow the pointer
  if (!reduce && matchMedia('(pointer: fine)').matches) {
    const stage = $('#hx-stage')
    stage.addEventListener('pointermove', (e) => {
      const r = stage.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5
      const t = $('.tilt', stage)
      t.style.transform = `rotateY(${px * 8}deg) rotateX(${-py * 6}deg)`
      $('.dev--phone', stage).style.transform = `translate(${px * -26}px, ${py * -14}px)`
      $('.dev--mini', stage).style.transform = `translate(${px * 30}px, ${py * -18}px)`
    })
    stage.addEventListener('pointerleave', () => $$('.dev', stage).forEach((d) => (d.style.transform = '')))
    void hi
  }
}

/* ---------- ticker of look names ---------- */
{
  const t = $('#tick')
  const html = VIBES.map((v) => `<span>${v.name}</span>`).join('')
  t.innerHTML = html + html
}

/* ---------- count-up ---------- */
{
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return
    io.unobserve(e.target)
    const to = Number(e.target.dataset.count)
    if (reduce) return
    const t0 = performance.now()
    const f = (t) => { const k = Math.min(1, (t - t0) / 1200); e.target.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(f) }
    requestAnimationFrame(f)
  }), { threshold: 0.6 })
  $$('[data-count]').forEach((n) => io.observe(n))
}

/* ---------- the looks showcase ---------- */
{
  const list = $('#show-list'), canvas = $('#show-canvas'), img = $('#show-img')
  const S = { id: 'neon', dev: 'full', vid: 1 }
  list.innerHTML = VIBES.map((v) => `<button class="vbtn" role="tab" data-id="${v.id}"><i style="--sw:${v.acc};background-image:url(${shot(`${v.id}-phone`)})"></i><span><b>${v.name}</b><small>${v.tag}</small></span></button>`).join('')
  const render = () => {
    const v = vibeById(S.id)
    setAccent(v)
    const name = S.dev === 'full' ? `${v.id}-full${S.vid ? '' : '-novideo'}` : `${v.id}-${S.dev}`
    canvas.dataset.dev = S.dev
    img.alt = `${v.name} look, ${S.dev}`
    img.style.visibility = ''
    img.src = shot(name)
    img.style.animation = 'none'; void img.offsetWidth; img.style.animation = ''
    $('#show-name').textContent = v.name
    $('#show-tag').textContent = v.tag
    $('#show-tags').innerHTML = [`Layout: ${v.layout}`, `Lyric style: ${v.stage}`, v.light ? 'Light, inked' : 'Dark'].map((t) => `<span>${t}</span>`).join('')
    $$('.vbtn', list).forEach((b) => b.classList.toggle('is-on', b.dataset.id === S.id))
    $('#seg-vid').style.display = S.dev === 'full' ? '' : 'none'
  }
  list.addEventListener('click', (e) => { const b = e.target.closest('.vbtn'); if (b) { S.id = b.dataset.id; render() } })
  $('#seg-dev').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; S.dev = b.dataset.dev; $$('#seg-dev button').forEach((x) => x.classList.toggle('is-on', x === b)); render() })
  $('#seg-vid').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; S.vid = Number(b.dataset.vid); $$('#seg-vid button').forEach((x) => x.classList.toggle('is-on', x === b)); render() })
  addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key) || e.target.closest('input, textarea, video')) return
    const r = canvas.getBoundingClientRect()
    if (r.bottom < 0 || r.top > innerHeight) return
    const i = VIBES.findIndex((v) => v.id === S.id)
    S.id = VIBES[(i + (e.key === 'ArrowDown' ? 1 : -1) + VIBES.length) % VIBES.length].id
    e.preventDefault(); render()
  })
  render()
}

/* ---------- the four states (sticky story) ---------- */
{
  const steps = $$('.story__step'), art = $('#story-img')
  const vibe = 'sketch'
  const pick = (s) => shot(s === 'full' || s === 'full-novideo' ? `${vibe}-${s}` : `${vibe}-${s}`)
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return
    steps.forEach((x) => x.classList.toggle('is-on', x === e.target))
    art.style.opacity = 0
    setTimeout(() => { art.src = pick(e.target.dataset.s); art.style.visibility = ''; art.style.opacity = 1 }, 160)
    setAccent(vibeById(vibe))
  }), { rootMargin: '-45% 0px -45% 0px' })
  steps.forEach((s) => io.observe(s))
}

/* ---------- rails ---------- */
{
  $('#rail-cards').innerHTML = VIBES.map((v) => `<figure class="rail__item" style="--glow:${v.acc}"><img loading="lazy" src="${shot(`card-${v.id}`)}" alt="Share card, ${v.name} look" /><figcaption>${v.name}</figcaption></figure>`).join('')
  $('#rail-settings').innerHTML = VIBES.map((v) => `<figure class="rail__item" style="--glow:${v.acc}"><img loading="lazy" src="${shot(`settings-${v.id}`)}" alt="Settings panel, ${v.name} look" /><figcaption>${v.name}</figcaption></figure>`).join('')
  // drag to scroll with the mouse
  $$('.rail').forEach((r) => {
    let down = false, sx = 0, sl = 0
    r.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') return; down = true; sx = e.clientX; sl = r.scrollLeft; r.style.scrollSnapType = 'none' })
    addEventListener('pointerup', () => { if (down) { down = false; r.style.scrollSnapType = '' } })
    addEventListener('pointermove', (e) => { if (down) r.scrollLeft = sl - (e.clientX - sx) })
  })
}

/* ---------- downloads: newest Windows and Android releases from GitHub ---------- */
if (/android/i.test(navigator.userAgent)) {
  const w = $('#cta-win'), a = $('#cta-and')
  a.classList.add('btn--acc'); a.classList.remove('btn--ghost'); w.classList.remove('btn--acc'); w.classList.add('btn--ghost')
  a.parentElement.prepend(a)
}
;(async () => {
  try {
    const rs = await (await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`)).json()
    const pick = (re, ext) => {
      const r = rs.find((x) => !x.draft && re.test(x.tag_name) && x.assets.some((a) => a.name.endsWith(ext)))
      return r && { v: r.tag_name.replace(/^\D+/, ''), url: r.assets.find((a) => a.name.endsWith(ext)).browser_download_url, size: r.assets.find((a) => a.name.endsWith(ext)).size }
    }
    const win = pick(/^v\d/, '.exe'), and = pick(/^android-v/, '.apk')
    const mb = (n) => `${(n / 1048576).toFixed(0)} MB`
    if (win) {
      $('#dl-win').href = win.url; $('#cta-win').href = win.url
      $('#dl-win-v').textContent = `Version ${win.v} · ${mb(win.size)} · Windows 10 / 11`
      $('#v-win').textContent = `Windows ${win.v}`
    }
    if (and) {
      $('#dl-and').href = and.url; $('#cta-and').href = and.url
      $('#dl-and-v').textContent = `Version ${and.v} · ${mb(and.size)} · Android 8+`
      $('#v-and').textContent = `Android ${and.v}`
    }
  } catch { /* offline or rate limited: the buttons keep pointing at the releases page */ }
})()

/* ---------- reel: recordings of the real app ---------- */
{
  const v = $('#reel-video')
  $('#reel-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    const k = b.dataset.clip
    $$('#reel-tabs button').forEach((x) => x.classList.toggle('is-on', x === b))
    $('#reel-box').classList.toggle('is-tall', k === 'widget')
    b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
    v.poster = `assets/poster-${k}.jpg`
    v.src = `assets/clip-${k}.mp4`
    v.play().catch(() => {})
  })
  new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause())), { threshold: 0.25 }).observe(v)
  const song = $('#song-video')
  new IntersectionObserver((es) => es.forEach((e) => { if (!e.isIntersecting && !song.paused) song.pause() }), { threshold: 0.1 }).observe(song)
}

/* ---------- Vega: newest release links ---------- */
;(async () => {
  try {
    const rs = await (await fetch('https://api.github.com/repos/DhruvHarani1/vega/releases?per_page=10')).json()
    const r = rs.find((x) => !x.draft && x.assets.some((a) => a.name.endsWith('.exe')))
    if (!r) return
    const exe = r.assets.find((a) => a.name.endsWith('.exe')), apk = r.assets.find((a) => a.name.endsWith('.apk'))
    const mb = (n) => `${(n / 1048576).toFixed(0)} MB`
    const v = r.tag_name.replace(/^\D+/, '')
    $('#vega-win').href = exe.browser_download_url
    $('#vega-win').textContent = `Download for Windows · ${v}`
    if (apk) { $('#vega-and').href = apk.browser_download_url; $('#vega-and').textContent = `Download for Android · ${v}` }
    $('#vega-meta').textContent = `Version ${v} · Windows ${mb(exe.size)}${apk ? ` · Android ${mb(apk.size)}` : ''} · free and open source`
  } catch { /* keep the releases page links */ }
})()
