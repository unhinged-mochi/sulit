import * as cheerio from 'cheerio'
import { getText, isoDate, stripHtml, toCategory, type Branch, type Promo, type Source } from '../schema.ts'

// chinabank.ph is a Laravel Livewire site: each block carries its data as JSON in `wire:initial-data`.
const BASE = 'https://www.chinabank.ph'
const SEED = ['dine', 'shop', 'stay', 'travel'].map((c) => `${BASE}/credit-cards-promos-${c}`)

const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?'
const DATE = `${MONTH}\\s+\\d{1,2}(?:,?\\s*\\d{4})?`

/** "September 8 to November 30, 2026" / "until November 30, 2026" → ISO dates. The year is borrowed from the end date when the start omits it. */
export function parsePeriod(text: string): { validFrom?: string; validTo?: string } {
  const t = text.replace(/[\u200b\u00a0]/g, ' ').replace(/\s+,/g, ',')
  const range = t.match(new RegExp(`(${DATE})\\s*(?:to|until|through|thru|[-–—])\\s*((?:${MONTH}\\s+)?\\d{1,2},?\\s*\\d{4})`, 'i'))
  if (range) {
    const toYear = range[2].match(/\d{4}/)?.[0]
    let to = /^\d/.test(range[2]) ? `${range[1].match(new RegExp(MONTH, 'i'))![0]} ${range[2]}` : range[2]
    let from = /\d{4}/.test(range[1]) ? range[1] : `${range[1]}, ${toYear}`
    let validFrom = isoDate(from.replace(/\.(?=\s)/, ''))
    const validTo = isoDate(to.replace(/\.(?=\s)/, ''))
    // "December 1 to January 15, 2027": the start belongs to the previous year
    if (validFrom && validTo && validFrom > validTo && !/\d{4}/.test(range[1])) validFrom = `${Number(validFrom.slice(0, 4)) - 1}${validFrom.slice(4)}`
    if (validTo) return { validFrom, validTo }
  }
  const until = t.match(new RegExp(`(?:until|till|up to|on or before|valid through)\\s+(${MONTH}\\s+\\d{1,2},?\\s*\\d{4})`, 'i'))
  return until ? { validTo: isoDate(until[1].replace(/\.(?=\s)/, '')) } : {}
}

const DISCOUNT = /(?:up to\s+)?(?:\d+%\s*(?:off|cash\s?back|rebate|discount)|[₱P]\s?[\d,]+\s*(?:off|cash\s?back|rebate|discount)|0%\s*installment(?:\s+(?:for\s+)?up to \d+ months)?)/i
export const discountOf = (...texts: string[]) => texts.map((t) => t.match(DISCOUNT)?.[0]).find(Boolean)?.replace(/\s+/g, ' ')

/** Title "… at Merchant[ with your CBC Card]" → Merchant. Last " at " wins ("… at cash price at Beyond the Box"). */
export function merchantOf(title: string): string | undefined {
  const i = title.toLowerCase().lastIndexOf(' at ')
  if (i < 0) return undefined
  const m = title.slice(i + 4).replace(/\s+(?:with your|when you) .*$/i, '').replace(/[!.]+\s*$/, '').trim()
  return m && m.length < 80 && !/^\d|^cash price/i.test(m) ? m : undefined
}

function livewire($: cheerio.CheerioAPI, name: string): any {
  for (const el of $('[wire\\:initial-data]').toArray()) {
    const d = JSON.parse($(el).attr('wire:initial-data')!)
    if (d.fingerprint?.name === name) return d.serverMemo?.data?.componentData
  }
}

const label = (url: string) => url.replace(/.*credit-cards?-promos-/, '')

