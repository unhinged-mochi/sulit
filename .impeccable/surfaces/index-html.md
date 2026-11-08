---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: []
---

# Map (index.html)

Scope: the single app surface. A map and a list of every PH credit card promo. Mode: **Operate**.
Audience/job: cardholders deciding where to eat or shop right now, on a phone. Their task is to filter to their banks and find nearby deals and how long each one lasts.
Constraints: the list mirrors the map for keyboard and screen-reader users; online/nationwide promos get their own tab; data freshness is shown per bank; approximate pins are marked.
History: the sari-sari cardboard world (seed 675d6531) was replaced on 2026-11-08; the owner found the marker font and paper tacky and asked for sleek and cool.

Ranked grounded list: 1 premium metal credit card · 2 MRT/LRT + Beep wayfinding · 3 BSP peso banknote security printing · 4 mall LED directory kiosk · 5 NAIA departures board · 6 POS thermal receipt · 7 jeepney signboard.
Challenger verdicts: orienteering map (competitive), monochrome product UI (competitive), Crouwel grid (declined, kept monumental grid numerals), centre-rail page (declined, kept 1px rule discipline), vertical feed (declined, kept one-snap paging at a spot), variable font specimen (declined, kept numeral weight tracking deal size).

## Direction contract
THESIS: Every promo is a denomination. The discount is set like a banknote numeral, engraved in fine line on a map printed in one cool ink. Refuses the bank-banner grid and blue fintech chrome.
OWN-WORLD: Paper-white ground (#f4f2ec), intaglio navy ink (#0e1a2b), one security blue (#1f4fd1) for interaction, foil gold (#c9a227) only on the selected note's thread. Guilloche rosettes as crisp SVG geometry, only on pins, the detail note and the empty state. One-device-pixel rules; no boxes, no drop shadows on rows. Geist for UI; Geist Mono for serials, dates and days left. Numeral weight tracks deal size (raise: variable specimen). Monumental numeral on a cell grid in the detail (raise: Crouwel).
STORY: I tick my banks once, see denominations pinned near me, tap one, read merchant, eligible cards and days left, and open the bank's page.
FIRST VIEWPORT: Full-bleed single-ink map. Slim navy wallet bar with bank chips on top. Pins are small navy denomination tags; clusters are navy rosette seals with counts. Phones: bottom sheet listing ruled rows; desktop: 400px left rail.
FORM: BSP peso banknote security printing, position 3 of 7, seed 2deddd73.
SIGNATURE: tapping a pin "prints" its note: the guilloche rosette draws its lines in (stroke-dashoffset), the numeral counts up to its value, the foil thread slides across. Reduced motion: instant.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
