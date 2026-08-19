/**
 * Whether a face draws its ten digits at one width, read out of the face itself.
 *
 * This matters more than it looks on a dashboard: the screen is mostly numbers
 * that change several times a second, and a face with proportional digits
 * reflows the whole reading every time a 1 becomes an 8 — the value shifts
 * sideways while it is being read. The name does not tell you which kind it is.
 * Roboto is not a monospaced font and its digits are tabular; Inter is a
 * workhorse UI face and its digits are not.
 *
 * It is read from `hmtx` rather than measured in the browser because the browser
 * answers about whatever font it actually resolved — a face that failed to
 * register measures the fallback, and the fallback has tabular digits, so the
 * wrong answer is the confident-looking one. The device rasterizes these same
 * advance widths with TinyTTF and applies no OpenType features, so what is read
 * here is what the board will draw.
 */
export function hasTabularDigits(face: Uint8Array): boolean | undefined {
  const advances = digitAdvances(face)
  if (!advances) return undefined
  const first = advances[0]
  if (first === undefined) return undefined
  return advances.every((advance) => advance === first)
}

const DIGITS = '0123456789'

function digitAdvances(face: Uint8Array): number[] | undefined {
  const view = new DataView(face.buffer, face.byteOffset, face.byteLength)
  const directory = tableDirectory(view)
  if (!directory) return undefined
  const cmap = directory.get('cmap')
  const hhea = directory.get('hhea')
  const hmtx = directory.get('hmtx')
  if (cmap === undefined || hhea === undefined || hmtx === undefined) return undefined

  const glyphs = characterMap(view, cmap)
  if (!glyphs) return undefined
  // The last entry in hmtx repeats for every glyph after it, which is how a
  // monospaced face stores one advance for thousands of glyphs.
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

function tableDirectory(view: DataView): Map<string, number> | undefined {
  const tag = safeUint32(view, 0)
  // A collection holds several faces and says nothing about which one is meant.
  if (tag === undefined || tag === 0x74746366) return undefined
  const count = safeUint16(view, 4)
  if (count === undefined) return undefined
  const directory = new Map<string, number>()
  for (let index = 0; index < count; ++index) {
    const entry = 12 + index * 16
    const name = tableTag(view, entry)
    const offset = safeUint32(view, entry + 8)
    if (name === undefined || offset === undefined) return undefined
    directory.set(name, offset)
  }
  return directory
}

function tableTag(view: DataView, offset: number): string | undefined {
  if (offset + 4 > view.byteLength) return undefined
  let tag = ''
  for (let index = 0; index < 4; ++index) {
    tag += String.fromCharCode(view.getUint8(offset + index))
  }
  return tag
}

/** Unicode code point to glyph index, from the best subtable the face offers. */
function characterMap(view: DataView, cmap: number): Map<number, number> | undefined {
  const count = safeUint16(view, cmap + 2)
  if (count === undefined) return undefined
  let chosen: number | undefined
  let chosenScore = -1
  for (let index = 0; index < count; ++index) {
    const record = cmap + 4 + index * 8
    const platform = safeUint16(view, record)
    const encoding = safeUint16(view, record + 2)
    const offset = safeUint32(view, record + 4)
    if (platform === undefined || encoding === undefined || offset === undefined) continue
    const score = subtableScore(platform, encoding)
    if (score > chosenScore) {
      chosenScore = score
      chosen = cmap + offset
    }
  }
  if (chosen === undefined || chosenScore < 0) return undefined
  const format = safeUint16(view, chosen)
  if (format === 4) return parseFormat4(view, chosen)
  if (format === 12) return parseFormat12(view, chosen)
  return undefined
}

function subtableScore(platform: number, encoding: number): number {
  if (platform === 3 && encoding === 10) return 3
  if (platform === 0 && (encoding === 4 || encoding === 6)) return 2
  if (platform === 3 && encoding === 1) return 1
  if (platform === 0) return 0
  return -1
}

/** Only the digits are looked up, so both parsers resolve exactly those ten. */
function parseFormat4(view: DataView, table: number): Map<number, number> | undefined {
  const segmentBytes = safeUint16(view, table + 6)
  if (segmentBytes === undefined) return undefined
  const segments = segmentBytes / 2
  const ends = table + 14
  const starts = ends + segmentBytes + 2
  const deltas = starts + segmentBytes
  const ranges = deltas + segmentBytes
  const glyphs = new Map<number, number>()
  for (const digit of DIGITS) {
    const code = digit.codePointAt(0) ?? 0
    for (let segment = 0; segment < segments; ++segment) {
      const end = safeUint16(view, ends + segment * 2)
      const start = safeUint16(view, starts + segment * 2)
      if (end === undefined || start === undefined || code > end || code < start) continue
      const delta = safeInt16(view, deltas + segment * 2)
      const rangeOffset = safeUint16(view, ranges + segment * 2)
      if (delta === undefined || rangeOffset === undefined) return undefined
      let glyph: number | undefined
      if (rangeOffset === 0) {
        glyph = (code + delta) & 0xffff
      } else {
        const at = ranges + segment * 2 + rangeOffset + (code - start) * 2
        const found = safeUint16(view, at)
        if (found === undefined) return undefined
        glyph = found === 0 ? 0 : (found + delta) & 0xffff
      }
      if (glyph) glyphs.set(code, glyph)
      break
    }
  }
  return glyphs
}

function parseFormat12(view: DataView, table: number): Map<number, number> | undefined {
  const groups = safeUint32(view, table + 12)
  if (groups === undefined) return undefined
  const glyphs = new Map<number, number>()
  for (let index = 0; index < groups; ++index) {
    const group = table + 16 + index * 12
    const start = safeUint32(view, group)
    const end = safeUint32(view, group + 4)
    const glyph = safeUint32(view, group + 8)
    if (start === undefined || end === undefined || glyph === undefined) return undefined
    for (const digit of DIGITS) {
      const code = digit.codePointAt(0) ?? 0
      if (code >= start && code <= end) glyphs.set(code, glyph + (code - start))
    }
  }
  return glyphs
}

// A truncated or malformed face reads as "unknown" rather than throwing inside
// a listing, which is the same bargain the rest of the library makes.
function safeUint16(view: DataView, offset: number): number | undefined {
  return offset + 2 <= view.byteLength ? view.getUint16(offset, false) : undefined
}

function safeInt16(view: DataView, offset: number): number | undefined {
  return offset + 2 <= view.byteLength ? view.getInt16(offset, false) : undefined
}

function safeUint32(view: DataView, offset: number): number | undefined {
  return offset + 4 <= view.byteLength ? view.getUint32(offset, false) : undefined
}
