import { withPage } from '../browser.ts'
import { stripHtml, toCategory, type Branch, type Promo, type Source } from '../schema.ts'

const PAGE = 'https://www.unionbankph.com/cards/credit-card/discounts-and-promos'

// ---- free-text helpers, shared with the other browser adapters (securitybank, pnb) ----

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MON = String.raw`(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?`
const DAY = String.raw`(\d{1,2})(?:st|nd|rd|th)?`
const YEAR = String.raw`(?:,?\s*(20\d\d))`
// "Sep. 10" / "10 September" with optional year
const DATE = String.raw`(?:${MON}\s+${DAY}${YEAR}?|${DAY}\s+${MON}${YEAR}?)`
const SEP = String.raw`(?:\s*\([^)]{0,25}\))?,?\s*(?:to|until|till|through|thru|-|–|—)\s*`
const RANGE = new RegExp(`(?:${DATE})${SEP}(?:${DATE})`, 'gi')
const DAY_SPAN = new RegExp(String.raw`${MON}\s+${DAY}\s*(?:-|–|to)\s*${DAY}${YEAR}`, 'gi') // "November 7-9, 2026"
const UNTIL = new RegExp(String.raw`(?:until|till|up to|on or before|through|valid thru|ends? on)\s+(?:${DATE})`, 'gi')
const EXTENDED = new RegExp(String.raw`extended\s+(?:until|till|to|up to)\s+(?:${DATE})`, 'i')

type Ymd = { m: number; d: number; y?: number }
const month = (mon: string) => MONTHS.indexOf(mon.slice(0, 3).toLowerCase()) + 1
const ymd = (g: (string | undefined)[]): Ymd | undefined => {
  // g = [mon, day, year, day, mon, year] from one DATE group
  const [mon, day, year] = g[0] ? [g[0], g[1], g[2]] : [g[4], g[3], g[5]]
  if (!mon || !day) return
  return { m: month(mon), d: +day, y: year ? +year : undefined }
}
const fmt = ({ y, m, d }: Ymd) => (y && m && d <= 31 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : undefined)

type Period = { validFrom?: string; validTo?: string; at: number }
function periods(t: string): Period[] {
  const out: Period[] = []
  for (const m of t.matchAll(RANGE)) {
    const from = ymd(m.slice(1, 7))
    const to = ymd(m.slice(7, 13))
    if (!from || !to?.y) continue
    from.y ??= from.m > to.m ? to.y - 1 : to.y
    out.push({ validFrom: fmt(from), validTo: fmt(to), at: m.index })
  }
  for (const m of t.matchAll(DAY_SPAN)) out.push({ validFrom: fmt({ m: month(m[1]), d: +m[2], y: +m[4] }), validTo: fmt({ m: month(m[1]), d: +m[3], y: +m[4] }), at: m.index })
  return out.filter((p) => p.validTo && (!p.validFrom || p.validFrom <= p.validTo))
}

/** Promo period in free text: "from Sep. 10 to Nov. 10, 2026", "valid until December 31, 2026", "7 Nov 2026 – 12 Dec 2026". */
export function promoPeriod(text: string): { validFrom?: string; validTo?: string } {
  const anchor = text.search(/promo(?:tion)?\s+period|validity|will run|valid (?:from|until)|promo runs/i)
  for (const t of anchor > 0 ? [text.slice(anchor), text] : [text]) {
    const ranges = periods(t)
    const until = [...t.matchAll(UNTIL)].map((m) => ({ validTo: fmt(ymd(m.slice(1, 7)) ?? { m: 0, d: 0 }), at: m.index })).filter((p) => p.validTo)[0]
    // "valid until Oct 31, 2027" in the blurb + "Nov 1, 2026 to Oct 31, 2027" in the T&C: keep the full range
    let best: { validFrom?: string; validTo?: string } | undefined = ranges.find((r) => r.validTo === until?.validTo) ?? (until && (!ranges[0] || until.at < ranges[0].at) ? until : ranges[0])
    if (!best) continue
    const ext = t.match(EXTENDED)
    const extTo = ext && fmt(ymd(ext.slice(1, 7)) ?? { m: 0, d: 0 })
    if (extTo && extTo > (best.validTo ?? '')) best = { ...best, validTo: extTo }
    return { validFrom: best.validFrom, validTo: best.validTo }
  }
  return {}
}

