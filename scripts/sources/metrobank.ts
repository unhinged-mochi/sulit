import { getText, isoDate, toCategory, type Promo, type Source } from '../schema.ts'

const BASE = 'https://www.metrobank.com.ph'
// Bank's own placeholder coordinate (centre of the Visayas) for branches it never geocoded.
const PLACEHOLDER = (lat: number, lon: number) => lat === 11 && lon === 123.5

export function parse(html: string, now = new Date()): Promo[] {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)
  if (!m) throw new Error('metrobank: __NEXT_DATA__ missing')
  const data = JSON.parse(m[1]).props.pageProps.data
  const geo = new Map<string, { latitude: number; longitude: number }>(
    data.merchants.filter((b: any) => b.geolocation).map((b: any) => [b.id, b.geolocation]),
  )
  return data.promoDetails
    .filter((p: any) => !p.expirationDate || new Date(p.expirationDate) >= now)
    .map((p: any): Promo => {
      const cats = p.categories.map((c: any) => c.category)
      const branches = (p.participatingBranches ?? []).map((b: any) => {
        const g = geo.get(b.id)
        const ok = g && !PLACEHOLDER(g.latitude, g.longitude)
        return { name: b.name, address: b.address, city: b.city, lat: ok ? g.latitude : undefined, lon: ok ? g.longitude : undefined }
      })
      return {
        id: `metrobank:${p.id}`,
        bank: 'Metrobank',
        title: p.title,
        merchant: p.participatingBranches?.[0]?.merchant?.name,
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
