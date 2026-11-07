import { withPage } from '../browser.ts'
import { stripHtml, toCategory, type Promo, type Source } from '../schema.ts'
import { branchesFromHtml, cardsIn, discountOf, promoPeriod } from './unionbank.ts'

const BASE = 'https://www.securitybank.com'
const FALLBACK_CATEGORIES = ['dining', 'travel', 'shopping', 'online', 'wellness', 'installments', 'home', 'others', 'education', 'entertainment', 'welcome-gift', 'featured']
const MAX_DETAILS = 150

export interface Card { url: string; slug: string; category: string; name: string; summary: string; image?: string }

const abs = (u: string) => (u.startsWith('http') ? u : BASE + u)
const decode = (s: string) =>
  stripHtml(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&rsquo;/g, '’').replace(/&ndash;/g, '–').replace(/&quot;/g, '"')
    .trim()

/** Category slugs from the Divi link map on /promos/. */
export const parseCategories = (html: string) =>
  [...html.matchAll(/"url":"\\\/promos\\\/([\w-]+)\\?\/?"/g)].map((m) => m[1])

/** Promo cards on a category page (/promos/dining/ etc). */
export function parseListing(html: string, category: string): Card[] {
  return [...html.matchAll(/<div class="promo-category card[^"]*">([\s\S]*?)<div class="promo-category-action">/g)].flatMap(([, card]) => {
    const url = card.match(/href="([^"]+)"/)?.[1]
    const name = card.match(/<h4>([\s\S]*?)<\/h4>/)?.[1]
    if (!url || !name) return []
    return [{
      url: abs(url),
      slug: url.replace(/\/$/, '').split('/').pop()!,
      category,
      name: decode(name),
      summary: decode(card.match(/<div class="promo-category-content">[\s\S]*?<\/h4>([\s\S]*?)<\/div>/)?.[1] ?? ''),
      image: card.match(/(?:data-src|src)="(https?:[^"]+)"/)?.[1],
    }]
  })
}

/** One detail page (the <main> element + og:image) plus its listing card -> Promo, or null if not a live credit-card promo. */
export function parseDetail(html: string, card: Card, today = new Date().toISOString().slice(0, 10)): Promo | null {
  const content = html
    .replace(/<div class="consent-parent">[\s\S]*?<\/button>\s*<\/div>\s*<\/div>\s*<\/div>/, '')
    .replace(/<div class="jumbotron">[\s\S]*?<\/div>\s*<\/div>/, '')
    .replace(/<a [^>]*creditcardsapplication[\s\S]*?<\/a>/g, '')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')
    .replace(/<\/(?:td|tr|h\d|div)>/gi, '\n')
  const text = decode(content).replace(/\n{3,}/g, '\n\n')
  if (!/credit/i.test(`${card.summary}\n${text}`)) return null // debit-/deposit-only
  const period = promoPeriod(text)
  if (period.validTo && period.validTo < today) return null
  const eligibility = text.match(/open to[^.]*\./i)?.[0] ?? card.summary
  const label = card.category.replace(/-/g, ' ')
  // "/promos/installments/appliance-installment/" is a hub listing many stores, not one merchant;
  // featured-only / welcome-gift entries are card programmes (app download, spend-and-get), not merchants
  const programme = /^[a-z-]+-installment$/.test(card.slug) || card.category === 'featured' || card.category === 'welcome-gift' || /\bpromo$/i.test(card.name)
  const merchant = programme ? undefined : card.name.replace(/^Mastercard x\s+/i, '').replace(/\s+20\d\d$/, '')
  const summary = card.summary.replace(/\s+/g, ' ')
  const title = summary && summary.length <= 160 ? summary.replace(/\.$/, '') : card.name
  return {
    id: `securitybank:${card.slug}`,
    bank: 'Security Bank',
    title: merchant && !title.toLowerCase().includes(merchant.toLowerCase().split(' ')[0]) ? `${merchant}: ${title}` : title,
    merchant,
    discount: discountOf(card.summary) ?? discountOf(text.slice(0, 600)),
    description: text.slice(0, 4000),
    category: card.category === 'featured' ? toCategory(card.name) : toCategory(label === 'installments' || label === 'home' ? 'shopping' : label, summary, card.name),
    cards: cardsIn(eligibility, 'Security Bank').filter((c) => !/^Security Bank (?:Mastercard|Visa)$/.test(c)),
    ...period,
    url: card.url,
    image: html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ?? card.image,
    online: card.category === 'online' ? true : undefined,
    branches: merchant ? branchesFromHtml(html, merchant) : [],
  }
}

/** Pure entry point for tests: listing pages by category slug, detail pages by url. */
export function parseSecurityBank(listings: Record<string, string>, details: Record<string, string>, today?: string): Promo[] {
  const cards = dedupe(Object.entries(listings).flatMap(([cat, html]) => parseListing(html, cat)))
  return cards.flatMap((c) => (details[c.url] ? [parseDetail(details[c.url], c, today)] : [])).filter((p): p is Promo => !!p)
}

// a promo can sit in several categories; "featured" is the least informative label
function dedupe(cards: Card[]): Card[] {
  const by = new Map<string, Card>()
  for (const c of cards) if (!by.has(c.slug) || by.get(c.slug)!.category === 'featured') by.set(c.slug, c)
  return [...by.values()]
}

async function fetchSecurityBank(): Promise<Promo[]> {
  return withPage(async (page) => {
    // one real navigation clears the bot check; the rest are same-origin fetches from inside the page
    await page.goto(`${BASE}/promos/`, { waitUntil: 'domcontentloaded' })
    const cats = parseCategories(await page.content())
    // pages carry ~2 MB of inline JS; ship only <main> and og:image back to node
    const grab = (paths: string[]) =>
      page.evaluate(async (paths) => {
        const out: Record<string, string> = {}
        let i = 0
        // no named inner functions: tsx's keepNames would inject a __name() the page doesn't have
        await Promise.all(
          Array.from({ length: 4 }, async () => {
            while (i < paths.length) {
              const p = paths[i++]
              try {
                const r = await fetch(p)
                if (!r.ok) continue
                const h = await r.text()
                const og = h.match(/<meta property="og:image"[^>]*>/)?.[0] ?? ''
                out[p] = og + h.slice(h.indexOf('<main'), h.indexOf('</main>') + 7)
              } catch {}
            }
          }),
        )
        return out
      }, paths)
    const catSlugs = cats.length ? [...new Set(cats)] : FALLBACK_CATEGORIES
    const listingPages = await grab(catSlugs.map((c) => `/promos/${c}/`))
    const listings = Object.fromEntries(Object.entries(listingPages).map(([p, h]) => [p.split('/')[2], h]))
    const cards = dedupe(Object.entries(listings).flatMap(([cat, html]) => parseListing(html, cat))).slice(0, MAX_DETAILS)
    if (!cards.length) throw new Error('securitybank: no promo cards found')
    const detailPages = await grab(cards.map((c) => c.url.replace(BASE, '')))
    const details = Object.fromEntries(Object.entries(detailPages).map(([p, h]) => [abs(p), h]))
    return parseSecurityBank(listings, details)
  })
}

export default { bank: 'Security Bank', fetch: fetchSecurityBank } satisfies Source
