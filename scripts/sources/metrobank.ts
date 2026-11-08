import { getText, isoDate, toCategory, type Promo, type Source } from '../schema.ts'

const BASE = 'https://www.metrobank.com.ph'
// Bank's own placeholder coordinate (centre of the Visayas) for branches it never geocoded.
const PLACEHOLDER = (lat: number, lon: number) => lat === 11 && lon === 123.5

const words = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !/^(the|and|by|at|of|inc|corp|ph|philippines)$/.test(w))
/** Does the text name this merchant? Any distinctive word of the merchant's name counts. */
export const mentions = (text: string, merchant: string) => {
  const t = new Set(words(text))
  return words(merchant).some((w) => t.has(w))
}

export function parse(html: string, now = new Date()): Promo[] {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)
  if (!m) throw new Error('metrobank: __NEXT_DATA__ missing')
  const data = JSON.parse(m[1]).props.pageProps.data
  const geo = new Map<string, { latitude: number; longitude: number }>(
    data.merchants.filter((b: any) => b.geolocation).map((b: any) => [b.id, b.geolocation]),
  )
  const live = data.promoDetails.filter((p: any) => !p.expirationDate || new Date(p.expirationDate) >= now)
  const text = (p: any) => `${p.title} ${p.description ?? ''}`
  const merchantOf = (b: any): string => b.merchant?.name ?? b.name
  // merchants attached to 2+ promos that never name them: a CMS mix-up, not a group deal
  const unnamed = new Map<string, number>()
  for (const p of live) for (const m of new Set<string>((p.participatingBranches ?? []).map(merchantOf))) if (!mentions(text(p), m)) unnamed.set(m, (unnamed.get(m) ?? 0) + 1)
  return live
    .map((p: any): Promo => {
      const cats = p.categories.map((c: any) => c.category)
      // the bank's CMS sometimes attaches the same stray branch to unrelated promos (Mijo on Planet Sports, DermaCircles, Al Dente);
      // one-off unnamed links are group deals ("Bistro Group" → LongHorn) and stay
      const linked = (p.participatingBranches ?? []).filter((b: any) => mentions(text(p), merchantOf(b)) || (unnamed.get(merchantOf(b)) ?? 0) < 2)
      const branches = linked.map((b: any) => {
        const g = geo.get(b.id)
        const ok = g && !PLACEHOLDER(g.latitude, g.longitude)
        return { name: b.name, address: b.address, city: b.city, lat: ok ? g.latitude : undefined, lon: ok ? g.longitude : undefined }
      })
      return {
        id: `metrobank:${p.id}`,
        bank: 'Metrobank',
        title: p.title,
        merchant: linked[0]?.merchant?.name,
        description: p.description,
        category: toCategory(...cats),
        cards: p.cards.filter((c: any) => c.cardTypes.some((t: any) => t.name === 'Credit Card') || !c.cardTypes.length).map((c: any) => c.title),
        validFrom: isoDate(p.startDate),
        validTo: isoDate(p.expirationDate),
        url: `${BASE}/promos${p.slug}`,
        image: p.cardBannerImage?.url,
        online: cats.includes('Online'),
        branches,
      }
    })
    // non-card promos (deposits, loans) have no credit cards attached
    .filter((p: Promo) => p.cards.length)
}

export default { bank: 'Metrobank', fetch: async () => parse(await getText(`${BASE}/promos`)) } satisfies Source