/** Headline discount from a title, e.g. "up to 50% off", "₱300 off", "0% installment up to 24 months", "buy 1 get 1". */
export function discountOf(text: string): string | undefined {
  const m = text.match(
    /(?:up to\s+)?(?:\d+%|(?:₱|PHP|Php|P)\s?[\d,]+|USD\s?[\d,]+)\s*(?:off|cash\s?back|discount|rebate)|0% (?:interest|installment)(?:\s+(?:for|up to)\s+(?:\d+\s*(?:or|,|and)\s*)*\d+\s*months)?|buy\s*(?:1|one)\s*,?\s*(?:get|take)\s*(?:1|one)/i,
  )
  // "FREE sweets" / "a free bottle" but not "Duty Free stores"
  return (m?.[0] ?? text.match(/\b(?:FREE|free)\s+[a-z][\w ]{2,30}?(?=\s+(?:at|with|when|from|for)\b)/)?.[0])?.replace(/\s+/g, ' ').trim()
}

const CITIES = ['Quezon City', 'Makati', 'Taguig', 'Pasig', 'Mandaluyong', 'San Juan', 'Pasay', 'Parañaque', 'Paranaque', 'Muntinlupa', 'Las Piñas', 'Las Pinas', 'Marikina', 'Caloocan', 'Valenzuela', 'Malabon', 'Navotas', 'Manila', 'Cebu', 'Mandaue', 'Lapu-Lapu', 'Davao', 'Iloilo', 'Bacolod', 'Baguio', 'Cagayan de Oro', 'Tagaytay', 'Angeles', 'Clark', 'Santa Rosa', 'Alabang', 'Antipolo', 'Boracay', 'Palawan', 'Puerto Princesa', 'Batangas', 'Subic', 'Dumaguete', 'General Santos', 'Zamboanga']
/** City named in an address, if any (geocode.ts falls back to it). */
export const cityOf = (address: string) => CITIES.find((c) => new RegExp(`\\b${c}\\b`, 'i').test(address))?.replace(/^(Paranaque|Las Pinas)$/, (c) => (c === 'Paranaque' ? 'Parañaque' : 'Las Piñas'))

const cellText = (h: string) => stripHtml(h).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim()
const looksLikeAddress = (a: string) => a.length > 8 && !a.includes('@') && /,|\d/.test(a)
/**
 * Branches from address tables in T&C HTML. Two layouts:
 *   label row  — | Address | 1 Raffles Drive, Makati City |  (name = merchant; " / " separates several)
 *   column     — | Properties | Address |  then one row per branch
 * plus plain "Address: …" lines.
 */
export function branchesFromHtml(html: string, merchant: string | undefined): Branch[] {
  const out: Branch[] = []
  const add = (name: string | undefined, address: string) => {
    if (name && looksLikeAddress(address) && !out.some((b) => b.address === address)) out.push({ name, address, city: cityOf(address) })
  }
  for (const [table] of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(([r]) => [...r.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => cellText(c[1])))
    for (let r = 0; r < rows.length; r++) {
      const col = rows[r].findIndex((c) => /^(?:branch |store |full )?address(?:es)?:?$/i.test(c))
      if (col < 0) continue
      if (col === 0 && rows[r].length === 2) {
        for (const a of rows[r][1].split(/\s+\/\s+|;\s*/)) add(merchant, a.trim())
      } else {
        const nameCol = col === 0 ? 1 : 0
        for (const row of rows.slice(r + 1)) if (row.length === rows[r].length) add(row[nameCol] || merchant, row[col])
        break
      }
    }
  }
  for (const m of stripHtml(html).matchAll(/^Address:\s*([^\n]+)$/gim)) add(merchant, m[1].trim())
  return out
}

/** Specific cards named in text, e.g. "UnionBank Lazada Credit Card", "PNB-PAL Mabuhay Miles World Elite Mastercard". Generic "<Bank> Credit Card" is dropped. */
export function cardsIn(text: string, prefix: string): string[] {
  const re = new RegExp(String.raw`\b${prefix}(?:[ -](?!(?:Credit|Debit|Card|Cards|and|or|with)\b)[A-Z0-9][\w'’-]*)*\s(?:Mastercard|Visa|JCB|American Express|Credit Card)(?:\s+Credit Card)?`, 'g')
  const generic = new RegExp(`^${prefix} Credit Card$`, 'i')
  const norm = (c: string) => c.replace(/\s+/g, ' ').trim().replace(/ (Mastercard|Visa|JCB|American Express) Credit Card$/, ' $1')
  return [...new Set((text.match(re) ?? []).map(norm).filter((c) => !generic.test(c)))]
}

