// Free geocoding: OSM Overpass for chains ("every Yabu in PH"), Nominatim for explicit addresses. Both cached.
import { UA, type Branch, type Promo } from './schema.ts'

export type GeoCache = {
  address: Record<string, { lat: number; lon: number; approx?: boolean } | null>
  merchant: Record<string, { at: string; hits: Branch[] }>
}

const OVERPASS = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter'
const MERCHANT_TTL_DAYS = 30 // re-ask OSM monthly: new branches get mapped, misses may start hitting
const MAX_PER_MERCHANT = 400
const PH_BBOX = { s: 4.2, w: 116.0, n: 21.5, e: 127.0 }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let lastNominatim = 0

async function nominatim(q: string): Promise<{ lat: number; lon: number } | null> {
  // usage policy: max 1 req/s, identifying UA
  await sleep(Math.max(0, lastNominatim + 1100 - Date.now()))
  lastNominatim = Date.now()
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ph&q=${encodeURIComponent(q)}`
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30_000) }).catch(() => null)
  if (!res?.ok) return null
  const [hit] = (await res.json()) as any[]
  return hit ? { lat: +hit.lat, lon: +hit.lon } : null
}

const withApprox = (g: { lat: number; lon: number } | null) => (g ? { ...g, approx: true } : null)

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\"]/g, '\\$&')

/** Names too generic to search OSM for — would pin thousands of unrelated places. */
const GENERIC = /^(participating|selected|partner|various|all|any|online|merchants?|stores?|restaurants?|hotels?|the)\b|\b(merchants|stores|partners|outlets)$/i

export function overpassQuery(merchant: string): string {
  const n = escapeRe(merchant.trim())
  const tagged = ['amenity', 'shop', 'tourism', 'leisure', 'healthcare'].map((t) => `nwr["name"~"^${n}( |$)",i]["${t}"](area.ph);`).join('')
  return `[out:json][timeout:90];area["ISO3166-1"="PH"][admin_level=2]->.ph;(nwr["brand"~"^${n}$",i](area.ph);${tagged});out center ${MAX_PER_MERCHANT};`
}

async function overpass(merchant: string): Promise<Branch[] | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(overpassQuery(merchant))}`,
      signal: AbortSignal.timeout(120_000),
    }).catch(() => null)
    if (res?.ok) {
      const { elements } = (await res.json()) as any
      return elements
        .map((e: any) => ({
          name: e.tags?.name ?? merchant,
          address: [e.tags?.['addr:street'], e.tags?.['addr:city']].filter(Boolean).join(', ') || undefined,
          city: e.tags?.['addr:city'],
          lat: e.lat ?? e.center?.lat,
          lon: e.lon ?? e.center?.lon,
        }))
        .filter((b: Branch) => b.lat != null)
    }
    await sleep(10_000 * (attempt + 1)) // 429/504: Overpass is shared; back off
  }
  return null // unknown — don't cache
}

const inPH = (b: { lat?: number; lon?: number }) =>
  b.lat != null && b.lon != null && b.lat > PH_BBOX.s && b.lat < PH_BBOX.n && b.lon > PH_BBOX.w && b.lon < PH_BBOX.e

export async function geocodeAll(promos: Promo[], cache: GeoCache): Promise<void> {
  // 1. explicit addresses
  const addr = new Map<string, [Promo, Branch]>()
  for (const p of promos) for (const b of p.branches) if (!inPH(b)) addr.set(addrKey(p, b), [p, b])
  const newAddr = [...addr].filter(([q]) => !(q in cache.address))
  console.log(`geocode: ${newAddr.length} new addresses (nominatim, ~${Math.ceil(newAddr.length * 2)}s)`)
  for (const [q, [p, b]] of newAddr) {
    // mall unit numbers trip Nominatim up: full address → "merchant, city" → city centre (flagged approximate)
    const named = [p.merchant ?? b.name, b.city].filter(Boolean).join(', ')
    cache.address[q] =
      (await nominatim(q)) ?? (named !== q ? await nominatim(named) : null) ?? (b.city ? withApprox(await nominatim(b.city)) : null)
  }

  // 2. chain lookups for promos with a merchant but no listed branches
  const fresh = (m: string) => cache.merchant[m] && Date.now() - Date.parse(cache.merchant[m].at) < MERCHANT_TTL_DAYS * 864e5
  const merchants = new Set(promos.filter((p) => !p.branches.length && !p.online && p.merchant && !GENERIC.test(p.merchant)).map((p) => norm(p.merchant!)))
  const todo = [...merchants].filter((m) => !fresh(m))
  console.log(`geocode: ${todo.length} merchants to look up on OSM`)
  for (const m of todo) {
    const hits = await overpass(m)
    if (hits) cache.merchant[m] = { at: new Date().toISOString(), hits }
    await sleep(1500)
  }

  for (const p of promos) {
    for (const b of p.branches) {
      if (inPH(b)) continue
      const hit = cache.address[addrKey(p, b)]
      if (hit) Object.assign(b, hit)
    }
    p.branches = p.branches.filter(inPH)
    if (!p.branches.length && !p.online && p.merchant) p.branches = (cache.merchant[norm(p.merchant)]?.hits ?? []).map((b) => ({ ...b }))
  }
}

const norm = (m: string) => m.replace(/[®™]/g, '').replace(/\s+/g, ' ').trim()
// "Bread Broth & Beyond, Unit SL11B Unimart Capitol Commons, Pasig City" — branch name first helps Nominatim find the POI
const addrKey = (p: Promo, b: Branch) => [b.address ? null : (p.merchant ?? b.name), b.address ?? b.name, b.city].filter(Boolean).join(', ')
