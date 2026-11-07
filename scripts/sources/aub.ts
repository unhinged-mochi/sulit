import * as cheerio from 'cheerio'
import { inflateSync, constants } from 'node:zlib'
import { get, getText, isoDate, toCategory, type Branch, type Promo, type Source } from '../schema.ts'

// AUB's credit-card site is a Java webapp behind Imperva. The list page links each promo's mechanics as a PDF
// (opened through `winpopup('/creditcards/resources/promos_new/<Folder>/<file>.pdf')`), so the PDF is the detail page.
const BASE = 'https://online.aub.ph'
const LIST = `${BASE}/creditcards/promos`

const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?'
const DATE = `${MONTH}\\s+\\d{1,2}(?:,?\\s*\\d{4})?`

/** "September 8 to November 30, 2026" / "Valid until December 31, 2023" → ISO dates. */
export function parsePeriod(text: string): { validFrom?: string; validTo?: string } {
  const t = text.replace(/[\u200b\u00a0]/g, ' ').replace(/\s+,/g, ',')
  const clean = (s: string) => s.replace(/\.(?=\s)/, '')
  const range = t.match(new RegExp(`(${DATE})\\s*(?:to|until|through|thru|[-–—])\\s*((?:${MONTH}\\s+)?\\d{1,2},?\\s*\\d{4})`, 'i'))
  if (range) {
    const toYear = range[2].match(/\d{4}/)?.[0]
    const to = /^\d/.test(range[2]) ? `${range[1].match(new RegExp(MONTH, 'i'))![0]} ${range[2]}` : range[2]
    let validFrom = isoDate(clean(/\d{4}/.test(range[1]) ? range[1] : `${range[1]}, ${toYear}`))
    const validTo = isoDate(clean(to))
    if (validFrom && validTo && validFrom > validTo && !/\d{4}/.test(range[1])) validFrom = `${Number(validFrom.slice(0, 4)) - 1}${validFrom.slice(4)}`
    if (validTo) return { validFrom, validTo }
  }
  const until = t.match(new RegExp(`(?:until|till|up to|on or before|valid through)\\s+(${MONTH}\\s+\\d{1,2},?\\s*\\d{4})`, 'i'))
  return until ? { validTo: isoDate(clean(until[1])) } : {}
}

export interface ListItem { title: string; pdf: string; folder: string; image?: string }

/** List page → one item per promo with a mechanics PDF. Generic network perks (Mastercard Travel Rewards etc.) link off-site and are skipped. */
export function parse(html: string): ListItem[] {
  const $ = cheerio.load(html)
  const out: ListItem[] = []
  $('.thumbnail-default2Home').each((_, el) => {
    const card = $(el).parent()
    const pdf = $(el).find('a[onclick*="winpopup"]').attr('onclick')?.match(/winpopup\('([^']+\.pdf)'/i)?.[1]
    if (!pdf) return
    const img = $(el).find('img').attr('src')?.replace(/;jsessionid=[^?#]*/, '')
    out.push({
      title: card.find('.icon-text h5').text().replace(/\s+/g, ' ').trim(),
      pdf: encodeURI(new URL(pdf, BASE).href.replace(/%20/g, ' ')),
      folder: pdf.split('/').at(-2)!,
      image: img ? encodeURI(new URL(img, BASE).href.replace(/%20/g, ' ')) : undefined,
    })
  })
  return out
}

// ---- minimal PDF text extraction (Word-exported mechanics sheets: Flate streams, WinAnsi + Identity-H/ToUnicode fonts) ----

const WIN_ANSI: Record<number, string> = { 0x80: '€', 0x85: '…', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x99: '™' }

type Cmap = { map: Map<number, string>; bytes: number }

function parseCmap(s: string): Cmap {
  const map = new Map<number, string>()
  const hex = (h: string) => parseInt(h, 16)
  const uni = (h: string) => String.fromCharCode(...(h.match(/.{4}/g) ?? []).map(hex))
  let bytes = 1
  for (const [, body] of s.matchAll(/begincodespacerange([\s\S]*?)endcodespacerange/g)) {
    const m = body.match(/<([0-9a-f]+)>/i)
    if (m) bytes = m[1].length / 2
  }
  for (const [, body] of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const [, src, dst] of body.matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]*)>/gi)) map.set(hex(src), uni(dst))
  for (const [, body] of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for (const [, lo, hi, rest] of body.matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*(<[0-9a-f]*>|\[[^\]]*\])/gi)) {
      const dsts = rest.startsWith('[') ? [...rest.matchAll(/<([0-9a-f]*)>/gi)].map((m) => uni(m[1])) : null
      const base = dsts ? 0 : hex(rest.slice(1, -1))
      for (let c = hex(lo), i = 0; c <= hex(hi); c++, i++) map.set(c, dsts ? (dsts[i] ?? '') : String.fromCharCode(base + i))
    }
  return { map, bytes }
}

