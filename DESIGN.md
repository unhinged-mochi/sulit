---
name: Sulit
description: Every Philippine credit card promo on one map, printed like a peso note.
colors:
  ink: "#0e1a2b"
  ink-secondary: "#364357"
  ink-tertiary: "#5a6577"
  ink-approx: "#3a4659"
  security-blue: "#1f4fd1"
  foil-gold: "#c9a227"
  serial-red: "#b3261e"
  paper: "#f4f2ec"
  paper-pressed: "#ebe8df"
  note-white: "#fbfaf7"
  on-ink: "#f4f2ec"
  on-ink-secondary: "#aab4c3"
  rule: "rgb(14 26 43 / 0.12)"
  rule-strong: "rgb(14 26 43 / 0.22)"
  map-paper: "#f1f0eb"
  map-water: "#cfd9e4"
  map-green: "#e2e7de"
  map-building: "#e5e4de"
  map-road: "#ffffff"
  map-road-edge: "#d6dae1"
  map-label: "#4a5566"
typography:
  display:
    fontFamily: "'Geist Variable', system-ui, sans-serif"
    fontSize: "clamp(72px, 9vw, 104px)"
    fontWeight: 700
    lineHeight: 0.88
    letterSpacing: "-0.045em"
    fontFeature: "'tnum'"
    fontVariation: "'wght' 360..900 (set per deal size)"
  headline:
    fontFamily: "'Geist Variable', system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 0.95
    letterSpacing: "-0.04em"
    fontFeature: "'tnum'"
    fontVariation: "'wght' 360..900 (set per deal size)"
  brand:
    fontFamily: "'Geist Variable', system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 680
    lineHeight: 1
    letterSpacing: "-0.03em"
  title:
    fontFamily: "'Geist Variable', system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 640
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  pin:
    fontFamily: "'Geist Variable', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "'tnum'"
  body:
    fontFamily: "'Geist Variable', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 450
    lineHeight: 1.4
  body-sm:
    fontFamily: "'Geist Variable', system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 520
    lineHeight: 1.4
  meta:
    fontFamily: "'Geist Variable', system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 450
    lineHeight: 1.4
  serial:
    fontFamily: "'Geist Mono Variable', ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.2
    fontFeature: "'tnum'"
  label:
    fontFamily: "'Geist Mono Variable', ui-monospace, monospace"
    fontSize: "10.5px"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "0.06em"
rounded:
  stamp: "2px"
  tag: "7px"
  control: "10px"
  control-group: "12px"
  hint: "14px"
  note: "16px"
  sheet: "18px"
  pill: "999px"
spacing:
  2xs: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  gutter: "16px"
  lg: "20px"
components:
  wallet-bar:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    padding: "8px 0 8px 16px"
  chip-wallet:
    backgroundColor: "transparent"
    textColor: "{colors.on-ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "34px"
  chip-wallet-selected:
    backgroundColor: "{colors.on-ink}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
  chip-category:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.pill}"
    padding: "0 11px"
    height: "30px"
  chip-category-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.pill}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.security-blue}"
    textColor: "{colors.on-ink}"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.security-blue}"
    padding: "10px 4px"
    height: "44px"
  input-search:
    backgroundColor: "{colors.note-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "42px"
  denomination-tag:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    typography: "{typography.pin}"
    rounded: "{rounded.tag}"
    padding: "4px 8px"
  denomination-tag-selected:
    backgroundColor: "{colors.security-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.tag}"
  denomination-tag-approx:
    backgroundColor: "{colors.ink-approx}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.tag}"
  denomination-tag-quiet:
    backgroundColor: "{colors.note-white}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.tag}"
  cluster-seal:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.pill}"
    size: "44px"
  list-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "12px 4px"
  list-row-hover:
    backgroundColor: "{colors.paper-pressed}"
  detail-note:
    backgroundColor: "{colors.note-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.note}"
    padding: "20px 18px 18px 22px"
  sheet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
  hint:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.hint}"
    padding: "14px 16px"
---

# Design System: Sulit

## Overview

**Creative North Star: "Peso Intaglio"**

Sulit is printed, not painted. Every promo is a denomination: the discount is set like the numeral on a Bangko Sentral peso note, in one intaglio navy ink on cool note paper, and the map underneath is reprinted in the same restrained ink so the denominations are the only dark things on it. The security-printing vocabulary carries the craft: guilloche rosettes drawn as real hypotrochoid geometry, a gold foil thread, a serial-number red for anything running out, and hairline rules in place of boxes.

