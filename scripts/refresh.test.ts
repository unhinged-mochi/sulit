import assert from 'node:assert/strict'
import { test } from 'node:test'
import { daysLeft, daysLabel, shortDiscount, validDays, validOn } from '../src/promo.ts'
import { regexExtract } from './extract.ts'
import { overpassQuery } from './geocode.ts'
import { finalize, stampFirstSeen } from './refresh.ts'
import { isoDate, toCategory, type Promo } from './schema.ts'
import { mentions, parse as metrobank } from './sources/metrobank.ts'

test('stampFirstSeen marks only ids the previous sync lacked', () => {
  const p = (id: string, firstSeen?: string) => ({ id, firstSeen }) as Promo
  const out = stampFirstSeen([p('a'), p('b'), p('c')], [p('a', '2026-11-01'), p('b')], '2026-11-09')
  assert.deepEqual(out.map((x) => x.firstSeen), ['2026-11-01', undefined, '2026-11-09'])
  assert.equal(stampFirstSeen([p('a')], [], '2026-11-09')[0].firstSeen, undefined) // first run: nothing is "new"
})

test('validDays reads day rules, not opening hours', () => {
  assert.deepEqual(validDays('Get P100 off every Monday, Wednesday, and Friday'), [1, 3, 5])
  assert.deepEqual(validDays('Valid only from Mondays to Fridays, excluding holidays.'), [1, 2, 3, 4, 5])
  assert.deepEqual(validDays('No minimum spend required. Valid every Saturday and Sunday'), [0, 6])
  assert.deepEqual(validDays('50% off, valid on weekends only'), [0, 6])
  assert.deepEqual(validDays('35% OFF on à la carte menu, valid Monday to Saturday'), [1, 2, 3, 4, 5, 6])
  assert.deepEqual(validDays('Valid Friday to Sunday'), [0, 5, 6]) // wraps the week
  assert.equal(validDays('Open daily. Sun to Thurs | 11AM to 1AM • Friday to Saturday | 11AM to 2AM'), undefined)
  assert.equal(validDays('Valid Monday to Sunday'), undefined) // every day is no restriction
  assert.equal(validDays('20% off all items'), undefined)
  assert.equal(daysLabel([1, 2, 3, 4, 5]), 'Mon–Fri')
  assert.equal(daysLabel([0, 6]), 'Sun & Sat')
})

test('validOn checks the date range and the weekday', () => {
  const p = { validFrom: '2026-11-01', validTo: '2026-11-30', days: [0, 6] } as Promo
  assert.equal(validOn(p, '2026-11-14'), true) // a Saturday
  assert.equal(validOn(p, '2026-11-12'), false) // a Thursday
  assert.equal(validOn(p, '2026-12-05'), false) // after it ends
  assert.equal(validOn({} as Promo, '2027-01-01'), true)
})

test('isoDate reads dates as a Manila calendar day', () => {
  assert.equal(isoDate('2026-11-30T00:00:00+08:00'), '2026-11-30') // UTC would say the 29th
  assert.equal(isoDate('Jan 14, 2027'), '2027-01-14')
  assert.equal(isoDate('2026-12-01'), '2026-12-01')
  assert.equal(isoDate('not a date'), undefined)
})

test('toCategory prefers the first label that matches', () => {
  assert.equal(toCategory('Travel and leisure', 'Restaurants'), 'travel')
  assert.equal(toCategory('Dining'), 'dining')
  assert.equal(toCategory(undefined, 'Nothing'), 'other')
})

test('shortDiscount turns headlines into price-tag labels', () => {
  assert.deepEqual(shortDiscount('Up to 60% off base fares'), { label: '60%', n: 60, upTo: true, kind: 'off' })
  assert.equal(shortDiscount('₱500 off with min spend')?.label, '₱500')
  assert.equal(shortDiscount('Get P1,500 cashback')?.label, '₱1.5k')
  assert.equal(shortDiscount('Buy 1, Take 1 pizza')?.label, 'B1T1')
  assert.deepEqual(shortDiscount('0% installment for 12 months'), { label: '0%', n: 0.5, upTo: false, kind: 'plan', note: '12 mo.' })
  assert.equal(shortDiscount('Free dessert')?.label, 'Free')
  assert.equal(shortDiscount('Exclusive deals in China'), null)
})

test('daysLeft counts to the end of the last day in Manila', () => {
  const now = Date.parse('2026-11-08T10:00:00+08:00')
  assert.equal(daysLeft('2026-11-08', now), 0)
  assert.equal(daysLeft('2026-11-15', now), 7)
  assert.equal(daysLeft(undefined, now), null)
})

test('regexExtract pulls merchant, discount and dates from prose', () => {
  const e = regexExtract('20% OFF at Yabu', 'Valid from October 1 to December 15, 2026 with min spend P1,000.', 2026)
  assert.equal(e.merchant, 'Yabu')
  assert.equal(e.discount, '20% OFF')
  assert.equal(e.validFrom, '2026-10-01')
  assert.equal(e.validTo, '2026-12-15')
})

