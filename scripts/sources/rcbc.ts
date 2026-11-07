import { load } from 'cheerio'
import { getText, isoDate, stripHtml, toCategory, type Branch, type Promo, type Source } from '../schema.ts'
import { findDiscount, parseDateRange } from './eastwest.ts'

const BASE = 'https://rcbccredit.com'
const LIST = `${BASE}/promos`
// List cards carry no category; each filter button is its own page at /promos/all/{value}
const CATEGORY_PAGE = (value: string) => `${LIST}/all/${encodeURIComponent(value)}`

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Category filter buttons on the list page: [value, label] in display order. */
export function parseCategories(html: string): [string, string][] {
  const $ = load(html)
  return $('div.section[toggle-id="filter-by-categories"] button[value-id]')
    .toArray()
    .map((b) => [$(b).attr('value') ?? '', clean($(b).text())] as [string, string])
    .filter(([v]) => v && v !== 'all')
}

/** "…, Legaspi Village, Makati City" → "Makati City"; "…, Panglao, Bohol, Philippines 5315" → "Bohol". */
export function cityOf(address: string): string | undefined {
  const parts = address
    .split(',')
    .map((s) => s.replace(/\b\d{4}\b/g, '').replace(/\bphilippines\b/i, '').trim())
    .filter(Boolean)
  if (parts.length < 2) return undefined
  return parts.findLast((s) => /\bcity\b/i.test(s)) ?? parts.filter((s) => !/^metro manila$/i.test(s)).at(-1)
}

export function parse(html: string): Promo[] {
  const $ = load(html)
  return $('.promolistdv')
    .toArray()
    .map((el): Promo | undefined => {
      const card = $(el)
      const a = card.find('.title a').first()
      const href = a.attr('href')
      const title = clean(a.text())
      if (!href || !title) return undefined
      const slug = href.replace(/\/$/, '').split('/').pop()!
      const desc = clean(card.find('.desc').text())
      const img = card.find('.promodvimage img').attr('src')
      return {
        id: `rcbc:${slug}`,
        bank: 'RCBC',
        title,
        discount: findDiscount(title) ?? findDiscount(desc),
        description: desc || undefined,
        category: toCategory(title),
        cards: [],
        url: new URL(href, BASE).href,
        image: img ? new URL(img, BASE).href : undefined,
        branches: [],
      }
    })
    .filter((p): p is Promo => !!p)
}

/** Detail page: dates (a commented-out "datehldr", else the mechanics text), full mechanics, pinned branch addresses. */
export function parseDetail(html: string): Pick<Promo, 'validFrom' | 'validTo' | 'description' | 'branches'> {
  const commented = html.match(/class="datehldr">([\s\S]*?)<\/div>/)?.[1]
  const $ = load(html)
  const body = $('.insidearthldr .insideimghldr').first()
  body.find('script, style, link').remove()
  // block elements → newlines so the description keeps its list structure
  body.find('p, li, tr, br, h1, h2, h3, h4').each((_, e) => void $(e).after('\n'))
  const text = body.text().replace(/[ \t ]+/g, ' ').replace(/\n\s*/g, '\n').trim()
  const period = text.match(/promo (?:period|runs)[^\n]*/i)?.[0]
  let dates = parseDateRange(clean(commented ?? ''))
  if (!dates.validTo && period) dates = parseDateRange(period)
  if (!dates.validTo) dates = parseDateRange(text)

  // Branch cells look like <td><b>Name</b><br><img src=".../PIN...png"> Street, City</td>
  const branches: Branch[] = []
  body.find('td, p, li').each((_, cell) => {
    const [before, after] = ($(cell).html() ?? '').split(/<img[^>]*src="[^"]*pin[^"]*"[^>]*>/i)
    if (after === undefined) return
    // the name is the line right above the pin (cells sometimes hold other copy before it)
    const name = stripHtml(before).split('\n').map(clean).filter(Boolean).at(-1)
    const address = stripHtml(after).split('\n').map(clean).find(Boolean)
    if (!name || !address || /^(stores?|branch(es)?|locations?|address)$/i.test(name) || branches.some((b) => b.address === address)) return
    branches.push({ name, address, city: cityOf(address) })
  })
  return { ...dates, description: text.slice(0, 4000) || undefined, branches }
}

async function fetchAll(now = new Date()): Promise<Promo[]> {
  const listHtml = await getText(LIST)
  const promos = parse(listHtml)
  const labels = new Map<string, string[]>()
  for (const [value, label] of parseCategories(listHtml)) {
    for (const p of parse(await getText(CATEGORY_PAGE(value)))) labels.set(p.id, [...(labels.get(p.id) ?? []), label])
  }
  const today = isoDate(now)!
  const out: Promo[] = []
  for (const p of promos) {
    try {
      Object.assign(p, parseDetail(await getText(p.url)))
    } catch (e) {
      console.warn(`rcbc: ${p.url}: ${(e as Error).message}`)
    }
    const cats = labels.get(p.id) ?? []
    p.category = toCategory(...cats, p.title)
    // "Online" is a filter of its own; only trust it when nothing else (but installment) was tagged
    p.online = cats.includes('Online') && cats.every((c) => /online|installment/i.test(c)) && !p.branches.length
    if (!p.validTo || p.validTo >= today) out.push(p)
  }
  const seen = new Set<string>()
  return out.filter((p) => !seen.has(p.id) && seen.add(p.id))
}

export default { bank: 'RCBC', fetch: () => fetchAll() } satisfies Source
