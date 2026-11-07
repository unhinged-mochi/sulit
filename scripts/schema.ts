// Shared shape every source adapter returns. One file on purpose: the whole pipeline is ~6 files.

export type Category = 'dining' | 'groceries' | 'shopping' | 'travel' | 'wellness' | 'services' | 'online' | 'other'

export interface Branch {
  name: string
  address?: string
  city?: string
  lat?: number
  lon?: number
  approx?: boolean // pinned to the city, not the storefront
}

export interface Promo {
  id: string // `${bank}:${source-native id}` — stable across runs
  bank: string // display name, e.g. "BPI"
  title: string
  merchant?: string // filled by the adapter when the source has it, else by extract.ts
  discount?: string // short headline like "20% off" / "₱500 off" / "0% for 12 mos"
  description?: string
  category: Category
  cards: string[] // specific eligible cards; empty = all credit cards of that bank
  validFrom?: string // ISO date (YYYY-MM-DD)
  validTo?: string
  url: string
  image?: string
  online?: boolean // redeemable online / no physical location
  branches: Branch[] // physical locations; geocode.ts fills lat/lon
}

export type Source = { bank: string; fetch: () => Promise<Promo[]> }

export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 sulit-bot (+https://github.com/unhinged-mochi/sulit)'

export async function get(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { 'user-agent': UA, accept: 'text/html,application/json;q=0.9,*/*;q=0.8', 'accept-language': 'en-PH,en;q=0.9', ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(45_000),
  })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res
}
export const getJson = async <T = any>(url: string, init?: RequestInit): Promise<T> => (await get(url, init)).json() as Promise<T>
export const getText = async (url: string, init?: RequestInit) => (await get(url, init)).text()

const CATEGORY_WORDS: [Category, RegExp][] = [
  ['dining', /dine|dining|restaurant|food|cafe|coffee|bakery|bar\b|\beat\b/i],
  ['groceries', /grocer|supermarket|market/i],
  ['travel', /travel|hotel|resort|flight|airline|leisure|stay/i],
  ['wellness', /health|wellness|beauty|spa|salon|fitness|clinic|medical/i],
  ['online', /online|e-?commerce|app\b|digital/i],
  ['shopping', /shop|retail|fashion|gadget|electronic|appliance|department|mall|lifestyle/i],
  ['services', /service|auto|gas|fuel|utilit|insurance|education|school/i],
]
/** Map a bank's free-form category label(s) to ours. Labels are tried in order (banks list the primary one first). */
export function toCategory(...labels: (string | undefined | null)[]): Category {
  for (const l of labels) {
    const hit = l && CATEGORY_WORDS.find(([, re]) => re.test(l))
    if (hit) return hit[0]
  }
  return 'other'
}

const MANILA = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' })
/** Calendar date as a Filipino reads it. Bare "YYYY-MM-DD" passes through; everything else is read in Manila time. */
export const isoDate = (d: string | number | Date | undefined | null): string | undefined => {
  if (d == null || d === '') return undefined
  if (typeof d === 'string' && /^\d{4}-\d\d-\d\d$/.test(d)) return d
  // "Jan 14, 2027" has no zone: Date parses it as local midnight, so pin it to +08:00
  const t = typeof d === 'string' && !/T\d|Z$|[+-]\d\d:?\d\d$/.test(d) ? new Date(`${d} 12:00 GMT+0800`) : new Date(d)
  return Number.isNaN(t.getTime()) ? undefined : MANILA.format(t)
}

export const stripHtml = (s: string | undefined | null) =>
  (s ?? '').replace(/<br\s*\/?>|<\/p>|<\/li>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/[ \t]+/g, ' ').replace(/\n\s*/g, '\n').trim()
