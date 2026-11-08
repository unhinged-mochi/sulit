import type { Promo } from '../scripts/schema.ts'
// Pure helpers shared by the UI and its test.

/** "Get up to 20% off on dining" → { label: "20%", n: 20, upTo: true }. Null when there's no number worth a price tag. */
export function shortDiscount(d: string | undefined | null): { label: string; n: number; upTo: boolean } | null {
  if (!d) return null
  const upTo = /up\s*to/i.test(d)
  const pct = d.match(/(\d{1,3})\s*%/)
  // "0% installment" is a real perk but not a discount; rank it below any money off
  if (pct && +pct[1] > 0) return { label: `${pct[1]}%`, n: +pct[1], upTo }
  const peso = d.match(/(?:₱|php|\bp)\s?([\d,]{2,})/i)
  if (peso) {
    const n = +peso[1].replace(/,/g, '')
    return { label: `₱${n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : n}`, n: Math.min(n / 50, 60), upTo }
  }
  const bogo = d.match(/buy\s*(\d)\s*,?\s*(?:get|take)\s*(\d)/i)
  if (bogo) return { label: `B${bogo[1]}T${bogo[2]}`, n: 50, upTo: false }
  if (pct) return { label: '0%', n: 1, upTo: false }
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