The system is dense and quiet. It is used one-handed on a phone in a mall, so hierarchy comes from the numeral, not from colour or chrome. A bigger deal is engraved heavier: numeral weight tracks discount size, so a map of pins ranks itself before anything is read. Interaction speaks in one security blue; gold is foil, never paint. Bank brand colours are quarantined to a 7px stamp.

It refuses the bank-banner grid and blue fintech chrome: no gradients, no glossy cards, no brand-coloured promo tiles.

**Key Characteristics:**
- One navy ink on warm-white note paper; a single cool blue for interaction.
- Discount numerals in Geist with variable weight mapped to deal size (360 to 900).
- Geist Mono for serials: dates, days left, counts, and data labels.
- Guilloche rosettes as live SVG geometry on cluster seals, the detail note, and the empty state.
- 1px rules separate rows; shadows belong only to things floating above the map.
- The selected note "prints": rings engrave in, the numeral counts up, the foil thread slides across.

## Colors

One ink, one paper, one interaction blue, and two security accents used sparingly.

### Primary
- **Intaglio Navy** (ink): the only dark. Text, the wallet band, denomination pins, cluster seals, primary buttons, selected category chips, the first-run hint. Everything that is "printed" is this ink.

### Secondary
- **Security Blue** (security-blue): interaction only. Focus rings, the search field's focus stroke, checkbox accents, text buttons, primary-button hover, and the selected pin. Never a resting surface.

### Tertiary
- **Foil Gold** (foil-gold): the security thread. The hairline under the wallet band (at 55% opacity), the windowed dashed thread under the detail numeral, the 2px ring around the selected pin, and the dot after the wordmark. 2.2:1 on paper: never text.
- **Serial Red** (serial-red): urgency only. "Ending this week" filter, days-left when a promo ends within the week, stale-source warnings in the freshness table, and the destructive "Remove" action.

### Neutral
- **Note Paper** (paper): the app ground: sheet, rail, body.
- **Pressed Paper** (paper-pressed): row hover and close-button hover; the paper pushed in, not a new surface.
- **Note White** (note-white): the raised note: detail card, search field, card-picker dialog, map controls, quiet (plan/perk) pins.
- **Ink Secondary** (ink-secondary): secondary text on paper (8.9:1); quiet pin numerals and plan denominations.
- **Ink Tertiary** (ink-tertiary): tertiary text, data labels, placeholders, inactive tabs (5.3:1 on paper).
- **Approximate Ink** (ink-approx): pins whose location is city-level, paired with a dashed inner outline.
- **On-Ink / On-Ink Secondary** (on-ink, on-ink-secondary): text on the navy band, pins, and seals (secondary at 8.4:1).
- **Rule / Rule Strong** (rule, rule-strong): 12% and 22% navy hairlines; dividers, row separators, chip and field strokes.
- **Map inks** (map-paper, map-water, map-green, map-building, map-road, map-road-edge, map-label): OpenFreeMap Positron reprinted in pale cool tints with slate labels, so the basemap never competes with navy pins.

### Named Rules
**The One Ink Rule.** Navy is the only dark colour on screen. If something needs emphasis, make it navy or make it heavier; do not introduce another dark hue.

**The Foil Rule.** Gold is a thread, a ring, or a dot. It is never text, never a fill larger than 6px, and it marks the brand band and the selected note only.

**The Stamp Quarantine Rule.** A bank's brand colour appears only in its 7px stamp square beside a mono bank name. Nowhere else: not on pins, chips, rows, or buttons.

## Typography

**Display Font:** Geist Variable (with system-ui, sans-serif)
**Label/Mono Font:** Geist Mono Variable (with ui-monospace, monospace)

**Character:** A tight neo-grotesk set with negative tracking for numerals and names, against a mono for anything that would be a serial number on a banknote. The pairing reads engineered and calm.

### Hierarchy
- **Display** (variable weight, default 700, clamp(72px, 9vw, 104px), 0.88): the detail note's denomination, set on its ruled cell grid. Plans and perks drop to 40px at 550 in ink-secondary.
- **Headline** (variable weight, default 600, 26px, 0.95): the list's denomination column (68px wide). Plans 20px/500, perks 16px, both ink-tertiary.
- **Brand** (680, 21px): the wordmark in the wallet band, followed by a gold dot.
- **Title** (640, 20px, 1.2): merchant name on the detail note; the card-picker title sits at 19px/650.
- **Pin** (variable weight, 15px, 1): the numeral on a map denomination tag.
- **Body** (450, 15px, 1.4): default text; list row titles at 600, clamped to two lines. Descriptions cap at 65ch.
- **Body small** (13.5px): chips, hints, descriptions, card-picker copy.
- **Meta** (12.5px): row meta line and freshness footer.
- **Serial** (Geist Mono 500, 12px, tabular): days left, dates; counts at 11.5px.
- **Label** (Geist Mono 500, 10.5px, 0.06em, uppercase): data labels: detail `dt`s, bank stamps, freshness column heads, the wallet's group label.

