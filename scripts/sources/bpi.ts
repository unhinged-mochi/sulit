import { getJson, isoDate, toCategory, type Promo, type Source } from '../schema.ts'

const BASE = 'https://www.bpi.com.ph'
const MODEL = `${BASE}/content/bpi/ph/en/personal/rewards-and-promotions/promos/jcr:content/root/container/tabshorizontal.model.json`
const TAB = 'Credit cards'

export function parse(json: any): Promo[] {
  return (json.mapArticle?.[TAB]?.[0]?.listPage ?? []).map((a: any): Promo => {
    const slug = a.viewArticleLink ?? a.externalViewArticle ?? ''
    return {
      id: `bpi:${slug.split('/').pop() || a.heading}`,
      bank: 'BPI',
      title: a.heading.trim(),
      merchant: a.merchantName ?? undefined,
      description: a.description?.replace(/\.\.\.$/, '…').trim(),
      category: toCategory(...(a.chips ?? []), a.heading),
      cards: [],
      validTo: isoDate(a.promoExpiryDate || a.promotionEndDate),
      url: slug.startsWith('http') ? slug : BASE + slug,
      image: a.image ? BASE + a.image : undefined,
      online: (a.chips ?? []).includes('Online') && (a.chips ?? []).length === 1,
      branches: [],
    }
  })
}

async function fetchAll(): Promise<Promo[]> {
  const first = await getJson(`${MODEL}?sort=newest&page=1`)
  const total = first.mapArticle[TAB][0].articleListSize as number
  const out = parse(first)
  for (let page = 2; out.length < total && page < 100; page++) {
    const next = parse(await getJson(`${MODEL}?sort=newest&page=${page}`))
    if (!next.length) break
    out.push(...next)
  }
  const seen = new Set<string>()
  return out.filter((p) => !seen.has(p.id) && seen.add(p.id))
}

export default { bank: 'BPI', fetch: fetchAll } satisfies Source
