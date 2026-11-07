import { getJson, isoDate, stripHtml, toCategory, type Branch, type Promo, type Source } from '../schema.ts'
import { findDiscount } from './eastwest.ts'

const BASE = 'https://offers.hsbc.com.ph'
// The SvelteKit site hydrates from this JSON API; it already carries dates, tags and store addresses,
// so no per-offer detail fetch is needed. 15 offers per page.
const API = (page: number) => `${BASE}/sp/api/v1/offers?page=${page}`

/** Slug the site puts in /offers/{id}/{slug}: lodash-style kebabCase of the brand ("iPhone 18" → "i-phone-18", "Rustan's" → "rustans"). */
export const slugify = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)|(\d)([A-Za-z])/g, (_, a, b, c, d) => (a ? `${a} ${b}` : `${c} ${d}`))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const CREDIT = /credit card|mastercard|instal+ment|red hot deals|live\+/i
const NOT_CREDIT = /debit card|open (?:a|an|your) (?:hsbc )?premier (?:bank )?account|deposit/i
// Category tags in priority order; the rest ("Mastercard", "Premier - …", "Credit Cards") say who, not what
const TOPIC = /^(?:dining|travel|shopping|beauty and wellness|electronics and appliances|home furnishing|department stores and groceries|retail, apparel and travel)$/i
// "Instalment - Home Furnishing" → "Home Furnishing"; labels toCategory can't place (or misplaces as groceries) → shopping
const topics = (tags: string[]) =>
  tags
    .map((t) => t.replace(/^.* - (?:live\+ )?/i, ''))
    .filter((t) => TOPIC.test(t))
    .map((t) => (/home furnishing|department stores/i.test(t) ? 'Shopping' : t))
const NOT_MERCHANT = /hsbc|promo|offer|upgrade|^get |^enjoy |complimentary|access|^life/i

function branch(loc: any): Branch | undefined {
  const address = String(loc.address ?? '').replace(/\s+/g, ' ').trim()
  if (!address) return undefined
  const parts = address.split(',').map((s) => s.trim()).filter((s) => s && !/^philippines$/i.test(s))
  const city = parts.findLast((s) => /\bcity\b/i.test(s)) ?? parts.find((s) => /metro manila/i.test(s)) ?? parts.at(-1)
  const lat = Number(loc.latitude), lon = Number(loc.longitude)
  const geo = lat && lon ? { lat, lon } : {} // HSBC's own store coordinates beat geocoding
  return { name: parts[0], address, city: city?.replace(/^\d{4}\s+|\s+\d{4}$/g, ''), ...geo }
}

export function parse(json: any, now = new Date()): Promo[] {
  const today = isoDate(now)!
  return (json.data ?? [])
    .filter((o: any) => !o.hidden)
    .map((o: any): Promo | undefined => {
      const tags: string[] = o.tags ?? []
      const brand = String(o.brand ?? '').replace(/[​\s]+/g, ' ').trim()
      const name = String(o.name ?? '').replace(/[​\s]+/g, ' ').trim()
      const body = stripHtml(o.body)
      const signals = [...tags, ...(o.keywords ?? []), name, brand, body].join(' | ')
      if (!CREDIT.test(signals) || NOT_CREDIT.test(`${name} | ${brand}`)) return undefined
      const merchant = brand && brand.split(' ').length <= 8 && !NOT_MERCHANT.test(brand) ? brand : undefined
      // Premier Mastercard is the only HSBC card these offers name explicitly
      const premierOnly = tags.includes('Premier - Mastercard') && !tags.some((t) => /^(?:mastercard|visa|credit cards.*|live\+)$/i.test(t))
      const branches = (o.locations ?? []).map(branch).filter(Boolean) as Branch[]
      const image = o.images?.[0]?.desktop ?? o.thumbnail?.desktop
      return {
        id: `hsbc:${o.id}`,
        bank: 'HSBC',
        title: merchant && !name.toLowerCase().includes(merchant.toLowerCase()) ? `${merchant}: ${name}` : name || brand,
        merchant,
        discount: findDiscount(name),
        description: [body, stripHtml(o.terms)].filter(Boolean).join('\n\n').slice(0, 4000) || undefined,
        category: toCategory(...topics(tags), ...(o.keywords ?? []), name),
        cards: premierOnly ? ['HSBC Premier Mastercard'] : [],
        validFrom: isoDate(o.start_date),
        validTo: isoDate(o.end_date),
        url: `${BASE}/offers/${o.id}/${slugify(brand || name)}`,
        image,
        online: /\.com\b|\bwebsite\b|\bonline\b/i.test(brand) && !branches.length,
        branches,
      }
    })
    .filter((p: Promo | undefined): p is Promo => !!p && (!p.validTo || p.validTo >= today))
}

async function fetchAll(): Promise<Promo[]> {
  const out: Promo[] = []
  for (let page = 1; page && page < 50; ) {
    const json = await getJson(API(page))
    out.push(...parse(json))
    page = json.next_page && json.next_page > page ? json.next_page : 0
  }
  const seen = new Set<string>()
  return out.filter((p) => !seen.has(p.id) && seen.add(p.id))
}

export default { bank: 'HSBC', fetch: fetchAll } satisfies Source