/** A category page: its promo cards plus links to the sibling categories. */
export function parse(html: string, pageUrl = SEED[0]): { promos: Promo[]; categories: string[] } {
  const $ = cheerio.load(html)
  const categories = [...new Set($('option[value*="-promos-"]').toArray().map((o) => $(o).attr('value')!).filter((u) => /\/credit-cards?-promos-[a-z-]+$/.test(u)))]
  const cat = label(pageUrl)
  const promos = ((livewire($, 'content.content-list') as any[]) ?? []).filter((c) => c.cta_button_url).map((c): Promo => {
    const url = new URL(c.cta_button_url, BASE).href
    const title = stripHtml(c.subtitle || c.title).replace(/\s+/g, ' ').trim()
    const body = stripHtml(c.body_text)
    return {
      id: `chinabank:${new URL(url).pathname.replace(/^\/|\/$/g, '')}`,
      bank: 'Chinabank',
      title,
      merchant: merchantOf(title),
      discount: discountOf(title, body),
      description: body.slice(0, 4000),
      category: toCategory(cat.replace(/-/g, ' '), title, body),
      cards: [],
      ...parsePeriod(body),
      url,
      image: c.image ? `${BASE}/view-file/${c.image}` : undefined,
      online: cat === 'ecom' && !/dine-in|in-store|branch/i.test(body),
      branches: [],
    }
  })
  return { promos, categories }
}

// Last comma segment, when it is short enough to be a city/municipality rather than a run-on street line.
const cityOf = (address: string) => {
  const c = address.split(',').at(-1)!.trim()
  return c.length <= 25 ? c : undefined
}

/** "SM Mall of Asia - 2F, South Entertainment Mall, Pasay City +63 977 738 8553" → branch. Only line-per-branch lists right after "availed at:". */
export function parseBranches(text: string): Branch[] {
  const out: Branch[] = []
  for (const at of text.matchAll(/avail(?:ed|able) at[^\n]*:\s*\n|branches:\s*\n/gi)) {
    for (const raw of text.slice(at.index! + at[0].length).split('\n')) {
      const entry = raw.replace(/[\u200b\u00a0]/g, ' ').trim().replace(/^(?:o|•|-|\d+\.)\s+/, '')
        .replace(/\s*(?:\+63|\(0\d\)|0\d{3})[\d\s()-]{6,}$/, '').trim()
      const [name, ...rest] = entry.split(/\s+[-–]\s+/)
      const address = rest.join(' - ').trim()
      if (!address.includes(',') || name.length > 60) break
      out.push({ name: name.trim(), address, city: cityOf(address) })
    }
    if (out.length) break
  }
  return out
}

/** Detail page: the article-body block holds the full mechanics (period, offer, branch list). */
export function parseDetail(html: string): { text: string; image?: string } {
  const $ = cheerio.load(html)
  const d = livewire($, 'content.article-body')
  if (!d) return { text: '' }
  const blocks = Object.keys(d).filter((k) => /^text_block/.test(k)).sort().map((k) => d[k]).filter(Boolean)
  const text = cheerio.load(blocks.join('\n').replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>|<\/tr>/gi, '$&\n')).root().text()
    .replace(/[\u200b]/g, '').replace(/[ \t\u00a0]+/g, ' ').replace(/\n\s*/g, '\n').trim()
  return { text, image: d.image_1 ? `${BASE}/view-file/${d.image_1}` : undefined }
}

async function fetchAll(): Promise<Promo[]> {
  const queue = [...SEED]
  const seen = new Set<string>()
  const promos = new Map<string, Promo>()
  for (let url; (url = queue.shift()); ) {
    if (seen.has(url)) continue
    seen.add(url)
    const { promos: list, categories } = parse(await getText(url), url)
    for (const c of categories) if (!seen.has(c)) queue.push(c)
    for (const p of list) if (!promos.has(p.id)) promos.set(p.id, p)
  }
  if (!promos.size) throw new Error('chinabank: no promos found on category pages')
  for (const p of promos.values()) {
    try {
      const { text } = parseDetail(await getText(p.url))
      if (!text) continue
      const period = parsePeriod(text.match(/Promo(?:tion)? Period[^\n]*\n?[^\n]*/i)?.[0] ?? '')
      p.validFrom = period.validFrom ?? p.validFrom
      p.validTo = period.validTo ?? p.validTo
      p.branches = parseBranches(text)
      p.description = `${p.description}\n\n${text}`.slice(0, 4000)
    } catch (e) {
      console.warn(`chinabank: detail ${p.url}: ${(e as Error).message}`)
    }
  }
  return [...promos.values()]
}

export default { bank: 'Chinabank', fetch: fetchAll } satisfies Source
