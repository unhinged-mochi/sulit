// Daily job: scrape every source → extract → geocode → write public/data/promos.json.
// One broken bank never blocks the rest: its last good promos are kept and the failure shows in `sources`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extractAll, pruneRegex, type ExtractCache } from './extract.ts'
import { geocodeAll, type GeoCache } from './geocode.ts'
import { isoDate, type Promo, type Source } from './schema.ts'
import { closeBrowser } from './browser.ts'
import { SOURCES } from './sources/index.ts'
import { cardsIn } from './sources/unionbank.ts'
import { validDays } from '../src/promo.ts'

export interface SourceStatus {
  bank: string
  ok: boolean
  count: number
  error?: string
  updatedAt?: string // last successful scrape
}
export interface Output {
  generatedAt: string
  sources: SourceStatus[]
  promos: Promo[]
}

const OUT = 'public/data/promos.json'
const read = <T>(path: string, fallback: T): T => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback)
const write = (path: string, v: unknown, pretty = true) => {
  mkdirSync(path.replace(/\/[^/]+$/, ''), { recursive: true })
  writeFileSync(path, JSON.stringify(v, null, pretty ? 1 : 0) + '\n')
}

const manilaDay = (offsetDays = 0) => isoDate(Date.now() + offsetDays * 864e5)!

/** Drop expired and far-future promos (a week's notice is useful, a month's is noise); keep open-ended ones. Dedupe by id. */
export function finalize(promos: Promo[], today = manilaDay(), horizon = manilaDay(7)): Promo[] {
  const seen = new Set<string>()
  return promos.filter((p) => {
    // "BPI", "RCBC Visa Infinite", "PNB JCB Platinum": the issuer or its card, never the place to go
    if (p.merchant && new RegExp(`^${p.bank}\\b`, 'i').test(p.merchant)) p.merchant = undefined
    // most banks list eligible cards only in the prose ("valid for BDO Platinum Mastercard"); none named = every card of the bank
    if (!p.cards?.length) p.cards = cardsIn(`${p.title} ${p.description ?? ''}`, p.bank)
    p.days ??= validDays(`${p.title}. ${p.discount ?? ''}. ${p.description ?? ''}`)
    return (!p.validTo || p.validTo >= today) && (!p.validFrom || p.validFrom <= horizon) && !seen.has(p.id) && seen.add(p.id)
  })
}

/** Carry each promo's first-seen date forward; ids the last run didn't have are new today. A first-ever run marks nothing new. */
export function stampFirstSeen(promos: Promo[], prev: Promo[], today = manilaDay()): Promo[] {
  const before = new Map(prev.map((p) => [p.id, p.firstSeen]))
  for (const p of promos) {
    if (before.has(p.id)) p.firstSeen = before.get(p.id)
    else if (prev.length) p.firstSeen = today
  }
  return promos
}

async function main() {
  const only = process.argv.slice(2).map((s) => s.toLowerCase())
  const sources: Source[] = only.length ? SOURCES.filter((s) => only.includes(s.bank.toLowerCase())) : SOURCES
  const prev = read<Output>(OUT, { generatedAt: '', sources: [], promos: [] })
  const now = new Date().toISOString()

  const results = await Promise.allSettled(
    sources.map(async (s) => {
      const t = Date.now()
      const promos = await s.fetch()
      if (!promos.length) throw new Error('0 promos — layout probably changed')
      console.log(`✓ ${s.bank}: ${promos.length} promos in ${((Date.now() - t) / 1000).toFixed(0)}s`)
      return promos
    }),
  )

  await closeBrowser() // banks behind bot walls share one headless Chromium
  const status: SourceStatus[] = []
  const fresh: Promo[] = []
  results.forEach((r, i) => {
    const bank = sources[i].bank
    const before = prev.sources.find((s) => s.bank === bank)
    if (r.status === 'fulfilled') {
      fresh.push(...r.value)
      status.push({ bank, ok: true, count: r.value.length, updatedAt: now })
    } else {
      const kept = prev.promos.filter((p) => p.bank === bank)
      fresh.push(...kept)
      const error = String(r.reason?.message ?? r.reason).slice(0, 200)
      console.error(`✗ ${bank}: ${error} (keeping ${kept.length} from last run)`)
      status.push({ bank, ok: false, count: kept.length, error, updatedAt: before?.updatedAt })
    }
  })
  // banks not in this (partial) run carry over untouched
  const ran = new Set(sources.map((s) => s.bank))
  fresh.push(...prev.promos.filter((p) => !ran.has(p.bank)))
  status.push(...prev.sources.filter((s) => !ran.has(s.bank)))

  const extractCache = read<ExtractCache>('data/extract-cache.json', {})
  if (process.env.RETRY_REGEX) pruneRegex(extractCache)
  const geoCache = read<GeoCache>('data/geocache.json', { address: {}, merchant: {} })
  const promos = finalize(fresh)
  // caches are the expensive part: checkpoint them as we go so a killed run keeps its LLM calls and lookups
  const saveCaches = () => (write('data/extract-cache.json', extractCache), write('data/geocache.json', geoCache))
  try {
    await extractAll(promos.filter((p) => ran.has(p.bank)), extractCache, saveCaches)
    await geocodeAll(promos.filter((p) => ran.has(p.bank)), geoCache, saveCaches)
  } finally {
    saveCaches()
  }

  const final = stampFirstSeen(finalize(promos), prev.promos)
  write(OUT, { generatedAt: now, sources: status.sort((a, b) => a.bank.localeCompare(b.bank)), promos: final } satisfies Output, false)
  const pinned = final.filter((p) => p.branches.length).length
  console.log(`wrote ${final.length} promos (${pinned} on the map, ${final.reduce((n, p) => n + p.branches.length, 0)} pins)`)
  if (status.every((s) => !s.ok)) process.exit(1)
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