/** Merchant from a headline: the last capitalised "at X" ("20% OFF on all orders at House of Zhou"), else "on/from X" ("P300 OFF on GrabFood"). */
export function merchantOf(title: string, bank: string): string | undefined {
  const re = (prep: string) => new RegExp(String.raw`\b(?:${prep})\s+(?:the\s+)?(?!(?:your|participating|select|all)\b)(?!${bank}\b)([A-Z0-9][^!,:|]*?)(?=\s+(?:with|using|when|in|for|via|valid|and get|until|from|on|up to)\b|[!,:|(]|(?<!\bNo)\.(?:\s|$)|\s[-–]\s|$)`, 'g')
  const pick = (prep: string) => [...title.matchAll(re(prep))].map((m) => m[1]).at(prep === 'at' ? -1 : 0)
  const m = pick('at') ?? pick('on|from|x')
  // trim trailing lowercase words: "Lazada purchases" -> "Lazada", "Shilla Duty Free stores" -> "Shilla Duty Free"
  const name = m?.replace(/(\s+[a-z][\w'-]*)+$/, '').trim()
  return name && !/%|^\d+(?:[- ]?(?:course|months?|pax|days?))\b/i.test(name) ? name : undefined
}

// ---- UnionBank ----

const INVISIBLE = new RegExp('[\\u200b\\u2028\\u2029]', 'g')
const ONLINE = /\b(?:online|shopee|lazada|agoda|trip\.com|klook|grabfood|foodpanda|e-?commerce)\b/i

/** `data` is the JSON from POST /api/promo/credit: [{ title: category, promos: [...] }]. */
export function parseUnionBank(data: any[], today = new Date().toISOString().slice(0, 10)): Promo[] {
  const seen = new Set<string>()
  const out: Promo[] = []
  for (const cat of data) {
    for (const p of cat.promos ?? []) {
      if (seen.has(p.id) || (p.promo_for?.length && !p.promo_for.includes('Credit Card'))) continue
      seen.add(p.id)
      const body = stripHtml((p.body ?? '').replace(/<style[\s\S]*?<\/style>|<link[^>]*>/gi, '').replace(/<\/(?:td|tr|h\d|div)>/gi, '\n'))
      const title = stripHtml(p.title).replace(INVISIBLE, '').trim()
      const head = stripHtml(p.header_title ?? '').replace(INVISIBLE, '').trim()
      // T&C body first: the blurb sometimes disagrees with it
      const bodyPeriod = promoPeriod(body)
      const period = bodyPeriod.validTo ? bodyPeriod : promoPeriod(head)
      if (period.validTo && period.validTo < today) continue
      const merchant = merchantOf(title, 'UnionBank')
      out.push({
        id: `unionbank:${p.id}`,
        bank: 'UnionBank',
        title,
        merchant,
        discount: discountOf(title) ?? discountOf(head),
        description: [head !== title ? head : '', body].filter(Boolean).join('\n\n').slice(0, 4000),
        category: toCategory(cat.title === 'PayEasy Offers' || cat.title === 'Essentials' ? 'shopping' : cat.title, title),
        cards: cardsIn(`${title} ${head}`, 'UnionBank'),
        ...period,
        url: `${PAGE}?id=${p.id}`,
        image: p.header_image || p.thumbnail_image || undefined,
        online: ONLINE.test(title) && !/\bstores?\b|outlets?\b/i.test(title) ? true : undefined,
        branches: branchesFromHtml(p.body ?? '', merchant),
      })
    }
  }
  return out
}

async function fetchUnionBank(): Promise<Promo[]> {
  const data = await withPage(async (page) => {
    await page.goto(PAGE, { waitUntil: 'domcontentloaded' })
    return page.evaluate(async () => {
      const r = await fetch('/api/promo/credit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      if (!r.ok) throw new Error(`unionbank: /api/promo/credit ${r.status}`)
      return r.json()
    })
  })
  if (!Array.isArray(data)) throw new Error('unionbank: unexpected /api/promo/credit shape')
  return parseUnionBank(data)
}

export default { bank: 'UnionBank', fetch: fetchUnionBank } satisfies Source
