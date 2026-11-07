// Fills merchant / discount / dates / branches that a source only has as prose.
// LLM (Ollama, free tier) when available, regex otherwise. Cached by promo id + title so each promo costs one call ever.
import { createHash } from 'node:crypto'
import { getText, isoDate, stripHtml, type Branch, type Promo } from './schema.ts'

export interface Extracted {
  merchant?: string | null
  discount?: string | null
  validFrom?: string | null
  validTo?: string | null
  online?: boolean
  branches?: Branch[]
}
export type ExtractCache = Record<string, Extracted & { at: string; via: 'llm' | 'regex' }>

const HOST = (process.env.OLLAMA_HOST ?? (process.env.OLLAMA_API_KEY ? 'https://ollama.com' : 'http://localhost:11434')).replace(/\/$/, '')
const NAME = process.env.OLLAMA_MODEL ?? 'glm-5.3:cloud'
// a local Ollama proxies 'x:cloud' to ollama.com; the cloud API itself drops the suffix (same as ~/Projects/tarot)
const MODEL = HOST === 'https://ollama.com' ? NAME.replace(/:cloud$/, '') : NAME

const MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'
const DATE = new RegExp(`(${MONTHS})\\.?\\s+(\\d{1,2})(?:\\s*,?\\s*(20\\d\\d))?`, 'gi')

/** Cheap, deterministic best effort. Exported for the test. */
export function regexExtract(title: string, text: string, year = new Date().getFullYear()): Extracted {
  const all = `${title}\n${text}`
  const discount =
    all.match(/(?:up to\s+)?\d{1,3}%\s*(?:off|discount|cash\s*back|rebate)/i)?.[0] ??
    all.match(/(?:₱|php\s?|p)\s?[\d,]+(?:\.\d\d)?\s*(?:off|discount|cash\s*back|rebate)/i)?.[0] ??
    all.match(/0%\s*(?:interest|installment)[^.\n]{0,24}/i)?.[0] ??
    all.match(/buy\s+\d+,?\s*(?:get|take)\s+\d+(?:\s+free)?/i)?.[0]
  const dates = [...all.matchAll(DATE)].map((m) => isoDate(`${m[1]} ${m[2]} ${m[3] ?? year}`)).filter(Boolean) as string[]
  // "at Merchant" / "with Merchant" at the end of a headline: "20% OFF at Yabu"
  const merchant = title.match(/\b(?:at|in|with|from)\s+([A-Z0-9][\w'’&.\- ]{1,40}?)(?:[!.]|\s+(?:with|using|for|this|until|when)\b|$)/)?.[1]?.trim()
  return {
    merchant: merchant ?? null,
    discount: discount ? discount.replace(/\s+/g, ' ').trim() : null,
    validFrom: dates.length > 1 ? dates.sort()[0] : null,
    validTo: dates.length ? dates.sort().at(-1)! : null,
  }
}

const TEMPLATE = '{"merchant": string|null, "discount": string|null, "validFrom": "YYYY-MM-DD"|null, "validTo": "YYYY-MM-DD"|null, "online": boolean, "branches": [{"name": string, "address": string, "city": string}]}'

let llmDown = false
async function llmExtract(p: Promo, text: string): Promise<Extracted | null> {
  if (llmDown) return null
  const today = new Date().toISOString().slice(0, 10)
  const res = await fetch(`${HOST}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(process.env.OLLAMA_API_KEY ? { authorization: `Bearer ${process.env.OLLAMA_API_KEY}` } : {}) },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      // GLM ignores `format` key names and leaks reasoning into content with think:false; 'low' + an explicit template is reliable
      think: 'low',
      format: 'json',
      options: { temperature: 0, num_predict: 1500 },
      messages: [
        {
          role: 'system',
          content: `Extract structured facts from a Philippine credit card promo page. Today is ${today}. Only use facts in the text; null when absent. Years: assume the nearest year that makes the dates sensible.
Reply with ONLY this JSON object, exactly these keys:
${TEMPLATE}
merchant: single merchant/brand, null if many or none. discount: headline benefit under 6 words ("20% off", "₱500 off", "0% for 12 months", "Free dessert"). online: true only if redeemable solely online/app/delivery. branches: only physical branches explicitly listed in the text, [] if "all branches" or none listed.`,
        },
        { role: 'user', content: `Bank: ${p.bank}\nTitle: ${p.title}\n\n${text.slice(0, 9000)}` },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  }).catch(() => null)
  if (!res?.ok) {
    // one hard failure (no key, no local ollama, quota) → regex for the rest of the run
    if (!res || res.status === 401 || res.status === 403 || res.status === 429) llmDown = true
    console.warn(`  llm: ${res?.status ?? 'unreachable'} for ${p.id}${llmDown ? ' — falling back to regex for this run' : ''}`)
    return null
  }
  try {
    const content: string = (await res.json()).message.content
    const out = JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1)) as Extracted
    out.validFrom = isoDate(out.validFrom) ?? null
    out.validTo = isoDate(out.validTo) ?? null
    out.branches = (out.branches ?? []).filter((b) => b?.name).slice(0, 200)
    return out
  } catch {
    return null
  }
}

/** Visible text of a promo detail page, scripts/nav stripped. Detail pages carry the mechanics and branch lists. */
async function pageText(url: string): Promise<string> {
  const html = await getText(url).catch(() => '')
  const body = html.replace(/<(script|style|noscript|svg|header|footer|nav)\b[\s\S]*?<\/\1>/gi, ' ')
  return stripHtml(body.match(/<main[\s\S]*<\/main>/i)?.[0] ?? body)
}

const needs = (p: Promo) => !p.merchant || !p.discount || !p.validTo || (!p.branches.length && !p.online)
const key = (p: Promo) => `${p.id}#${createHash('sha1').update(p.title).digest('hex').slice(0, 8)}`

export async function extractAll(promos: Promo[], cache: ExtractCache, concurrency = 4): Promise<void> {
  const todo = promos.filter((p) => needs(p) && !cache[key(p)])
  console.log(`extract: ${todo.length} new of ${promos.length} (cache ${Object.keys(cache).length})`)
  let i = 0
  const worker = async () => {
    while (i < todo.length) {
      const p = todo[i++]
      const text = [p.description ?? '', p.url.startsWith('http') ? await pageText(p.url) : ''].join('\n\n')
      const llm = await llmExtract(p, text)
      cache[key(p)] = { ...(llm ?? regexExtract(p.title, text)), at: new Date().toISOString(), via: llm ? 'llm' : 'regex' }
      if (i % 25 === 0) console.log(`  extract ${i}/${todo.length}`)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  for (const p of promos) apply(p, cache[key(p)])
}

/** Source data wins; extraction only fills gaps. */
function apply(p: Promo, e: Extracted | undefined) {
  if (!e) return
  p.merchant ||= e.merchant ?? undefined
  p.discount ||= e.discount ?? undefined
  p.validFrom ||= e.validFrom ?? undefined
  p.validTo ||= e.validTo ?? undefined
  if (p.online === undefined && e.online !== undefined) p.online = e.online
  if (!p.branches.length && e.branches?.length) p.branches = e.branches.map((b) => ({ ...b }))
}

// regex-only rows are retried once an LLM is reachable
export const pruneRegex = (cache: ExtractCache) => {
  for (const k in cache) if (cache[k].via === 'regex') delete cache[k]
}
