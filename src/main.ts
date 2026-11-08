import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import 'maplibre-gl/dist/maplibre-gl.css'
import './style.css'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MLMap } from 'maplibre-gl'
// v6 locates its worker relative to its own module, which bundling breaks; ship the worker as an asset instead
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import type * as GeoJSON from 'geojson'
import { ChevronDown, createElement, ExternalLink, LocateFixed, MapPin, Search, X } from 'lucide'
import type { Category, Promo } from '../scripts/schema.ts'
import type { Output } from '../scripts/refresh.ts'
import { daysLeft, networkOnly, shortDiscount, takes } from './promo.ts'
import { paperMap, rosette } from './paper.ts'

// ---------- state ----------
type Tab = 'here' | 'anywhere'
const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch {} },
}
const state = {
  wallet: new Set<string>(JSON.parse(store.get('sulit.wallet') ?? '[]')),
  cards: JSON.parse(store.get('sulit.cards') ?? '{}') as Record<string, string[]>, // bank → cards held; none = any card of that bank
  cat: null as Category | null,
  q: '', // merchant / mall search, lowercased
  soon: false,
  tab: 'here' as Tab,
  selected: null as string | null, // location key or promo id
}
let data: Output
let byId = new Map<string, Promo>()

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const icon = (i: Parameters<typeof createElement>[0], size = 16) => createElement(i, { width: size, height: size, 'aria-hidden': 'true' }).outerHTML
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const safeUrl = (u: string) => (/^https:\/\//.test(u) ? u : '#')
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

const CATS: [Category, string][] = [['dining', 'Dining'], ['shopping', 'Shopping'], ['groceries', 'Groceries'], ['travel', 'Travel'], ['wellness', 'Wellness'], ['services', 'Services']]
// rubber-stamp ink per bank: the only place bank colour appears
const STAMP: Record<string, string> = {
  BDO: '#0a3a8c', BPI: '#a3121a', Metrobank: '#0b3f91', 'Security Bank': '#0a6e8a', RCBC: '#1d4f91', UnionBank: '#c25a00',
  EastWest: '#5b2a86', PNB: '#0b3a6b', Chinabank: '#b0122b', AUB: '#7a1f3d', HSBC: '#b0000f', Maybank: '#8a6a00', Visa: '#1a1f71',
}

// ---------- filtering ----------
// what the search box matches: merchant, headline, and every branch name and address (so "megamall" works)
const hay = new WeakMap<Promo, string>()
const haystack = (p: Promo) => {
  let h = hay.get(p)
  if (h == null) hay.set(p, (h = [p.merchant, p.title, ...p.branches.flatMap((b) => [b.name, b.address])].join(' ').toLowerCase()))
  return h
}
const visible = (p: Promo) =>
  (!state.q || haystack(p).includes(state.q)) &&
  (!state.wallet.size ||
    (state.wallet.has(p.bank) && takes(p, state.cards[p.bank])) ||
    // Visa's own offers work with any bank's Visa card
    (p.bank === 'Visa' && [...state.wallet].some((b) => takes(p, state.cards[b])))) &&
  (!state.cat || p.category === state.cat) &&
  (!state.soon || (daysLeft(p.validTo) ?? 99) <= 7)

const locKey = (lat: number, lon: number) => `${lat.toFixed(5)},${lon.toFixed(5)}`

/** One feature per physical spot; several promos at the same branch share a tag. */
function features(): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const spots = new Map<string, { lat: number; lon: number; ids: string[]; approx: boolean; name: string }>()
  for (const p of data?.promos ?? []) {
    if (!visible(p)) continue
    for (const b of p.branches) {
      const k = locKey(b.lat!, b.lon!)
      const s = spots.get(k) ?? { lat: b.lat!, lon: b.lon!, ids: [], approx: !!b.approx, name: b.name }
      if (!s.ids.includes(p.id)) s.ids.push(p.id)
      spots.set(k, s)
    }
  }
  return {
    type: 'FeatureCollection',
    features: [...spots].map(([k, s]) => ({
      type: 'Feature',
      id: k,
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: { k, ids: s.ids.join('|'), approx: s.approx, name: s.name },
    })),
  }
}

