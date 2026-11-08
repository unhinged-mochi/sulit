import type { Promo } from '../scripts/schema.ts'
// Pure helpers shared by the UI and its test.

export type Kind = 'off' | 'perk' | 'plan'
/**
 * "Get up to 20% off on dining" → { label: "20%", n: 20, upTo: true, kind: 'off' }. Null when there's no number worth a price tag.
 * `n` ranks tags: money off first, freebies next, 0% installment plans last (a payment plan, not a discount).
 */
export function shortDiscount(d: string | undefined | null): { label: string; n: number; upTo: boolean; kind: Kind; note?: string } | null {
  if (!d) return null
  const upTo = /up\s*to/i.test(d)
  const pct = d.match(/(\d{1,3})\s*%/)
  if (pct && +pct[1] > 0) return { label: `${pct[1]}%`, n: +pct[1], upTo, kind: 'off' }
  const peso = d.match(/(?:₱|php|\bp)\s?([\d,]{2,})/i)
  if (peso) {
    const n = +peso[1].replace(/,/g, '')
    return { label: `₱${n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : n}`, n: Math.min(n / 50, 60), upTo, kind: 'off' }
  }
  const bogo = d.match(/buy\s*(\d)\s*,?\s*(?:get|take)\s*(\d)/i)
  if (bogo) return { label: `B${bogo[1]}T${bogo[2]}`, n: 50, upTo: false, kind: 'off' }
  if (/\b(?:free|complimentary)\b/i.test(d)) return { label: 'Free', n: 8, upTo: false, kind: 'perk' }
  if (pct) {
    const months = d.match(/(\d{1,2})\s*(?:mos?\b|months?)/i)?.[1]
    return { label: '0%', n: 0.5, upTo: false, kind: 'plan', note: months ? `${months} mo.` : 'installment' }
  }
  return null
}

/** Whole days until the promo's last day ends in Manila. 0 = today is the last day. */
export function daysLeft(validTo: string | undefined, now = Date.now()): number | null {
  if (!validTo) return null
  return Math.floor((Date.parse(`${validTo}T23:59:59+08:00`) - now) / 864e5)
}

const NETWORK = /\b(Mastercard|Visa|JCB|American Express|UnionPay)\b/i
const network = (card: string) => card.match(NETWORK)?.[1].toLowerCase()
/** "BDO Mastercard", "Any Visa card": a network, not a product. Any held card on that network qualifies. */
export const networkOnly = (card: string, bank: string) => new RegExp(`^(?:${bank}|Any) (?:${NETWORK.source.slice(3, -3)})(?: card)?$`, 'i').test(card)
/** Does a promo take any of these cards? No cards held = any card of the bank; no cards listed = every card of the bank. */
export const takes = (p: Promo, held: string[] = []) =>
  !held.length || !p.cards.length || p.cards.some((c) => held.includes(c) || (networkOnly(c, p.bank) && held.some((h) => network(h) === network(c))))

/** Added in the last week of syncs: a daily visitor sees today's additions, a weekly one still catches up. */
export const NEW_DAYS = 7
export function isNew(p: Promo, now = Date.now()): boolean {
  if (!p.firstSeen) return false
  return (now - Date.parse(`${p.firstSeen}T00:00:00+08:00`)) / 864e5 < NEW_DAYS
}

/**
 * The "min. discount" slider. `min` is a percent (0 = slider off).
 * shortDiscount(p.discount) gives { kind, n, label }: kind 'off' with a % label has n = that percent,
 * but ₱ amounts (n is a made-up rank), B1T1 (n = 50), 'perk' (Free), 'plan' (0% installment) and null (no number) don't.
 */
export function meetsMin(p: Promo, min: number): boolean {
  if (!min) return true
  // TODO(you): which promos survive a "20%+" filter? See the notes in the chat.
  return true
}

const DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
// whole day words only: "Monthly" and "Saturation" are not days
const DAY_RE = '(?:sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs?(?:day)?)?|fri(?:day)?|sat(?:urday)?)s?\\b\\.?'
const dayIdx = (w: string) => DAY.indexOf(w.slice(0, 3).toLowerCase())
/**
 * Which weekdays a promo runs (0 = Sunday), read from its prose; undefined = no restriction stated.
 * Only phrases that sound like a rule count ("valid every Saturday", "Mondays to Fridays", "weekends only"),
 * so store hours ("Sun to Thurs | 11AM to 1AM") don't turn into restrictions.
 */
export function validDays(text: string): number[] | undefined {
  const t = text.replace(/\s+/g, ' ')
  const days = new Set<number>()
  // a rule-ish lead-in, then a run of day names joined by commas, "and", "&", "to", "-", "/"
  const RUN = new RegExp(`\\b(?:valid|available|only|every|on|from|exclusive)\\b[^.;|\\n]{0,20}?\\b(${DAY_RE}(?:(?:\\s*(?:,|and|&|to|thru|through|-|–|/)\\s*)+${DAY_RE})*)`, 'gi')
  for (const m of t.matchAll(RUN)) {
    const after = t.slice(m.index! + m[0].length, m.index! + m[0].length + 18)
    if (/^\s*[|:(]?\s*\d{1,2}(?::\d\d)?\s*(?:am|pm|nn|noon)/i.test(after)) continue // opening hours, not a rule
    const parts = [...m[1].matchAll(new RegExp(`${DAY_RE}|to|thru|through|-|–`, 'gi'))].map((x) => x[0].toLowerCase())
    for (let i = 0; i < parts.length; i++) {
      const d = dayIdx(parts[i])
      if (d < 0) continue
      const range = /^(to|thru|through|-|–)$/.test(parts[i + 1] ?? '') && dayIdx(parts[i + 2] ?? '') >= 0
      if (!range) { days.add(d); continue }
      for (let k = d, end = dayIdx(parts[i + 2]); ; k = (k + 1) % 7) { days.add(k); if (k === end) break }
      i += 2
    }
  }
  if (/\bweekdays?\b(?!\s*(?:and|&)\s*weekends?)/i.test(t) && /\b(?:valid|only|on|every|during)\s+(?:\w+\s+)?weekdays?\b/i.test(t)) [1, 2, 3, 4, 5].forEach((d) => days.add(d))
  if (/(?<!closed\s)\b(?:valid|only|on|every|during)\s+(?:\w+\s+)?weekends?\b|\bweekends?\s+only\b/i.test(t)) [0, 6].forEach((d) => days.add(d))
  return days.size && days.size < 7 ? [...days].sort((a, b) => a - b) : undefined
}

/** Can this promo be used on that Manila calendar day (YYYY-MM-DD)? */
export function validOn(p: Promo, date: string): boolean {
  if ((p.validFrom && date < p.validFrom) || (p.validTo && date > p.validTo)) return false
  return !p.days || p.days.includes(new Date(`${date}T12:00:00+08:00`).getUTCDay())
}

/** "Mon–Fri", "Sat & Sun", "Mon, Wed, Fri" */
export function daysLabel(days: number[]): string {
  const N = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const run = days.length > 2 && days.every((d, i) => !i || d === days[i - 1] + 1)
  if (run) return `${N[days[0]]}–${N[days.at(-1)!]}`
  return days.length === 2 ? `${N[days[0]]} & ${N[days[1]]}` : days.map((d) => N[d]).join(', ')
}
