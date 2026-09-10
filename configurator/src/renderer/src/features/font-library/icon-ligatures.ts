import type { IconGlyph } from '@shared/icon-glyphs'
import { characterMap, safeUint16, safeUint32, tableDirectory } from '@shared/sfnt'

export type IconName = Pick<IconGlyph, 'name' | 'glyph'>

interface Ligatures {
  view: DataView
  letters: ReadonlyMap<number, number>
  icons: ReadonlyMap<number, number>
  names: IconName[]
}

const LIGATURE_SUBSTITUTION = 4
const EXTENSION_SUBSTITUTION = 7
const LETTER_CODES = codeRange(0x20, 0x7e)
const PRIVATE_USE_CODES = codeRange(0xe000, 0xf8ff)

export function iconLigatures(face: Uint8Array): IconName[] {
  const view = new DataView(face.buffer, face.byteOffset, face.byteLength)
  const directory = tableDirectory(view)
  const cmap = directory?.get('cmap')
  const gsub = directory?.get('GSUB')
  if (cmap === undefined || gsub === undefined) return []
  const ligatures: Ligatures = {
    view,
    letters: codesByGlyph(characterMap(view, cmap, LETTER_CODES)),
    icons: codesByGlyph(characterMap(view, cmap, PRIVATE_USE_CODES)),
    names: []
  }
  const lookups = gsub + uint16(view, gsub + 8)
  for (let index = 0; index < uint16(view, lookups); ++index) {
    readLookup(ligatures, lookups + uint16(view, lookups + 2 + index * 2))
  }
  return ligatures.names.sort((a, b) => a.name.localeCompare(b.name))
}

function readLookup(ligatures: Ligatures, lookup: number): void {
  const { view } = ligatures
  const type = uint16(view, lookup)
  for (let index = 0; index < uint16(view, lookup + 4); ++index) {
    const subtable = lookup + uint16(view, lookup + 6 + index * 2)
    if (type === LIGATURE_SUBSTITUTION) readLigatureSets(ligatures, subtable)
    if (type === EXTENSION_SUBSTITUTION && uint16(view, subtable + 2) === LIGATURE_SUBSTITUTION) {
      readLigatureSets(ligatures, subtable + (safeUint32(view, subtable + 4) ?? 0))
    }
  }
}

function readLigatureSets(ligatures: Ligatures, subtable: number): void {
  const { view } = ligatures
  const firsts = coverage(view, subtable + uint16(view, subtable + 2))
  firsts.slice(0, uint16(view, subtable + 4)).forEach((first, index) => {
    const set = subtable + uint16(view, subtable + 6 + index * 2)
    for (let entry = 0; entry < uint16(view, set); ++entry) {
      readLigature(ligatures, first, set + uint16(view, set + 2 + entry * 2))
    }
  })
}

function readLigature(ligatures: Ligatures, first: number, ligature: number): void {
  const { view, letters, icons, names } = ligatures
  const code = icons.get(uint16(view, ligature))
  if (code === undefined) return
  let name = ''
  const length = uint16(view, ligature + 2)
  for (let index = 0; index < length; ++index) {
    const glyph = index === 0 ? first : uint16(view, ligature + 2 + index * 2)
    const letter = letters.get(glyph)
    if (letter === undefined) return
    name += String.fromCharCode(letter)
  }
  names.push({ name: name.replace(/_/g, ' '), glyph: String.fromCodePoint(code) })
}

function coverage(view: DataView, table: number): number[] {
  const listed = uint16(view, table) === 1
  const glyphs: number[] = []
  for (let index = 0; index < uint16(view, table + 2); ++index) {
    if (listed) {
      glyphs.push(uint16(view, table + 4 + index * 2))
      continue
    }
    const range = table + 4 + index * 6
    for (let glyph = uint16(view, range); glyph <= uint16(view, range + 2); ++glyph) {
      glyphs.push(glyph)
    }
  }
  return glyphs
}

function codesByGlyph(glyphs: Map<number, number> | undefined): Map<number, number> {
  const codes = new Map<number, number>()
  for (const [code, glyph] of glyphs ?? []) {
    if (!codes.has(glyph)) codes.set(glyph, code)
  }
  return codes
}

function codeRange(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index)
}

function uint16(view: DataView, offset: number): number {
  return safeUint16(view, offset) ?? 0
}