// ---------- map ----------
maplibregl.setWorkerUrl(workerUrl)
const map: MLMap = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/positron',
  center: [121.03, 14.57], // Metro Manila
  zoom: 11.2,
  minZoom: 4.5,
  maxBounds: [[112, 2], [131, 23]],
  attributionControl: { compact: true },
})
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
const geo = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, fitBoundsOptions: { maxZoom: 15 }, trackUserLocation: false })
map.addControl(geo, 'top-right')

const markers = new Map<string, maplibregl.Marker>()
const SEAL = rosette(44, 'rgb(244 242 236 / 0.55)', { width: 0.5 }) // cluster seal: engraved, not a flat dot

/** Denomination weight: a 50% note is engraved heavier than a 10% one, so the map ranks itself. */
const wght = (n = 0) => Math.round(360 + (Math.min(n, 60) / 60) * 540)
/** The denomination. Real discounts at full ink; 0% plans and unnumbered perks quieter. */
function priceNum(p: Promo, cls = 'price-num') {
  const d = shortDiscount(p.discount)
  if (!d) return `<span class="${cls} none">Perk</span>`
  return `<span class="${cls} ${d.kind}" style="--w:${wght(d.n)}">${d.upTo ? '<i>up to</i>' : ''}${esc(d.label)}${d.note ? `<i>${esc(d.note)}</i>` : ''}</span>`
}
/** List order within a group: plans and unnumbered perks after real deals. */
const tier = (p: Promo) => { const k = shortDiscount(p.discount)?.kind; return k === 'off' || k === 'perk' ? 0 : 1 }

function tagFor(ids: string[]): { big: string; small: string; kind: string; w: number } {
  const ps = ids.map((i) => byId.get(i)!).filter(Boolean)
  // the best headline wins the tag; the rest count as "+n"
  const scored = ps.map((p) => ({ p, d: shortDiscount(p.discount) })).sort((a, b) => (b.d?.n ?? 0) - (a.d?.n ?? 0))
  const best = scored[0]
  return { big: best?.d?.label ?? 'Perk', small: ps.length > 1 ? `+${ps.length - 1}` : best.p.bank, kind: best?.d?.kind ?? 'none', w: wght(best?.d?.n) }
}

function syncMarkers() {
  if (!map.getSource('spots')) return
  const seen = new Set<string>()
  for (const f of map.querySourceFeatures('spots')) {
    const props = f.properties as any
    const key = props.cluster ? `c${props.cluster_id}` : props.k
    if (seen.has(key)) continue
    seen.add(key)
    if (markers.has(key)) continue
    const el = document.createElement('button')
    const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates
    if (props.cluster) {
      el.className = 'sticker'
      el.tabIndex = -1 // the list is the keyboard path; 30+ markers in the tab order bury it
      el.innerHTML = `${SEAL}<span>${props.point_count_abbreviated}</span>`
      el.setAttribute('aria-label', `${props.point_count} places, zoom in`)
      el.onclick = async () => {
        const z = await (map.getSource('spots') as GeoJSONSource).getClusterExpansionZoom(props.cluster_id)
        map.easeTo({ center: [lon, lat], zoom: z + 0.3, duration: reduceMotion ? 0 : 500 })
      }
    } else {
      const ids = String(props.ids).split('|')
      const t = tagFor(ids)
      el.className = `tag ${t.kind}${props.approx ? ' approx' : ''}${state.selected === props.k ? ' on' : ''}`
      el.tabIndex = -1
      el.dataset.k = props.k
      el.style.setProperty('--w', String(t.w))
      el.innerHTML = `<b>${esc(t.big)}</b><small>${esc(t.small)}</small>`
      el.setAttribute('aria-label', `${t.big} at ${props.name}${props.approx ? ', approximate location' : ''}`)
      el.onclick = () => select(props.k, ids, [lon, lat])
    }
    markers.set(key, new maplibregl.Marker({ element: el, anchor: props.cluster ? 'center' : 'bottom' }).setLngLat([lon, lat]).addTo(map))
  }
  for (const [k, m] of markers) if (!seen.has(k)) (m.remove(), markers.delete(k))
}

function refreshSource() {
  const src = map.getSource('spots') as GeoJSONSource | undefined
  if (!src) return
  for (const m of markers.values()) m.remove()
  markers.clear()
  src.setData(features())
}

