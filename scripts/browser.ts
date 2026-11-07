// One shared headless Chromium for adapters whose sites block plain fetch (Akamai / Cloudflare).
import { chromium, type Browser, type Page } from 'playwright'
import { UA } from './schema.ts'

let browser: Promise<Browser> | undefined

/** Run `fn` in a fresh page (own context), always closing it afterwards. */
export async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  // channel 'chromium' = full Chromium in new-headless mode; Akamai blocks the old headless shell.
  browser ??= chromium.launch({ headless: true, channel: 'chromium' }).catch((e) => {
    browser = undefined
    throw e
  })
  const ctx = await (await browser).newContext({
    userAgent: UA.replace(/ sulit-bot.*$/, ''),
    locale: 'en-PH',
    timezoneId: 'Asia/Manila',
    viewport: { width: 1366, height: 900 },
  })
  ctx.setDefaultTimeout(45_000)
  try {
    return await fn(await ctx.newPage())
  } finally {
    await ctx.close().catch(() => {})
  }
}

/** The runner calls this once all adapters are done so the process can exit. */
export async function closeBrowser() {
  const b = browser
  browser = undefined
  if (b) await (await b).close().catch(() => {})
}
