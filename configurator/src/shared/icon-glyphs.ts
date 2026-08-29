export const ICON_FAMILY = 'material-icons'

export interface IconGlyph {
  name: string
  glyph: string
  group: string
}

export const ICON_GROUPS = ['Car', 'Timing', 'Weather', 'Alerts', 'Marks'] as const

export const ICON_GLYPHS: readonly IconGlyph[] = [
  { name: 'headlights', glyph: '\ue25f', group: 'Car' },
  { name: 'high beam', glyph: '\ue42e', group: 'Car' },
  { name: 'wipers', glyph: '\ue798', group: 'Car' },
  { name: 'pit limiter', glyph: '\ue769', group: 'Car' },
  { name: 'drs', glyph: '\uefd8', group: 'Car' },
  { name: 'fuel', glyph: '\ue546', group: 'Car' },
  { name: 'energy', glyph: '\uea0b', group: 'Car' },
  { name: 'battery', glyph: '\ue1a3', group: 'Car' },
  { name: 'charge point', glyph: '\ue56d', group: 'Car' },
  { name: 'engine temp', glyph: '\ue1ff', group: 'Car' },
  { name: 'brakes', glyph: '\uef55', group: 'Car' },
  { name: 'tyre', glyph: '\uebc8', group: 'Car' },
  { name: 'wheel', glyph: '\ue57b', group: 'Car' },
  { name: 'car', glyph: '\ue531', group: 'Car' },
  { name: 'motorsport', glyph: '\uea2d', group: 'Car' },
  { name: 'garage', glyph: '\uf011', group: 'Car' },
  { name: 'repair', glyph: '\ue869', group: 'Car' },
  { name: 'settings', glyph: '\ue8b8', group: 'Car' },
  { name: 'speed', glyph: '\ue9e4', group: 'Timing' },
  { name: 'lap timer', glyph: '\ue425', group: 'Timing' },
  { name: 'stint timer', glyph: '\ue01b', group: 'Timing' },
  { name: 'clock', glyph: '\ue8b5', group: 'Timing' },
  { name: 'update', glyph: '\ue923', group: 'Timing' },
  { name: 'chart', glyph: '\ue6e1', group: 'Timing' },
  { name: 'timeline', glyph: '\ue922', group: 'Timing' },
  { name: 'standings', glyph: '\uf20c', group: 'Timing' },
  { name: 'trophy', glyph: '\uea23', group: 'Timing' },
  { name: 'sun', glyph: '\ue430', group: 'Weather' },
  { name: 'day', glyph: '\ue518', group: 'Weather' },
  { name: 'night', glyph: '\ue51c', group: 'Weather' },
  { name: 'cloud', glyph: '\ue2bd', group: 'Weather' },
  { name: 'rain', glyph: '\uf1ad', group: 'Weather' },
  { name: 'water', glyph: '\uf084', group: 'Weather' },
  { name: 'storm', glyph: '\uebdb', group: 'Weather' },
  { name: 'fog', glyph: '\ue818', group: 'Weather' },
  { name: 'cold', glyph: '\ueb3b', group: 'Weather' },
  { name: 'wind', glyph: '\ue176', group: 'Weather' },
  { name: 'flag', glyph: '\ue153', group: 'Alerts' },
  { name: 'chequered flag', glyph: '\uf06e', group: 'Alerts' },
  { name: 'outlined flag', glyph: '\ue16e', group: 'Alerts' },
  { name: 'warning', glyph: '\ue002', group: 'Alerts' },
  { name: 'error', glyph: '\ue000', group: 'Alerts' },
  { name: 'danger', glyph: '\ue99a', group: 'Alerts' },
  { name: 'emergency', glyph: '\ue1eb', group: 'Alerts' },
  { name: 'priority', glyph: '\ue645', group: 'Alerts' },
  { name: 'blocked', glyph: '\ue14b', group: 'Alerts' },
  { name: 'crash', glyph: '\uebf2', group: 'Alerts' },
  { name: 'up', glyph: '\ue5d8', group: 'Marks' },
  { name: 'down', glyph: '\ue5db', group: 'Marks' },
  { name: 'chevron up', glyph: '\ue5ce', group: 'Marks' },
  { name: 'chevron down', glyph: '\ue5cf', group: 'Marks' },
  { name: 'swap', glyph: '\ue8d4', group: 'Marks' },
  { name: 'target', glyph: '\ue8e1', group: 'Marks' },
  { name: 'dot', glyph: '\uef4a', group: 'Marks' },
  { name: 'ring', glyph: '\ue837', group: 'Marks' },
  { name: 'ruler', glyph: '\ue41c', group: 'Marks' },
  { name: 'map', glyph: '\ue55b', group: 'Marks' }
]

const encoder = new TextEncoder()

export function textBytes(text: string): number {
  return encoder.encode(text).byteLength
}

export function textFits(text: string, capacity: number): boolean {
  return textBytes(text) <= capacity - 1
}