map.on('load', () => {
  paperMap(map)
  map.addSource('spots', { type: 'geojson', data: features(), cluster: true, clusterRadius: 46, clusterMaxZoom: 14 })
  // invisible layer so querySourceFeatures has tiles to read; markers draw the visuals
  map.addLayer({ id: 'spots-hit', type: 'circle', source: 'spots', paint: { 'circle-radius': 0, 'circle-opacity': 0 } })
  map.on('render', syncMarkers)
})
map.on('moveend', () => state.tab === 'here' && renderList())

// ---------- list ----------
function promosInView(): Promo[] {
  const b = map.getBounds()
  const c = map.getCenter()
  const out: { p: Promo; d: number }[] = []
  for (const p of data.promos) {
    if (!visible(p) || !p.branches.length) continue
    let best = Infinity
    for (const br of p.branches) {
      if (!b.contains([br.lon!, br.lat!])) continue
      best = Math.min(best, (br.lat! - c.lat) ** 2 + (br.lon! - c.lng) ** 2)
    }
    if (best < Infinity) out.push({ p, d: best })
  }
  return out.sort((a, b) => tier(a.p) - tier(b.p) || a.d - b.d).map((x) => x.p)
}

const anywhere = () =>
  data.promos.filter((p) => visible(p) && !p.branches.length).sort((a, b) => tier(a) - tier(b) || (daysLeft(a.validTo) ?? 999) - (daysLeft(b.validTo) ?? 999))

