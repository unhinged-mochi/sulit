import { withPage } from '../browser.ts'
import { isoDate, stripHtml, toCategory, type Promo, type Source } from '../schema.ts'
import { branchesFromHtml, cardsIn, discountOf, merchantOf, promoPeriod } from './unionbank.ts'

const BASE = 'https://www.pnb.com.ph'
const API = `${BASE}/cms/api/v1`
const MAX_DETAILS = 700
const ONLINE = /\b(?:online|shopee|lazada|agoda|klook|trip\.com|grabfood|foodpanda|e-?commerce)\b/i

export interface ListItem { id: string; slug: string; title: string; image?: string; category: string[]; published_date?: string }

/** `list` = items from /webpost-list, `details` = `data` of /website-posts/show/<slug> keyed by slug. */
export function parsePnb(list: ListItem[], details: Record<string, any>, today = new Date().toISOString().slice(0, 10)): Promo[] {
  const yearAgo = `${+today.slice(0, 4) - 1}${today.slice(4)}`
  return list.flatMap((item): Promo[] => {
    const d = details[item.slug]
    if (!d || /winners?\b|congratulations/i.test(item.title)) return []
    const frames: any[] = [...(d.frames ?? [])].sort((a, b) => a.sequence - b.sequence)
    const html = frames.flatMap((f) => [f.description, ...(f.contents ?? []).flatMap((c: any) => [c.title, c.description])]).filter(Boolean).join('\n')
    const text = stripHtml(html.replace(/<\/(?:td|tr|h\d|div)>/gi, '\n')).replace(/\n{3,}/g, '\n\n')
    if (!/credit/i.test(`${item.title}\n${text}`)) return [] // deposit / debit / loan promos
    const period = promoPeriod(text)
    const published = isoDate(item.published_date)
    if (period.validTo ? period.validTo < today : published && published < yearAgo) return []
    const title = stripHtml(item.title).replace(/\s+/g, ' ')
    const labels = item.category.filter((c) => c !== 'Promotions')
    const merchant = merchantOf(title.split(' | ')[0], 'PNB')
    const eligibility = text.match(/open to[^.]*\./i)?.[0] ?? ''
    const banner = frames.flatMap((f) => (f.contents ?? []).flatMap((c: any) => c.assets ?? [])).find((a: any) => /^image\//.test(a.mime))?.url
    return [{
      id: `pnb:${item.slug}`,
      bank: 'PNB',
      title,
      merchant,
      discount: discountOf(title) ?? discountOf(text.slice(0, 600)),
      description: text.slice(0, 4000),
      category: toCategory(...labels.filter((l) => l !== 'Installments' && l !== 'Others'), title, labels.includes('Installments') ? 'shopping' : undefined),
      cards: cardsIn(`${title} ${eligibility}`, 'PNB'),
      ...period,
      url: `${BASE}/post/${item.slug}`,
      image: banner ?? item.image,
      online: ONLINE.test(title) ? true : undefined,
      branches: branchesFromHtml(html, merchant),
    }]
  })
}

async function fetchPnb(): Promise<Promo[]> {
  return withPage(async (page) => {
    // the Nuxt app sends an x-api-key with every CMS call; reuse the one it sends rather than hard-coding it
    let apiKey = ''
    page.on('request', (r) => { if (r.url().startsWith(API)) apiKey ||= r.headers()['x-api-key'] ?? '' })
    const listRes = page.waitForResponse((r) => r.url().startsWith(`${API}/webpost-list`) && r.status() === 200)
    await page.goto(`${BASE}/promos`, { waitUntil: 'domcontentloaded' })
    const body = await (await listRes).json()
    const list: ListItem[] = body?.data?.[0]?.data ?? body?.data?.data ?? []
    if (!list.length) throw new Error('pnb: empty webpost-list')
    if (!apiKey) throw new Error('pnb: no x-api-key seen')
    const slugs = list.slice(0, MAX_DETAILS).filter((i) => !/winners?\b|congratulations/i.test(i.title)).map((i) => i.slug)
    // fetched from inside the page: Akamai 403s Node's own HTTP client (page.request) from datacenter IPs — every
    // GitHub Actions run — but passes the browser's fetch. ~1 s per call server-side; the site serves HTTP/2, so 16 in flight
    const { details, fails } = await page.evaluate(async ([api, key, slugs]) => {
      const details: Record<string, any> = {}
      const fails: Record<string, number> = {}
      let i = 0
      await Promise.all(Array.from({ length: 16 }, async () => {
        while (i < slugs.length) {
          const s = slugs[i++]
          const r = await fetch(`${api}/website-posts/show/${s}`, { headers: { accept: 'application/json', 'x-api-key': key }, signal: AbortSignal.timeout(30_000) })
            .catch((e: Error) => e.name)
          if (typeof r !== 'string' && r.ok) details[s] = (await r.json().catch(() => null))?.data
          else { const k = typeof r === 'string' ? r : String(r.status); fails[k] = (fails[k] ?? 0) + 1 }
        }
      }))
      return { details, fails }
    }, [API, apiKey, slugs] as const)
    if (Object.keys(fails).length) console.warn(`  pnb: ${slugs.length - Object.keys(details).length}/${slugs.length} details failed`, fails)
    if (!Object.keys(details).length) throw new Error(`pnb: every detail request failed ${JSON.stringify(fails)}`)
    return parsePnb(list, details)
  })
}

export default { bank: 'PNB', fetch: fetchPnb } satisfies Source