### Named Rules
**The Denomination Weight Rule.** Discount numerals take their weight from the deal: `wght = 360 + min(n, 60) / 60 × 540`. A 50% note is engraved heavier than a 10% one. Plans (0%) and unnumbered perks never use this ramp; they are set quieter in ink-secondary or ink-tertiary.

**The Serial Rule.** Dates, days left, counts, and data labels are Geist Mono with tabular numerals. Names and prose are never mono.

## Layout

Full-bleed map under a slim navy wallet band. On phones a paper sheet docks at the bottom (42dvh resting, 58dvh half, full height minus 10px), with a 40×4px grip; on desktop (≥900px) the sheet becomes a fixed 400px left rail separated by a 1px rule, and the first-run hint shifts to sit beside it. The sheet's head (tabs, search with "Near me", filters) stays fixed; only the body scrolls.

Spacing runs on a small, tight rhythm: 4/6/8/12/16/20px, with a 16px side gutter (safe-area aware) everywhere. Chip strips scroll horizontally with a 28px fade mask at the trailing edge rather than wrapping. List rows are a three-column grid: 68px denomination, flexible body, right-aligned days. Every touch target reaches 44px, via invisible hit-area extensions on 34px chips.

**The Single Measure Rule.** The 24px cell grid exists under the detail numeral only: it is the measuring field for the denomination, faded out to the right. No other surface gets a grid.

## Elevation & Depth

Paper is flat; things float only when they sit above the map. Rows, tabs, filters, and the freshness table carry no shadow and are separated by hairline rules. Pins, seals, the sheet, the detail note, the hint, map controls, and the dialog lift with soft two-layer navy shadows (a tight 1-2px contact shadow plus a wide diffuse one). Shadows are always tinted with the ink, never grey or black.

### Shadow Vocabulary
- **Pin** (`0 1px 2px rgb(14 26 43 / 0.3), 0 4px 10px rgb(14 26 43 / 0.18)`): denomination tags on the map.
- **Selected pin** (`0 0 0 2px #c9a227, 0 6px 16px rgb(31 79 209 / 0.35)`): gold ring plus a blue glow.
- **Seal** (`0 0 0 1.5px #f4f2ec, 0 3px 10px rgb(14 26 43 / 0.28)`): a paper keyline lifts clusters off the map.
- **Sheet** (`0 -1px 0 rule, 0 -10px 30px rgb(14 26 43 / 0.14)`): the mobile sheet; on desktop it becomes a 1px side rule only.
- **Note** (`0 1px 2px rgb(14 26 43 / 0.08), 0 8px 24px rgb(14 26 43 / 0.1)`): the detail note.
- **Lift** (`0 1px 2px rgb(14 26 43 / 0.12), 0 8px 24px rgb(14 26 43 / 0.14)`): the first-run hint.
- **Dialog** (`0 2px 4px rgb(14 26 43 / 0.12), 0 24px 60px rgb(14 26 43 / 0.28)`) over a 45% navy backdrop.

### Named Rules
**The Ruled Ledger Rule.** Lists are ruled, not boxed. Rows sit on paper divided by 1px rule lines; hover presses the paper (paper-pressed) instead of raising it.

## Shapes

Soft, functional corners on a strict ladder: 2px for the stamp square, 7px for denomination tags (with a 45° pointer at the bottom), 10px for buttons, fields, and list rows, 12px for map control groups, 14px for the hint (with a rotated-square pointer), 16px for the note and dialog, 18px for the sheet's top corners, and full pills for chips and the cluster seal. Rules are always 1px; dashes appear only for approximation (dashed outline inside approximate pins) and for the windowed gold thread (9/3 dash).

The recurring silhouette is the guilloche rosette: four nested hypotrochoid rings (R:r ratios closing the curve), stroked at 0.5 to 0.6px with no fill. It is real geometry generated in code, never an image.

## Components

### Wallet Bar
Navy band across the top of the note. Wordmark (with gold dot), a mono "Your cards" group label, then a horizontally scrolling chip strip. A 1px gold foil hairline at 55% runs under the band.

