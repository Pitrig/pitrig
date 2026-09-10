import { characterMap, safeUint16, tableDirectory } from '../../shared/sfnt'

export function missingCharacters(face: Uint8Array, text: string): string[] | undefined {
  const codes = [...new Set(text)].map((character) => character.codePointAt(0) ?? 0)
  const glyphs = glyphsFor(face, codes)
  if (!glyphs) return undefined
  return [...new Set(text)].filter(
    (character) => !glyphs.get(character.codePointAt(0) ?? 0)
  )
}

function glyphsFor(face: Uint8Array, codes: number[]): Map<number, number> | undefined {
  const view = new DataView(face.buffer, face.byteOffset, face.byteLength)
  const directory = tableDirectory(view)
  const cmap = directory?.get('cmap')
  if (cmap === undefined) return undefined
  return characterMap(view, cmap, codes)
}

export function hasTabularDigits(face: Uint8Array): boolean | undefined {
  const advances = digitAdvances(face)
  if (!advances) return undefined
  const first = advances[0]
  if (first === undefined) return undefined
  return advances.every((advance) => advance === first)
}

const DIGITS = '0123456789'
const DIGIT_CODES = [...DIGITS].map((digit) => digit.codePointAt(0) ?? 0)

function digitAdvances(face: Uint8Array): number[] | undefined {
  const view = new DataView(face.buffer, face.byteOffset, face.byteLength)
  const directory = tableDirectory(view)
  if (!directory) return undefined
  const cmap = directory.get('cmap')
  const hhea = directory.get('hhea')
  const hmtx = directory.get('hmtx')
  if (cmap === undefined || hhea === undefined || hmtx === undefined) return undefined

  const glyphs = characterMap(view, cmap, DIGIT_CODES)
  if (!glyphs) return undefined
  const longMetrics = safeUint16(view, hhea + 34)
  if (longMetrics === undefined || longMetrics === 0) return undefined

  const advances: number[] = []
  for (const digit of DIGITS) {
    const glyph = glyphs.get(digit.codePointAt(0) ?? 0)
    if (glyph === undefined) return undefined
    const advance = safeUint16(view, hmtx + Math.min(glyph, longMetrics - 1) * 4)
    if (advance === undefined) return undefined
    advances.push(advance)
  }
  return advances
}