export function pdfText(buf: Uint8Array): string {
  const raw = Buffer.from(buf).toString('latin1')
  const dicts = new Map<number, string>()
  const streams = new Map<number, string>()
  const inflate = (s: string) => inflateSync(Buffer.from(s, 'latin1'), { finishFlush: constants.Z_SYNC_FLUSH }).toString('latin1')

  for (const m of raw.matchAll(/(\d+)\s+\d+\s+obj\b([\s\S]*?)\bendobj/g)) {
    const n = Number(m[1])
    const body = m[2]
    const si = body.search(/\bstream\r?\n/)
    if (si < 0) { dicts.set(n, body); continue }
    const dict = body.slice(0, si)
    dicts.set(n, dict)
    let data = body.slice(body.indexOf('\n', si) + 1, body.lastIndexOf('endstream'))
    try {
      if (/\/FlateDecode/.test(dict)) data = inflate(data)
      else if (/\/Filter/.test(dict)) continue
    } catch { continue }
    streams.set(n, data)
    // compressed object streams: "objnum offset objnum offset …" then the objects
    if (/\/Type\s*\/ObjStm/.test(dict)) {
      const first = Number(dict.match(/\/First\s+(\d+)/)?.[1])
      const nums = data.slice(0, first).trim().split(/\s+/).map(Number)
      for (let i = 0; i < nums.length; i += 2)
        dicts.set(nums[i], data.slice(first + nums[i + 1], i + 3 < nums.length ? first + nums[i + 3] : undefined))
    }
  }

  const ref = (s: string | undefined) => (s ? Number(s.match(/(\d+)\s+\d+\s+R/)?.[1]) : NaN)
  const fontCmap = new Map<number, Cmap>()
  for (const [n, d] of dicts) {
    const tu = d.match(/\/ToUnicode\s+(\d+\s+\d+\s+R)/)?.[1]
    const s = tu && streams.get(ref(tu))
    if (s) fontCmap.set(n, parseCmap(s))
  }

  // pages in reading order: walk /Kids from the root /Pages node
  const pages: number[] = []
  const walk = (n: number, depth = 0) => {
    const d = dicts.get(n) ?? ''
    if (depth > 20) return
    if (/\/Type\s*\/Page\b/.test(d)) pages.push(n)
    else for (const k of d.match(/\/Kids\s*\[([^\]]*)\]/)?.[1].matchAll(/(\d+)\s+\d+\s+R/g) ?? []) walk(Number(k[1]), depth + 1)
  }
  const root = [...dicts].find(([, d]) => /\/Type\s*\/Pages\b/.test(d) && !/\/Parent/.test(d))
  if (root) walk(root[0])

  const lines: string[] = []
  for (const pg of pages) {
    const d = dicts.get(pg)!
    // font resource name → cmap (inline /Font << … >> or an indirect font dict, possibly via /Resources N 0 R)
    let res = d.match(/\/Resources\s*(<<[\s\S]*>>)/)?.[1] ?? dicts.get(ref(d.match(/\/Resources\s+(\d+\s+\d+\s+R)/)?.[1])) ?? ''
    let fontDict = res.match(/\/Font\s*<<([\s\S]*?)>>/)?.[1] ?? dicts.get(ref(res.match(/\/Font\s+(\d+\s+\d+\s+R)/)?.[1])) ?? ''
    const fonts = new Map<string, Cmap | undefined>()
    for (const [, name, num] of fontDict.matchAll(/\/([^\s/<>\[\]()]+)\s+(\d+)\s+\d+\s+R/g)) fonts.set(name, fontCmap.get(Number(num)))
    const contents = d.match(/\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/)?.[1] ?? ''
    const content = [...contents.matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => streams.get(Number(m[1])) ?? '').join('\n')
    lines.push(...contentText(content, fonts))
  }
  return lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
}