const shortDate = (iso: string) => new Date(`${iso}T00:00:00+08:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })

function daysText(p: Promo) {
  if (p.validFrom && (daysLeft(p.validFrom) ?? 0) > 0) return { text: `Starts ${shortDate(p.validFrom)}`, soon: false }
  const d = daysLeft(p.validTo)
  if (d == null) return { text: 'Ongoing', soon: false }
  if (d <= 0) return { text: 'Last day', soon: true }
  return { text: d === 1 ? '1 day left' : `${d} days left`, soon: d <= 7 }
}

function card(p: Promo, tag: 'li' | 'div' = 'li') {
  const d = shortDiscount(p.discount)
  const days = daysText(p)
  return `<${tag} class="price"><button class="price-hit" data-id="${esc(p.id)}">
    ${priceNum(p)}
    <span class="price-body">
      <strong>${esc(p.merchant || p.title)}</strong>
      <span class="price-meta"><span class="stamp" style="--stamp:${STAMP[p.bank] ?? '#333'}">${esc(p.bank)}</span>${p.discount && !d ? esc(p.discount) : esc(p.merchant ? p.title : '')}</span>
    </span>
    <span class="days${days.soon ? ' soon' : ''}">${esc(days.text)}</span>
  </button></${tag}>`
}

const LIST_CAP = 120
function renderList() {
  if (!data) return
  const here = promosInView()
  const away = anywhere()
  $('count-here').textContent = String(here.length)
  $('count-anywhere').textContent = String(away.length)
  const shown = new Set($('detail').hidden ? [] : ($('detail').dataset.ids ?? '').split('|'))
  const rows = (state.tab === 'here' ? here : away).filter((p) => !shown.has(p.id))
  const list = $('list')
  if (!rows.length) {
    if (shown.size) return void (list.innerHTML = '')
    const active = [
      state.q && `“${esc(state.q)}”`,
      state.cat && CATS.find(([c]) => c === state.cat)![1],
      state.soon && 'ending this week',
      state.wallet.size && 'your cards',
    ].filter(Boolean)
    const other = state.tab === 'here' ? away.length : here.length
    list.innerHTML = `<li class="empty"><p>${
      state.tab === 'here' ? 'Nothing pinned in this part of the map' : 'No online or nationwide promos'
    }${active.length ? ` for ${active.join(' + ')}` : ''}.</p>${
      state.tab === 'here' ? '<p>Zoom out or pan to another city.</p>' : ''
    }<p class="empty-actions">${
      active.length > (state.wallet.size ? 1 : 0) ? '<button class="text-btn" data-reset>Clear filters</button>' : ''
    }${other ? `<button class="text-btn" data-other>See ${other} ${state.tab === 'here' ? 'online &amp; everywhere' : 'on the map'}</button>` : ''}</p></li>`
    return
  }
  list.innerHTML =
    rows.slice(0, LIST_CAP).map((p) => card(p)).join('') +
    (rows.length > LIST_CAP ? `<li class="more">${rows.length - LIST_CAP} more. Zoom in to narrow it down.</li>` : '')
}

// ---------- detail ----------
function detail(ids: string[], where?: string) {
  const el = $('detail')
  const ps = ids.map((i) => byId.get(i)!).filter(Boolean)
  if (!ps.length) return closeDetail()
  const one = ps.length === 1 ? ps[0] : null
  if (one) {
    const d = shortDiscount(one.discount)
    const days = daysText(one)
    const approx = where && one.branches.find((b) => locKey(b.lat!, b.lon!) === where)?.approx
    el.innerHTML = `
      <button class="close" aria-label="Close">${icon(X, 18)}</button>
      <span class="detail-rosette">${rosette(220, 'currentColor', { cls: 'ring', width: 0.55 })}</span>
      <span class="thread" aria-hidden="true"></span>
      ${priceNum(one, 'detail-num')}
      <h2 tabindex="-1">${esc(one.merchant || one.title)}</h2>
      ${one.merchant ? `<p class="detail-title">${esc(one.title)}</p>` : one.discount && !d ? `<p class="detail-title">${esc(one.discount)}</p>` : ''}
      <dl>
        <dt>Bank</dt><dd><span class="stamp" style="--stamp:${STAMP[one.bank] ?? '#333'}">${esc(one.bank)}</span></dd>
        <dt>Cards</dt><dd>${one.cards.length ? one.cards.map(esc).join(', ') : `All ${esc(one.bank)} credit cards`}</dd>
        <dt>Until</dt><dd><span class="days${days.soon ? ' soon' : ''}">${one.validTo ? `${new Date(one.validTo + 'T00:00:00+08:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} · ${days.text}` : 'No end date listed'}</span></dd>
        ${where ? `<dt>Where</dt><dd>${icon(MapPin, 14)} ${esc(one.branches.find((b) => locKey(b.lat!, b.lon!) === where)?.address ?? one.branches.find((b) => locKey(b.lat!, b.lon!) === where)?.name ?? '')}${approx ? ' <em>(pin is the city, not the store)</em>' : ''}</dd>` : one.branches.length ? `<dt>Where</dt><dd>${one.branches.length} location${one.branches.length > 1 ? 's' : ''} on the map</dd>` : ''}
      </dl>
      ${one.description ? `<p class="detail-desc">${esc(clip(one.description, 420))}</p>` : ''}
      <a class="go" href="${esc(safeUrl(one.url))}" target="_blank" rel="noopener">Read ${esc(one.bank)}’s terms ${icon(ExternalLink, 15)}</a>`
  } else {
    el.innerHTML = `<button class="close" aria-label="Close">${icon(X, 18)}</button>
      <h2 class="detail-group" tabindex="-1">${ps.length} promos here</h2><ol class="list">${ps.map((p) => card(p)).join('')}</ol>`
  }
  el.hidden = false
  el.dataset.ids = ps.map((p) => p.id).join('|')
  el.classList.remove('tape-in')
  if (!reduceMotion) void el.offsetWidth, el.classList.add('tape-in'), countUp(el.querySelector('.detail-num'))
  el.querySelector<HTMLButtonElement>('.close')!.onclick = closeDetail
  $('sheet-body').scrollTop = 0
  setSheet('half', true)
  el.querySelector<HTMLElement>('h2')!.focus({ preventScroll: true })
  renderList()
}
/** The note prints: the denomination counts up to its value as the rosette engraves in. */
function countUp(num: Element | null) {
  const node = [...(num?.childNodes ?? [])].find((n) => n.nodeType === 3 && /\d/.test(n.textContent!))
  const m = node?.textContent!.match(/^(\D*)(\d+)(.*)$/)
  if (!node || !m) return
  const [, pre, n, post] = m
  const t0 = performance.now()
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / 520)
    node.textContent = `${pre}${Math.round(+n * (1 - (1 - k) ** 3))}${post}`
    if (k < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}
/** Scraped mechanics: tidy stray spaces before punctuation, cut at a word, not mid-word. */
const clip = (t: string, max: number) => {
  t = t.replace(/\s+([.,;:!?])/g, '$1').replace(/\s{2,}/g, ' ').trim()
  return t.length <= max ? t : `${t.slice(0, max).replace(/\s+\S*$/, '')}…`
}

function closeDetail() {
  if ($('detail').hidden) return
  $('detail').hidden = true
  state.selected = null
  document.querySelectorAll('.tag.on').forEach((t) => t.classList.remove('on'))
  renderList()
}

/** On phones the half sheet covers the lower ~60% of the map: keep the chosen pin in the strip above it. */
const sheetCover = () => (innerWidth < 900 ? innerHeight * 0.58 : 0)
function reveal(at: [number, number], zoom?: number) {
  const pt = map.project(at)
  const box = map.getContainer().getBoundingClientRect()
  const inView = pt.x > 30 && pt.x < box.width - 30 && pt.y > 50 && pt.y < box.height - sheetCover() - 20
  if (inView && (zoom == null || map.getZoom() >= zoom)) return
  map.easeTo({ center: at, zoom: Math.max(map.getZoom(), zoom ?? 0), padding: { top: 0, left: 0, right: 0, bottom: sheetCover() }, duration: reduceMotion ? 0 : 500 })
}
const markOn = (k: string | null) => {
  document.querySelectorAll('.tag.on').forEach((t) => t.classList.remove('on'))
  if (k) document.querySelector(`.tag[data-k="${CSS.escape(k)}"]`)?.classList.add('on')
}

function select(k: string, ids: string[], at: [number, number]) {
  state.selected = k
  markOn(k)
  detail(ids, k)
  reveal(at)
}

$('sheet').addEventListener('click', (e) => {
  const t = e.target as HTMLElement
  if (t.closest('[data-reset]')) return resetFilters()
  if (t.closest('[data-other]')) return $(`tab-${state.tab === 'here' ? 'anywhere' : 'here'}`).click()
  const hit = t.closest<HTMLButtonElement>('.price-hit')
  if (!hit) return
  const p = byId.get(hit.dataset.id!)
  if (!p) return
  // from the list: show the promo, and fly to its nearest pin
  const c = map.getCenter()
  const near = [...p.branches].sort((a, b) => (a.lat! - c.lat) ** 2 + (a.lon! - c.lng) ** 2 - ((b.lat! - c.lat) ** 2 + (b.lon! - c.lng) ** 2))[0]
  state.selected = near ? locKey(near.lat!, near.lon!) : p.id
  detail([p.id], near ? state.selected : undefined)
  if (near) (reveal([near.lon!, near.lat!], 14), map.once('idle', () => markOn(state.selected)))
})

// ---------- sheet (phones) ----------
type SheetPos = 'peek' | 'half' | 'full'
const sheet = $('sheet')
function setSheet(pos: SheetPos, onlyGrow = false) {
  const order: SheetPos[] = ['peek', 'half', 'full']
  if (onlyGrow && order.indexOf(pos) < order.indexOf(sheet.dataset.pos as SheetPos)) return
  sheet.dataset.pos = pos
  $('grip').setAttribute('aria-label', pos === 'full' ? 'Collapse list' : 'Expand list')
}
setSheet('peek')
{
  const grip = $('grip')
  let startY = 0, startH = 0, moved = false
  grip.addEventListener('pointerdown', (e) => {
    startY = e.clientY; startH = sheet.getBoundingClientRect().height; moved = false
    grip.setPointerCapture(e.pointerId)
    sheet.classList.add('dragging')
  })
  grip.addEventListener('pointermove', (e) => {
    if (!grip.hasPointerCapture(e.pointerId)) return
    if (Math.abs(e.clientY - startY) > 4) moved = true
    sheet.style.height = `${Math.max(120, startH + startY - e.clientY)}px`
  })
  grip.addEventListener('pointerup', (e) => {
    sheet.classList.remove('dragging')
    const h = sheet.getBoundingClientRect().height / innerHeight
    sheet.style.height = ''
    if (!moved) return setSheet(sheet.dataset.pos === 'peek' ? 'half' : sheet.dataset.pos === 'half' ? 'full' : 'peek')
    setSheet(h > 0.66 ? 'full' : h > 0.3 ? 'half' : 'peek')
    void e
  })
}

// ---------- controls ----------
/** Specific cards a bank's promos name, most-mentioned first. Network-only names ("BDO Visa") aren't products to pick. */
function catalog(bank: string): string[] {
  const n = new Map<string, number>()
  for (const p of data.promos) if (p.bank === bank) for (const c of p.cards) if (!networkOnly(c, bank)) n.set(c, (n.get(c) ?? 0) + 1)
  for (const c of state.cards[bank] ?? []) n.set(c, n.get(c) ?? 0) // a held card that dropped out of today's promos stays tickable
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c)
}
const short = (card: string, bank: string) => card.replace(new RegExp(`^${bank} `), '')
const saveWallet = () => (store.set('sulit.wallet', JSON.stringify([...state.wallet])), store.set('sulit.cards', JSON.stringify(state.cards)))

function renderWallet() {
  const all = [...new Set(data.promos.map((p) => p.bank))].filter((b) => b !== 'Visa').sort()
  const chosen = all.filter((b) => state.wallet.has(b))
  const clear = state.wallet.size ? `<button class="chip clear" data-clear>Show all banks</button>` : ''
  // first-use note: peels off the map the moment a bank goes in
  const hint = $('hint')
  if (!state.wallet.size) hint.hidden = false
  else if (!hint.hidden && !reduceMotion) (hint.classList.add('peel'), hint.addEventListener('animationend', () => ((hint.hidden = true), hint.classList.remove('peel')), { once: true }))
  else hint.hidden = true
  $('wallet').innerHTML =
    [...chosen, ...all.filter((b) => !state.wallet.has(b))]
      .map((b) => {
        const on = state.wallet.has(b)
        const held = state.cards[b]?.length ?? 0
        const picks = on && catalog(b).length
        // once in the wallet with cards to pick, the chip opens a dialog rather than toggling, so it stops claiming to be a toggle
        return `<button class="chip${on ? ' on' : ''}" data-bank="${esc(b)}"${picks ? ` aria-haspopup="dialog" aria-label="${esc(b)}, in your wallet, ${held ? `${held} card${held > 1 ? 's' : ''}` : 'any card'}. Choose cards"` : ` aria-pressed="${on}"`}>${esc(b)}${
          picks ? `<span class="chip-cards">${held ? `${held} card${held > 1 ? 's' : ''}` : 'any card'}${icon(ChevronDown, 13)}</span>` : ''
        }</button>`
      })
      .join('')
  if (clear) chosen.length ? $('wallet').children[chosen.length - 1].insertAdjacentHTML('afterend', clear) : $('wallet').insertAdjacentHTML('afterbegin', clear)
  $('wallet').classList.toggle('empty', !state.wallet.size)
}
$('wallet').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button')
  if (!b) return
  const bank = b.dataset.bank!
  if (b.dataset.clear != null) (state.wallet.clear(), (state.cards = {}))
  // first tap adds the bank; once it's in, the chip opens its card list (where it can also be removed)
  else if (!state.wallet.has(bank)) state.wallet.add(bank)
  else if (catalog(bank).length) return openCards(bank)
  else state.wallet.delete(bank)
  saveWallet()
  renderWallet()
  update()
})

const cardsDialog = $<HTMLDialogElement>('cards')
function openCards(bank: string) {
  const held = new Set(state.cards[bank] ?? [])
  cardsDialog.dataset.bank = bank
  $('cards-title').textContent = `Your ${bank} cards`
  $('cards-any').textContent = `Leave all unticked to see every ${bank} promo.`
  $('cards-list').innerHTML = catalog(bank)
    .map((c) => `<li><label><input type="checkbox" value="${esc(c)}"${held.has(c) ? ' checked' : ''} /> ${esc(short(c, bank))}</label></li>`)
    .join('')
  $('cards-remove').textContent = `Remove ${bank}`
  cardsDialog.showModal()
}
$('cards-list').addEventListener('change', () => {
  const bank = cardsDialog.dataset.bank!
  const held = [...$('cards-list').querySelectorAll<HTMLInputElement>('input:checked')].map((i) => i.value)
  held.length ? (state.cards[bank] = held) : delete state.cards[bank]
  saveWallet()
  renderWallet()
  update()
})
$('cards-remove').addEventListener('click', () => {
  const bank = cardsDialog.dataset.bank!
  state.wallet.delete(bank)
  delete state.cards[bank]
  saveWallet()
  renderWallet()
  update()
  cardsDialog.close()
})
// tap outside the card to dismiss
cardsDialog.addEventListener('click', (e) => e.target === cardsDialog && cardsDialog.close())

$('cats').innerHTML = CATS.map(([c, l]) => `<button class="cat" aria-pressed="false" data-cat="${c}">${l}</button>`).join('')
$('cats').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button')
  if (!b) return
  state.cat = state.cat === b.dataset.cat ? null : (b.dataset.cat as Category)
  document.querySelectorAll('.cat').forEach((c) => c.setAttribute('aria-pressed', String((c as HTMLElement).dataset.cat === state.cat)))
  update()
})
$<HTMLInputElement>('soon').addEventListener('change', (e) => {
  state.soon = (e.target as HTMLInputElement).checked
  update()
})
for (const t of ['here', 'anywhere'] as Tab[]) {
  $(`tab-${t}`).addEventListener('click', () => {
    state.tab = t
    for (const o of ['here', 'anywhere']) {
      $(`tab-${o}`).setAttribute('aria-selected', String(o === t))
      $(`tab-${o}`).tabIndex = o === t ? 0 : -1
    }
    $('list').setAttribute('aria-labelledby', `tab-${t}`)
    closeDetail()
    renderList()
    setSheet('half', true)
  })
}

document.querySelector('.tabs')!.addEventListener('keydown', (e) => {
  const k = (e as KeyboardEvent).key
  if (k !== 'ArrowLeft' && k !== 'ArrowRight') return
  const next = $(`tab-${state.tab === 'here' ? 'anywhere' : 'here'}`)
  next.click()
  next.focus()
})

function resetFilters() {
  state.cat = null
  state.soon = false
  state.q = ''
  $<HTMLInputElement>('q').value = ''
  $<HTMLInputElement>('soon').checked = false
  document.querySelectorAll('.cat').forEach((c) => c.setAttribute('aria-pressed', 'false'))
  update()
}

let typing: ReturnType<typeof setTimeout> | undefined
$<HTMLInputElement>('q').addEventListener('input', (e) => {
  clearTimeout(typing)
  typing = setTimeout(() => ((state.q = (e.target as HTMLInputElement).value.trim().toLowerCase()), update()), 180)
})
$('near').addEventListener('click', () => geo.trigger())

function update() {
  closeDetail()
  refreshSource()
  renderList()
}

function renderFresh() {
  const at = new Date(data.generatedAt)
  const stale = data.sources.filter((s) => !s.ok)
  $('fresh').innerHTML = `<details><summary>Updated ${at.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${
    stale.length ? ` · <span class="soon">${stale.length} bank${stale.length > 1 ? 's' : ''} behind</span>` : ''
  }</summary><ul><li class="fresh-head"><span>Bank</span><span>Current</span><span>Checked</span></li>${data.sources
    .map((s) => {
      const age = s.updatedAt ? Math.floor((Date.now() - Date.parse(s.updatedAt)) / 864e5) : null
      const shown = data.promos.filter((p) => p.bank === s.bank).length
      return `<li><span>${esc(s.bank)}</span><span title="${s.count} found on the bank's page">${shown || '–'}</span><span class="${s.ok ? '' : 'soon'}">${s.ok ? 'today' : age == null ? 'not reachable yet' : `${age} day${age === 1 ? '' : 's'} old`}</span></li>`
    })
    .join('')}</ul><p>“–” means every promo the bank lists has ended or starts later. Sulit copies promos from each bank’s public promo page every morning. The bank’s page is always the final word.</p></details>`
}

// keyboard: Esc closes the detail
addEventListener('keydown', (e) => e.key === 'Escape' && !$('detail').hidden && closeDetail())
document.querySelector('.maplibregl-ctrl-geolocate')?.replaceChildren()
const locBtn = document.querySelector<HTMLButtonElement>('.maplibregl-ctrl-geolocate')
if (locBtn) locBtn.innerHTML = icon(LocateFixed, 18)
$('near').insertAdjacentHTML('afterbegin', icon(LocateFixed, 16))
document.querySelector('.search')!.insertAdjacentHTML('afterbegin', icon(Search, 16))

// ---------- boot ----------
fetch('/data/promos.json')
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
  .then((d: Output) => {
    data = d
    byId = new Map(d.promos.map((p) => [p.id, p]))
    renderWallet()
    renderFresh()
    if (map.isStyleLoaded()) refreshSource()
    map.once('idle', renderList)
    renderList()
  })
  .catch(() => {
    $('list').innerHTML = `<li class="empty">Couldn’t load promos. Check your connection and reload.</li>`
  })
