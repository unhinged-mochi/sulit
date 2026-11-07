import { getJson, isoDate, toCategory, type Promo, type Source } from '../schema.ts'

// Visa's own PH offers: work with any Visa card from any PH bank.
export function parse(json: any): Promo[] {
  return json.perksGroups[0].perks
    .filter((p: any) => /^PH\b/.test(p.metaData?.customAttributes?.programName ?? ''))
    .map((p: any): Promo => ({
      id: `visa:${p.sourceId}`,
      bank: 'Visa',
      title: p.shortDescription,
      merchant: p.merchantName,
      description: p.metaData.customAttributes.offerCopy,
      category: toCategory(p.merchantName, p.shortDescription),
      cards: ['Any Visa card'],
      validFrom: isoDate(p.startDate),
      validTo: isoDate(p.endDate),
      url: 'https://www.visa.com.ph/en_PH/visa-offers-and-perks/',
      image: p.image,
      online: (p.merchantLocations ?? []).length === 0,
      branches: (p.merchantLocations ?? []).map((l: any) => ({ name: p.merchantName, city: l.city, address: l.address })),
    }))
}

export default {
  bank: 'Visa',
  fetch: async () =>
    parse(
      await getJson('https://www.visa.com.ph/offers/api/portal/portal/perks/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteId: 'www.visa.com.ph', perkTypeRequests: [{ perkType: 'OFFERS', locale: 'en_PH', pageRequest: { index: 0, limit: 1000 }, perkArguments: { offerType: 'U' } }] }),
      }),
    ),
} satisfies Source