### Chips
- **Wallet chips:** pill, 34px tall, transparent with a 28% paper stroke on navy; hover strengthens the stroke to 60%. Selected inverts to paper with navy text at weight 600. A bank with card choices shows a mono card count after a rule divider and opens the card picker. "Show all banks" is an underlined text chip in on-ink-secondary.
- **Category chips:** the same pill at 30px on paper, ink-secondary text on a rule-strong stroke; selected fills navy.
- **"Ending this week":** a serial-red checkbox label, set apart from the category chips by a 1px rule.

### Buttons
- **Shape:** gently rounded (10px), 44px tall (42px beside search).
- **Primary** ("Read the bank's terms", "Near me", "Done"): navy fill, on-ink text, weight 550 to 600, icon left or right with an 8px gap.
- **Hover / Focus:** hover shifts the fill to security blue over 160ms; focus is a 2px security-blue outline at 2px offset.
- **Text button:** security-blue, underlined at 1px with a 3px offset; hover turns navy. Destructive variant is serial red.

### Inputs / Fields
- **Search:** note-white field, 10px radius, 42px tall, inset 1px rule-strong stroke, leading 16px search icon in ink-tertiary, 16px text (no iOS zoom).
- **Focus:** the inset stroke becomes 1.5px security blue. Checkboxes use the accent colour of their meaning (blue in the picker, red for "Ending this week").

### Navigation (Tabs)
Two text tabs with mono counts. Inactive in ink-tertiary; selected in navy with a 2px navy inset underline. Roving tabindex.

### Denomination Tag (signature)
The map pin. A navy tag with the discount numeral (pin type, variable weight) over a 10px uppercase mono line naming the bank or "+n". A rotated 8px square forms the pointer. States: hover scales 1.08; selected turns security blue, scales 1.16, gains the gold ring, and shows a faint concentric guilloche texture; approximate pins use approximate ink with a dashed inner outline; plans and perks invert to note-white with ink-secondary text.

### Cluster Seal (signature)
A 44px navy disc with a 44px rosette engraved in paper at 55%, and the count on a 26px navy centre. A paper keyline separates it from the map. Hover scales 1.08 and turns the rosette 30° over 600ms.

### List Row
Ruled row with a 68px denomination column, merchant name (600, two-line clamp), a meta line with the bank stamp, and a right-aligned mono days column that turns serial red at weight 600 when ending soon.

### Detail Note (signature)
The selected promo, printed as a note: note-white, 16px radius, note shadow. A 220px rosette sits cropped at top-right at 22% ink. The display numeral rests on the 24px cell grid, then the gold windowed thread, merchant title, a ruled definition list with mono labels (Bank, Cards, Until, Where), clipped description, and the primary "Read the bank's terms" link.

**The Printing Rule.** Opening a note plays the signature once: the rosette's four rings engrave in (stroke-dashoffset, 1100ms each, staggered 90ms), the numeral counts up to its value over 520ms with a cubic ease-out, the foil thread scales in from the left over 700ms, and the note settles 8px over 360ms, all on `cubic-bezier(0.16, 1, 0.3, 1)`. Under reduced motion all of it is instant.

### Empty State
An 88px rosette at 50% ink-tertiary above centred copy (34ch) and underlined text-button actions to clear filters.

### First-run Hint
A navy callout with a 14px radius and a rotated-square pointer aimed at the wallet. It peels away (10px up, fade, 320ms) once dismissed.

## Do's and Don'ts

### Do:
- **Do** set every discount numeral's weight from the deal size (360 to 900) and keep plans and perks visibly quieter.
- **Do** separate rows with 1px rule lines (12% navy) and press the paper on hover.
- **Do** put dates, days left, counts, and data labels in Geist Mono with tabular numerals.
- **Do** draw rosettes as SVG geometry from the hypotrochoid generator, stroked 0.5 to 0.6px, and only on cluster seals, the detail note, and the empty state.
- **Do** reserve security blue for interaction and focus; reserve serial red for urgency and destructive actions.
- **Do** keep every touch target at 44px, extending hit areas invisibly where the visual is smaller.
- **Do** make every motion instant under `prefers-reduced-motion`.

### Don't:
- **Don't** introduce a second dark hue or a gradient; navy is the only ink.
- **Don't** use gold as text or as a surface; it is a thread, a ring, or a dot.
- **Don't** use a bank's brand colour anywhere but its 7px stamp square.
- **Don't** box or shadow list rows, tabs, or filters; shadows are for things floating over the map.
- **Don't** place a rosette as wallpaper behind content, or a cell grid anywhere but under the detail numeral.
- **Don't** set mono text below 10.5px; anything smaller stops reading as a serial and starts failing outdoors.
