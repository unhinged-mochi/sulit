import type { Map as MLMap } from 'maplibre-gl'

// Recolour OpenFreeMap's Positron into warm paper, so cardboard tags read as taped onto a printed street map.
const PAPER = '#f1e9d8'
const WATER = '#c4d3cf'
const GREEN = '#e3e0c6'
const ROAD = '#fffcf3'
const ROAD_EDGE = '#e2d6bd'
const BUILDING = '#e8dcc4'
const INK = '#4a3f2e'

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
      else if (/boundary|admin/.test(id)) set('line-color', '#c9b896')
      else set('line-color', ROAD)
    } else if (l.type === 'symbol') {
      set('text-color', INK)
      set('text-halo-color', PAPER)
    }
  }
}