function contentText(s: string, fonts: Map<string, Cmap | undefined>): string[] {
  const lines: string[] = ['']
  const emit = (t: string) => (lines[lines.length - 1] += t)
  const newline = () => lines[lines.length - 1] && lines.push('')
  let cmap: Cmap | undefined
  let y: number | undefined
  const decode = (bytes: number[]) => {
    if (!cmap) return bytes.map((b) => WIN_ANSI[b] ?? String.fromCharCode(b)).join('')
    let out = ''
    for (let i = 0; i < bytes.length; i += cmap.bytes) {
      let code = 0
      for (let j = 0; j < cmap.bytes; j++) code = (code << 8) | (bytes[i + j] ?? 0)
      out += cmap.map.get(code) ?? ''
    }
    return out
  }
  const ops: any[] = []
  let i = 0
  const n = s.length
  const literal = (): number[] => {
    const out: number[] = []
    let depth = 1
    i++
    while (i < n) {
      const c = s[i++]
      if (c === '\\') {
        const e = s[i++]
        const esc: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 }
        if (e in esc) out.push(esc[e])
        else if (/[0-7]/.test(e)) {
          let o = e
          while (o.length < 3 && /[0-7]/.test(s[i])) o += s[i++]
          out.push(parseInt(o, 8) & 255)
        } else if (e === '\r') { if (s[i] === '\n') i++ } else if (e !== '\n') out.push(e.charCodeAt(0))
      } else if (c === '(') { depth++; out.push(40) } else if (c === ')') { if (--depth === 0) break; out.push(41) } else out.push(c.charCodeAt(0))
    }
    return out
  }
  const hexstr = (): number[] => {
    const end = s.indexOf('>', i)
    const h = s.slice(i + 1, end).replace(/\s+/g, '')
    i = end + 1
    const out: number[] = []
    for (let k = 0; k < h.length; k += 2) out.push(parseInt((h.slice(k, k + 2) + '0').slice(0, 2), 16))
    return out
  }
  const stack: any[][] = [ops]
  while (i < n) {
    const c = s[i]
    if (/\s/.test(c)) { i++; continue }
    const top = stack[stack.length - 1]
    if (c === '%') { while (i < n && s[i] !== '\n' && s[i] !== '\r') i++; continue }
    if (c === '(') { top.push({ str: literal() }); continue }
    if (c === '<' && s[i + 1] !== '<') { top.push({ str: hexstr() }); continue }
    if (c === '<' || c === '>') { i += 2; continue } // dict delimiters: contents are ignored
    if (c === '[') { const a: any[] = []; top.push(a); stack.push(a); i++; continue }
    if (c === ']') { if (stack.length > 1) stack.pop(); i++; continue }
    const m = s.slice(i, i + 64).match(/^(\/[^\s/<>\[\]()%{}]*|[-+]?(?:\d+\.?\d*|\.\d+)|[^\s/<>\[\]()%{}]+)/)
    if (!m) { i++; continue }
    i += m[0].length
    const tok = m[0]
    if (tok[0] === '/') { top.push({ name: tok.slice(1) }); continue }
    if (/^[-+]?[\d.]/.test(tok)) { top.push(Number(tok)); continue }
    if (stack.length > 1) continue
    const args = ops.splice(0)
    switch (tok) {
      case 'Tf': cmap = fonts.get(args[0]?.name); break
      case 'Tj': case "'": case '"': if (tok !== 'Tj') newline(); emit(decode(args.at(-1)?.str ?? [])); break
      case 'TJ':
        for (const a of args[0] ?? []) {
          if (typeof a === 'number') { if (a < -200) emit(' ') } else if (a.str) emit(decode(a.str))
        }
        break
      case 'Td': case 'TD': if (args[1]) newline(); break
      case 'T*': newline(); break
      case 'Tm': if (y !== undefined && Math.abs(args[5] - y) > 1) newline(); y = args[5]; break
      case 'ID': { const e = s.indexOf('EI', i); i = e < 0 ? n : e + 2; break }
    }
  }
  return lines
}

// ---------------------------------------------------------------------------------------------------------------------

