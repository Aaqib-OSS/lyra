/* Gallery page: grid of looks, filters, detail view with every state. */
const VIBES = window.LYRA_VIBES || []
const shot = (n) => `assets/shots/${n}.jpg`
const $ = (s) => document.querySelector(s)
const GROUPS = {
  zoom: ['sketch', 'glitch', 'comic', 'stencil', 'film'],
  retro: ['crt', 'arcade', 'blocks', 'cassette', 'stadium', 'sunset', 'chat', 'sticker', 'paper'],
  screen: ['noir', 'trailer', 'film', 'chat', 'crt', 'stadium']
}
const matches = (v, f) => f === 'all' || (f === 'dark' && !v.light) || (f === 'light' && v.light) || (GROUPS[f] || []).includes(v.id)
const grid = $('#vg')
const draw = (f) => {
  grid.innerHTML = VIBES.filter((v) => matches(v, f)).map((v) => `<article class="vc" data-id="${v.id}" style="--vc:${v.acc}" tabindex="0"><img loading="lazy" src="${shot(`${v.id}-full`)}" alt="${v.name} look" /><div class="vc__t"><b>${v.name}</b><small>${v.tag}</small></div></article>`).join('')
}
draw('all')
$('#filters').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return
  document.querySelectorAll('#filters button').forEach((x) => x.classList.toggle('is-on', x === b))
  draw(b.dataset.f)
})
const mdl = $('#mdl'), inn = $('#mdl-in')
const open = (id) => {
  const v = VIBES.find((x) => x.id === id)
  document.documentElement.style.setProperty('--acc', v.acc)
  const fig = (n, cap) => `<figure><img loading="lazy" src="${shot(n)}" alt="${v.name}, ${cap}" /><figcaption>${cap}</figcaption></figure>`
  inn.innerHTML = `<p class="mono">${v.layout} layout · ${v.stage} lyric style · ${v.light ? 'light, inked' : 'dark'}</p><h2 style="margin-top:12px;font-size:clamp(40px,8vw,96px)">${v.name}</h2><p class="lead" style="margin-top:12px">${v.tag}</p>
  <div class="mdl__grid">${fig(`${v.id}-full`, 'Synced, with video')}${fig(`${v.id}-plain`, 'Words without timing')}${fig(`${v.id}-nolyrics`, 'No lyrics found')}</div>
  <div class="mdl__row">${fig(`${v.id}-full-novideo`, 'No video')}${fig(`${v.id}-phone`, 'Android')}${fig(`card-${v.id}`, 'Share card')}</div>
  <div class="mdl__grid" style="grid-template-columns:2fr 1fr">${fig(`settings-${v.id}`, 'Settings panel')}${fig(`${v.id}-mini`, 'Mini player')}</div>`
  mdl.classList.add('on'); document.body.style.overflow = 'hidden'; mdl.scrollTop = 0
}
const close = () => { mdl.classList.remove('on'); document.body.style.overflow = '' }
grid.addEventListener('click', (e) => { const c = e.target.closest('.vc'); if (c) open(c.dataset.id) })
grid.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const c = e.target.closest('.vc'); if (c) open(c.dataset.id) } })
$('#mdl-x').addEventListener('click', close)
addEventListener('keydown', (e) => { if (e.key === 'Escape') close() })
document.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.style.visibility = 'hidden' }, true)
if (location.hash.length > 1) { const id = location.hash.slice(1); if (VIBES.some((v) => v.id === id)) open(id) }
