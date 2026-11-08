import type { Map as MLMap } from 'maplibre-gl'

// Reprint OpenFreeMap's Positron in one cool intaglio ink on note paper, so the navy denominations are the only dark thing on it.
const PAPER = '#f1f0eb'
const WATER = '#cfd9e4'
const GREEN = '#e2e7de'
const ROAD = '#ffffff'
const ROAD_EDGE = '#d6dae1'
const BUILDING = '#e5e4de'
const INK = '#4a5566'

export function paperMap(map: MLMap) {
  for (const l of map.getStyle().layers) {
    const id = l.id
    const set = (prop: string, v: unknown) => {
      try { map.setPaintProperty(id, prop as any, v) } catch {}
    }
    if (l.type === 'background') set('background-color', PAPER)
    else if (l.type === 'fill') {
      if (/water/.test(id)) set('fill-color', WATER)
      else if (/park|wood|grass|landcover|forest/.test(id)) set('fill-color', GREEN)
      else if (/building/.test(id)) set('fill-color', BUILDING)
      else set('fill-color', PAPER)
    } else if (l.type === 'line') {
      if (/water|river/.test(id)) set('line-color', WATER)
      else if (/casing|outline/.test(id)) set('line-color', ROAD_EDGE)
      else if (/boundary|admin/.test(id)) set('line-color', '#b9c1cd')
      else set('line-color', ROAD)
    } else if (l.type === 'symbol') {
      set('text-color', INK)
      set('text-halo-color', PAPER)
    }
  }
}

/**
 * Guilloche rosette: layered hypotrochoids, the engraved security pattern on a peso note.
 * Pure geometry; `cls` lets the detail note animate each ring drawing in.
 */
export function rosette(size: number, color: string, opts: { cls?: string; width?: number } = {}) {
  const c = size / 2
  const rings: [number, number, number][] = [ // R, r, d as fractions of the radius
    [1, 0.12, 0.34],
    [0.86, 0.1, 0.3],
    [0.7, 0.14, 0.24],
    [0.52, 0.065, 0.16],
  ]
  const paths = rings.map(([R, r, d], i) => {
    const [Rr, rr, dd] = [R * c, r * c, d * c]
    const turns = Math.round(R / r) // closes the curve
    let p = ''
    for (let s = 0; s <= 720; s++) {
      // a base circle traced once while an offset arm spins `turns` times: the classic rose-engine loop
      const a = (s / 720) * Math.PI * 2
      const x = c + (Rr - rr - dd) * Math.cos(a) + dd * Math.cos(a * turns)
      const y = c + (Rr - rr - dd) * Math.sin(a) - dd * Math.sin(a * turns)
      p += `${s ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
    }
    return `<path${opts.cls ? ` class="${opts.cls}" style="--i:${i}"` : ''} d="${p}Z" pathLength="1"/>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="${opts.width ?? 0.6}" aria-hidden="true">${paths.join('')}</svg>`
}
