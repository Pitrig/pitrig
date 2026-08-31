import { ICON_FAMILY, ICON_GLYPHS } from '@shared/icon-glyphs'

const SPECIMEN_NAMES = ['speed', 'lap timer', 'fuel', 'tyre', 'chequered flag', 'warning']

export function isIconFace(id?: string, category?: string): boolean {
  return id === ICON_FAMILY || category === 'Icons'
}

export const ICON_SPECIMEN = SPECIMEN_NAMES.map(
  (name) => ICON_GLYPHS.find((icon) => icon.name === name)?.glyph ?? ''
).join('')
