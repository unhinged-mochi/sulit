import { getJson, stripHtml, toCategory, type Promo, type Source } from '../schema.ts'

// BDO Deals runs on Perx. The public web app trades a public identifier for an anonymous bearer token.
const SITE = 'https://www.deals.bdo.com.ph'

export function toPromo(r: any): Promo | null {
  const tags: string[] = (r.category_tags ?? []).map((t: any) => `${t.parent?.title ?? ''}>${t.title}`)
  if (!tags.some((t) => t.startsWith('Credit Card>'))) return null
  const sub = tags.filter((t) => t.startsWith('Credit Card>')).map((t) => t.slice(12))
  return {
    id: `bdo:${r.id}`,
    bank: 'BDO',
    title: r.name.trim(),
    merchant: r.merchant_name ?? r.alt_merchant_name ?? undefined,
    description: stripHtml(r.description).slice(0, 4000),
    category: toCategory(...sub.filter((s) => !/card exclusive|buy now/i.test(s)), r.name),
    cards: [],
    // valid_to on this API is a rolling daily window, not the promo end; extract.ts reads the real dates from the text
    validFrom: undefined,
    validTo: undefined,
    url: `${SITE}/rewards/${r.id}`,
    image: r.images?.[0]?.url,
    online: sub.includes('Online') && !sub.some((s) => /dine|shop|travel/i.test(s)),
    branches: [],
  }
}

async function fetchAll(): Promise<Promo[]> {
  const cfg = await getJson(`${SITE}/assets/config/app-config.json`)
  const { bearer_token } = await getJson(`${SITE}/v4/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: new URL(SITE).host, identifier: cfg.custom.pi }),
  })
  const auth = { headers: { authorization: `Bearer ${bearer_token}` } }
  const ids: number[] = []
  for (let page = 1; ; page++) {
    const res = await getJson(`${cfg.apiHost}/v4/catalogs/1/items?page=${page}&size=100`, auth)
    ids.push(...res.data.filter((i: any) => i.item_type === 'Reward::Campaign').map((i: any) => i.item_id))
    if (!res.meta.next_page) break
  }
  const out: Promo[] = []
  for (const id of ids) {
    // ponytail: sequential, ~180 small requests (~40s). Batch via ?ids= didn't return them.
    const r = await getJson(`${cfg.apiHost}/v4/rewards/${id}`, auth).catch(() => null)
    const p = r?.data && toPromo(r.data)
    if (p) out.push(p)
  }
  return out
}

export default { bank: 'BDO', fetch: fetchAll } satisfies Source
