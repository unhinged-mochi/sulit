import { load } from 'cheerio'
import { getText, isoDate, toCategory, type Promo, type Source } from '../schema.ts'

const BASE = 'https://www.eastwestbanker.com'
// Drupal exposed filter: card type 155 = "Credit Cards" (debit/prepaid/loan/deposit promos are left out server-side)
const LIST = `${BASE}/promos?field_card_type_target_id=155`
// Pills that describe card type or area, not what the promo is about
const NOT_CATEGORY = /credit cards|debit cards|prepaid|exclusive|nationwide|metro manila|luzon|visayas|mindanao|overseas/i

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const M = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?'
// optional "(8PM)" after a day: "October 9 (8PM) to October 10, 2026"
const RANGE = new RegExp(`${M}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*\\([^)]{0,20}\\))?(?:,?\\s*(\\d{4}))?\\s*(?:-|–|—|to|until|till|through|thru)\\s*(?:${M}\\s+)?(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})`, 'i')
const UNTIL = new RegExp(`(?:until|till|up to|on or before|valid through)\\s+${M}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})`, 'i')
const ymd = (y: number, m: string, d: string) =>
  isoDate(`${y}-${String(MONTHS.indexOf(m.slice(0, 3).toLowerCase()) + 1).padStart(2, '0')}-${d.padStart(2, '0')}`)

/** "November 1 until December 31, 2026", "Nov 3 to 27, 2026", "October 26 - December 31, 2026", "Promo runs until Dec 31, 2026". */
export function parseDateRange(text: string): { validFrom?: string; validTo?: string } {
  const r = text.match(RANGE)
  if (r) {
    const [, m1, d1, y1, m2, d2, y2] = r
    const endMonth = m2 ?? m1
    const toYear = Number(y2)
    // "November 1 to January 15, 2027" — start year is implied, and wraps back across New Year
    const fromYear = y1 ? Number(y1) : MONTHS.indexOf(m1.slice(0, 3).toLowerCase()) > MONTHS.indexOf(endMonth.slice(0, 3).toLowerCase()) ? toYear - 1 : toYear
    return { validFrom: ymd(fromYear, m1, d1), validTo: ymd(toYear, endMonth, d2) }
  }
  const u = text.match(UNTIL)
  return u ? { validTo: ymd(Number(u[3]), u[1], u[2]) } : {}
}

/** First obvious headline offer in the text, e.g. "50% savings", "Php 300 off", "0% installment". */
export function findDiscount(text: string): string | undefined {
  const m =
    text.match(/(?:up to\s+)?\d{1,2}%\s*(?:off|savings|discount|cashback|rebate)/i) ??
    text.match(/(?:up to\s+)?(?:php|₱)\s?[\d,]+\s*(?:off|savings|discount|cashback|rebate)/i) ??
    text.match(/0%\s*instal+ment(?:\s+(?:for|up to)\s+\d+\s+months)?/i)
  return m?.[0].replace(/\s+/g, ' ')
}

export function parse(html: string, now = new Date()): Promo[] {
  const $ = load(html)
  const today = isoDate(now)!
  return $('.promo-card')
    .toArray()
    .map((el): Promo | undefined => {
      const card = $(el)
      const href = card.find('.card-content a').first().attr('href')
      const title = card.find('h3').first().text().replace(/\s+/g, ' ').trim()
      if (!href || !title) return undefined
      const slug = href.replace(/\/$/, '').split('/').pop()!
      const excerpt = card
        .find('.excerpt')
        .find('p, li')
        .toArray()
        .map((p) => $(p).text().replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n') || card.find('.excerpt').text().replace(/\s+/g, ' ').trim()
      // the date line is the bare <p> under the title; some cards only state it in the excerpt
      const dateLine = card.find('.card-content > p').first().text().trim()
      const dates = parseDateRange(dateLine)
      const { validFrom, validTo } = dates.validTo ? dates : parseDateRange(excerpt)
      const pills = card.find('.pill-category').toArray().map((p) => $(p).text().trim())
      const img = card.find('.card-img img').attr('src')
      return {
        id: `eastwest:${slug}`,
        bank: 'EastWest',
        title,
        discount: findDiscount(title) ?? findDiscount(excerpt),
        description: excerpt.slice(0, 4000) || undefined,
        category: toCategory(...pills.filter((p) => !NOT_CATEGORY.test(p)), title),
        cards: [],
        validFrom,
        validTo,
        url: new URL(href, BASE).href,
        image: img ? new URL(img, BASE).href : undefined,
        branches: [],
      }
    })
    .filter((p): p is Promo => !!p && (!p.validTo || p.validTo >= today))
}

/** Highest ?page=N in the Drupal pager (0-based). */
const lastPage = (html: string) => Math.max(0, ...[...html.matchAll(/[?&;]page=(\d+)/g)].map((m) => Number(m[1])))

/** Detail page text up to the "Other promos" rail; used only for cards whose list entry has no dates. */
export function parseDetailDates(html: string): { validFrom?: string; validTo?: string } {
  const $ = load(html)
  $('script, style, nav, header, footer').remove()
  const text = ($('main').text() || $('body').text()).replace(/\s+/g, ' ').split(/Other promos you may check/i)[0]
  const period = text.match(/promo (?:period|runs|is valid)[^.]*\d{4}/i)?.[0]
  const dates = period ? parseDateRange(period) : {}
  return dates.validTo ? dates : parseDateRange(text)
}

async function fetchAll(): Promise<Promo[]> {
  const first = await getText(LIST)
  const out = parse(first)
  const last = Math.min(lastPage(first), 60)
  for (let page = 1; page <= last; page++) {
    const html = await getText(`${LIST}&page=${page}`)
    if (!html.includes('promo-card')) break
    out.push(...parse(html))
  }
  const seen = new Set<string>()
  const unique = out.filter((p) => !seen.has(p.id) && seen.add(p.id))
  // ~20% of cards carry no date line (mostly installment programs); their mechanics usually state one
  for (const p of unique.filter((p) => !p.validTo)) {
    try {
      Object.assign(p, parseDetailDates(await getText(p.url)))
    } catch (e) {
      console.warn(`eastwest: ${p.url}: ${(e as Error).message}`)
    }
  }
  const today = isoDate(new Date())!
  return unique.filter((p) => !p.validTo || p.validTo >= today)
}

export default { bank: 'EastWest', fetch: fetchAll } satisfies Source