test('finalize drops expired, far-future and duplicate promos, keeps open-ended ones', () => {
  const p = (id: string, validTo?: string, validFrom?: string) => ({ id, validTo, validFrom }) as Promo
  const out = finalize(
    [p('a', '2026-11-07'), p('b', '2026-11-08'), p('b', '2026-11-08'), p('c'), p('soon', undefined, '2026-11-15'), p('later', undefined, '2026-12-01')],
    '2026-11-08',
    '2026-11-15',
  )
  assert.deepEqual(out.map((x) => x.id), ['b', 'c', 'soon'])
  const [m] = finalize([{ id: 'm', bank: 'RCBC', merchant: 'RCBC Visa Infinite' } as Promo], '2026-11-08', '2026-11-15')
  assert.equal(m.merchant, undefined)
})

test('overpassQuery escapes regex characters in merchant names', () => {
  assert.match(overpassQuery('Mary Grace (Café)'), /Mary Grace \\\(Café\\\)/)
})

test('metrobank parser: branches, placeholder coordinates, expiry, credit-only', () => {
  const card = (title: string, type?: string) => ({ title, cardTypes: type ? [{ name: type }] : [] })
  const next = {
    props: {
      pageProps: {
        data: {
          merchants: [
            { id: 'b1', geolocation: { latitude: 14.58, longitude: 121.06 } },
            { id: 'b2', geolocation: { latitude: 11, longitude: 123.5 } }, // the bank's "unknown" placeholder
          ],
          promoDetails: [
            {
              id: 'p1', slug: '/yabu', title: '10% OFF at Yabu', description: 'Min spend P2,000', categories: [{ category: 'Dining' }],
              startDate: '2026-08-01T00:00:00+08:00', expirationDate: '2026-11-30T00:00:00+08:00',
              cards: [card('Titanium Mastercard', 'Credit Card'), card('Debit', 'Debit Card')],
              participatingBranches: [
                { id: 'b1', name: 'Yabu Megamall', address: 'SM Megamall', city: 'Mandaluyong', merchant: { name: 'Yabu' } },
                { id: 'b2', name: 'Yabu Cebu', address: 'Ayala Center Cebu', city: 'Cebu', merchant: { name: 'Yabu' } },
              ],
            },
            { id: 'old', slug: '/old', title: 'Expired', categories: [], expirationDate: '2020-01-01T00:00:00+08:00', cards: [card('X', 'Credit Card')] },
            { id: 'dep', slug: '/dep', title: 'Deposit promo', categories: [], cards: [card('Savings', 'Deposit')] },
          ],
        },
      },
    },
  }
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(next)}</script>`
  const out = metrobank(html, new Date('2026-11-08T00:00:00+08:00'))
  assert.equal(out.length, 1)
  const [p] = out
  assert.equal(p.merchant, 'Yabu')
  assert.equal(p.validTo, '2026-11-30')
  assert.deepEqual(p.cards, ['Titanium Mastercard'])
  assert.equal(p.branches[0].lat, 14.58)
  assert.equal(p.branches[1].lat, undefined) // placeholder dropped → geocoder takes over
})

test('metrobank: a branch only counts when the promo names its merchant', () => {
  assert.equal(mentions('0% installment at Planet Sports', 'Mijo Comfort Food'), false)
  assert.equal(mentions('20% OFF at Mijo', 'Mijo Comfort Food'), true)
  assert.equal(mentions('10% OFF at Bread Broth & Beyond', 'Bread Broth & Beyond'), true)
})

test('cards: specific cards, network-only cards, and "any card" on either side', async () => {
  const { takes } = await import('../src/promo.ts')
  const p = (bank: string, ...cards: string[]) => ({ bank, cards }) as Promo
  assert.equal(takes(p('BDO', 'BDO Platinum Mastercard'), ['BDO Platinum Mastercard']), true)
  assert.equal(takes(p('BDO', 'BDO Platinum Mastercard'), ['BDO Gold Visa']), false)
  assert.equal(takes(p('BDO'), ['BDO Gold Visa']), true) // no cards listed = all of them
  assert.equal(takes(p('BDO', 'BDO Platinum Mastercard')), true) // no cards held = any card
  assert.equal(takes(p('BDO', 'BDO Mastercard'), ['BDO Gold Mastercard']), true)
  assert.equal(takes(p('BDO', 'BDO Mastercard'), ['BDO Gold Visa']), false)
  assert.equal(takes(p('Visa', 'Any Visa card'), ['Travel Signature Visa']), true)
  assert.equal(takes(p('Visa', 'Any Visa card'), ['Titanium Mastercard']), false)
})

test('finalize reads eligible cards out of the promo text', () => {
  const [p] = finalize([{ id: 'x', bank: 'BDO', title: '10% off', description: 'Valid for BDO JCB Platinum Credit Card and BDO Credit Card holders', cards: [] } as unknown as Promo], '2026-11-08', '2026-11-15')
  assert.deepEqual(p.cards, ['BDO JCB Platinum'])
})
