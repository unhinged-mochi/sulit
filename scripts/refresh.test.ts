import assert from 'node:assert/strict'
import { test } from 'node:test'
import { daysLeft, shortDiscount } from '../src/promo.ts'
import { regexExtract } from './extract.ts'
import { overpassQuery } from './geocode.ts'
import { finalize } from './refresh.ts'
import { isoDate, toCategory, type Promo } from './schema.ts'
import { parse as metrobank } from './sources/metrobank.ts'

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
  assert.deepEqual(shortDiscount('Up to 60% off base fares'), { label: '60%', n: 60, upTo: true })
  assert.equal(shortDiscount('₱500 off with min spend')?.label, '₱500')
  assert.equal(shortDiscount('Get P1,500 cashback')?.label, '₱1.5k')
  assert.equal(shortDiscount('Buy 1, Take 1 pizza')?.label, 'B1T1')
  assert.equal(shortDiscount('0% installment for 12 months')?.label, '0%')
  assert.equal(shortDiscount('Free dessert'), null)
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

test('finalize drops expired promos and duplicates, keeps open-ended ones', () => {
  const p = (id: string, validTo?: string) => ({ id, validTo }) as Promo
  const out = finalize([p('a', '2026-11-07'), p('b', '2026-11-08'), p('b', '2026-11-08'), p('c')], '2026-11-08')
  assert.deepEqual(out.map((x) => x.id), ['b', 'c'])
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