const DISCOUNT = /(?:up to\s+)?(?:\d+%\s*(?:off|cash\s?back|rebate|discount)?|[₱P]\s?[\d,]+\s*(?:off|cash\s?back|rebate|discount)|free delivery)/i

const titleCase = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s(+&-])([a-z])/g, (_, p, c) => p + c.toUpperCase()) : s)

/** Title "GET 20% OFF AT ROCKPORT" → "Rockport"; prefer the PDF's first line (the merchant name as the merchant writes it) when it matches. */
function merchantOf(title: string, text: string): string | undefined {
  const t = (title.match(/\bAT\s+(.+)$/i)?.[1] ?? title.match(/[\d%](?:\s+OFF)?\s+(.+)$/i)?.[1])?.trim()
  const first = text.split('\n')[0]?.trim()
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (first && first.length < 60 && t && key(first) === key(t)) return titleCase(first)
  return t ? titleCase(t) : undefined
}

/** Every "… Period: …" / "valid from …" line; the promo runs from the earliest start to the latest end (booking vs stay periods). */
function periodOf(text: string): { validFrom?: string; validTo?: string } {
  const found = text.split('\n').filter((l) => /period|valid (?:from|until)|promo offer:/i.test(l)).map(parsePeriod)
  const from = found.map((f) => f.validFrom).filter(Boolean).sort()[0]
  const to = found.map((f) => f.validTo).filter(Boolean).sort().at(-1)
  return to ? { validFrom: from, validTo: to } : parsePeriod(text)
}

/** "Address: …" header line(s) on the mechanics sheet → a single branch. */
function addressOf(text: string, name: string | undefined): Branch[] {
  const m = text.match(/^Address:\s*([\s\S]*?)(?=\n(?:Contact|Email|Website|Tel|Phone|Promo|Offer|Booking|Terms)\b)/im)
  if (!m || !name) return []
  const address = m[1].replace(/\s*\n\s*/g, ' ').replace(/(\d) (st|nd|rd|th)\b/g, '$1$2').replace(/,\s*Metro Manila\s*$/i, '').replace(/\s+/g, ' ').trim()
  const city = address.split(',').at(-1)!.trim()
  return address.includes(',') ? [{ name, address, city: city.length <= 25 ? city : undefined }] : []
}

export function toPromo(item: ListItem, text: string): Promo {
  const terms = text.search(/Terms and Conditions|Promo Mechanics:/i)
  const head = terms > 0 ? text.slice(0, terms) : text.slice(0, 800)
  const merchant = merchantOf(item.title, text)
  const branches = addressOf(head, merchant)
  const physical = /hotel|resort|branch|\bstores?\b|outlet|dine|\brooms?\b|salon|clinic|\bgym|^address:/im
  const online = /\.(?:ph|com)\b/i.test(item.title) || (/promo code|online/i.test(head) && !physical.test(item.title + '\n' + head))
  return {
    id: `aub:${item.folder.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    bank: 'AUB',
    title: item.title,
    merchant,
    discount: item.title.match(DISCOUNT)?.[0].replace(/\s+/g, ' ').trim(),
    description: text.slice(0, 4000) || undefined,
    category: toCategory(item.title, head),
    cards: /\bMastercard Credit Card/i.test(head) ? ['AUB Mastercard'] : [],
    ...periodOf(text),
    url: item.pdf,
    image: item.image,
    online: online && !branches.length,
    branches,
  }
}

async function fetchAll(): Promise<Promo[]> {
  const html = await getText(LIST)
  if (/Incapsula|_Incapsula_Resource|Request unsuccessful/i.test(html) && !/thumbnail-default2Home/.test(html))
    throw new Error('aub: blocked by Imperva (Incapsula challenge page instead of the promo list)')
  const items = parse(html)
  if (!items.length) throw new Error('aub: no promos found on list page (layout changed?)')
  const out: Promo[] = []
  for (const item of items) {
    let text = ''
    try {
      const res = await get(item.pdf, { headers: { accept: 'application/pdf,*/*;q=0.8' } })
      text = pdfText(new Uint8Array(await res.arrayBuffer()))
    } catch (e) {
      console.warn(`aub: ${item.pdf}: ${(e as Error).message}`)
    }
    out.push(toPromo(item, text))
  }
  return out
}

export default { bank: 'AUB', fetch: fetchAll } satisfies Source
