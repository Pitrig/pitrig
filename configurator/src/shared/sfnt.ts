export function tableDirectory(view: DataView): Map<string, number> | undefined {
  const tag = safeUint32(view, 0)
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

export function characterMap(
  view: DataView,
  cmap: number,
  codes: number[]
): Map<number, number> | undefined {
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
  if (format === 4) return parseFormat4(view, chosen, codes)
  if (format === 12) return parseFormat12(view, chosen, codes)
  return undefined
}

function subtableScore(platform: number, encoding: number): number {
  if (platform === 3 && encoding === 10) return 3
  if (platform === 0 && (encoding === 4 || encoding === 6)) return 2
  if (platform === 3 && encoding === 1) return 1
  if (platform === 0) return 0
  return -1
}

function parseFormat4(
  view: DataView,
  table: number,
  codes: number[]
): Map<number, number> | undefined {
  const segmentBytes = safeUint16(view, table + 6)
  if (segmentBytes === undefined) return undefined
  const segments = segmentBytes / 2
  const ends = table + 14
  const starts = ends + segmentBytes + 2
  const deltas = starts + segmentBytes
  const ranges = deltas + segmentBytes
  const glyphs = new Map<number, number>()
  for (const code of codes) {
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

function parseFormat12(
  view: DataView,
  table: number,
  codes: number[]
): Map<number, number> | undefined {
  const groups = safeUint32(view, table + 12)
  if (groups === undefined) return undefined
  const glyphs = new Map<number, number>()
  for (let index = 0; index < groups; ++index) {
    const group = table + 16 + index * 12
    const start = safeUint32(view, group)
    const end = safeUint32(view, group + 4)
    const glyph = safeUint32(view, group + 8)
    if (start === undefined || end === undefined || glyph === undefined) return undefined
    for (const code of codes) {
      if (code >= start && code <= end) glyphs.set(code, glyph + (code - start))
    }
  }
  return glyphs
}

export function safeUint16(view: DataView, offset: number): number | undefined {
  return offset + 2 <= view.byteLength ? view.getUint16(offset, false) : undefined
}

function safeInt16(view: DataView, offset: number): number | undefined {
  return offset + 2 <= view.byteLength ? view.getInt16(offset, false) : undefined
}

export function safeUint32(view: DataView, offset: number): number | undefined {
  return offset + 4 <= view.byteLength ? view.getUint32(offset, false) : undefined
}
