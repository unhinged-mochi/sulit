# Product

<!-- impeccable:product-schema 1 -->

> Written without an interview: the owner asked not to be asked clarifying questions. Lines marked *(inferred)* come from the original brief, not a confirmed answer.

## Platform

web

## Stack

delegated: Vite + vanilla TypeScript + MapLibre GL with OpenFreeMap tiles; data refreshed daily by GitHub Actions and served as static JSON from Cloudflare Pages. Chosen because the brief asked for regular updates with no payment, and this stack has no server, database, or map API key.

## Users

People in the Philippines who hold one or more credit cards and want to know where a card gets them a discount, usually while deciding where to eat or shop nearby. *(inferred)*

## Product Purpose

Collect every PH credit card promo the banks publish and put the ones tied to a place on a map, filtered to the cards the user actually holds. Success is answering "I'm here, I have BPI and Metrobank, where's a deal?" in seconds.

## Positioning

Banks list promos as per-bank grids of banners. Sulit is cross-bank and spatial: one map, every issuer, sorted by where you are and which cards are in your wallet.

## Operating Context

- Used on a phone, often outdoors or in a mall, one-handed, deciding quickly. *(inferred)*
- Also used on desktop to plan ahead. *(inferred)*
- Data comes from 13 bank sites plus Visa. Each source can go stale independently; the UI must say how fresh each bank's data is.

## Capabilities and Constraints

- Promos have: bank, title, merchant, discount, category, eligible cards (often "all credit cards" of that bank), validity dates, the bank's T&C link, and zero or more geocoded branches.
- Some pins are approximate (city-level) and must be marked as approximate.
- Many promos have no location (online, installment, nationwide). They need their own list, not pins.
- Sulit is not a bank and does not guarantee promos. The bank's page is the source of truth, and every promo links to it.

## Brand Commitments

- Name: **Sulit** (Filipino for "worth it"). *(inferred: chosen by the builder)*

## Evidence on Hand

- Real scraped promo data in `public/data/promos.json`.
- No testimonials, user counts, or partnerships exist. Never invent them.

## Product Principles

1. Wallet first: the cards you hold decide what you see.
2. Where and when, at a glance: location, discount size, and days left beat banner art.
3. Always link to the source; show data freshness honestly.
4. Free and keyless to run, forever.

## Accessibility & Inclusion

- WCAG AA contrast.
- Everything on the map must also be reachable as a list (screen readers and keyboard users can't use pins).
- Respect reduced motion.
