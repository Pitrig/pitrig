import {
  FONT_FAMILY_PATTERN,
  MAXIMUM_FONT_ASSETS,
  MAXIMUM_FONT_PACKAGE_SIZE,
  MAXIMUM_FONT_SIZE_PX
} from '../../shared/font-assets'

const HEADER_SIZE = 32
const MANIFEST_ENTRY_SIZE = 48
const ASSET_DATA_OFFSET = 4096
const FORMAT_VERSION = 2

export interface ConvertedFontAsset {
  family: string
  sizePx: number
  bytes: Uint8Array
}

export function buildFontPackage(assets: ConvertedFontAsset[]): Uint8Array {
  const ordered = [...assets].sort(
    (left, right) => left.family.localeCompare(right.family) || left.sizePx - right.sizePx
  )
  validateAssets(ordered)

  const placements: Array<{ asset: ConvertedFontAsset; offset: number }> = []
  let packageSize = ASSET_DATA_OFFSET
  for (const asset of ordered) {
    packageSize = align4(packageSize)
    placements.push({ asset, offset: packageSize })
    packageSize += asset.bytes.byteLength
  }
  if (packageSize > MAXIMUM_FONT_PACKAGE_SIZE) {
    throw new Error('The converted font package exceeds the 2 MiB device limit.')
  }

  const output = new Uint8Array(packageSize)
  const view = new DataView(output.buffer)
  output.set(new TextEncoder().encode('SCFA'), 0)
  view.setUint16(4, FORMAT_VERSION, true)
  view.setUint16(6, HEADER_SIZE, true)
  view.setUint32(8, 0, true)
  view.setUint16(12, ordered.length, true)
  view.setUint16(14, 0, true)
  view.setUint32(16, packageSize, true)

  const encoder = new TextEncoder()
  for (let index = 0; index < placements.length; ++index) {
    const placement = placements[index]
    if (!placement) continue
    const entryOffset = HEADER_SIZE + index * MANIFEST_ENTRY_SIZE
    output.set(encoder.encode(placement.asset.family), entryOffset)
    view.setUint16(entryOffset + 32, placement.asset.sizePx, true)
    view.setUint16(entryOffset + 34, 0, true)
    view.setUint32(entryOffset + 36, placement.offset, true)
    view.setUint32(entryOffset + 40, placement.asset.bytes.byteLength, true)
    view.setUint32(entryOffset + 44, crc32(placement.asset.bytes), true)
    output.set(placement.asset.bytes, placement.offset)
  }

  const manifest = output.subarray(HEADER_SIZE, HEADER_SIZE + ordered.length * MANIFEST_ENTRY_SIZE)
  view.setUint32(20, crc32(manifest), true)
  view.setUint32(24, crc32(output.subarray(ASSET_DATA_OFFSET)), true)
  view.setUint32(28, crc32(output.subarray(0, 28)), true)
  return output
}

export function crc32(bytes: Uint8Array): number {
  const table = [
    0x00000000, 0x1db71064, 0x3b6e20c8, 0x26d930ac,
    0x76dc4190, 0x6b6b51f4, 0x4db26158, 0x5005713c,
    0xedb88320, 0xf00f9344, 0xd6d6a3e8, 0xcb61b38c,
    0x9b64c2b0, 0x86d3d2d4, 0xa00ae278, 0xbdbdf21c
  ] as const
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    crc = (crc >>> 4) ^ (table[crc & 0x0f] ?? 0)
    crc = (crc >>> 4) ^ (table[crc & 0x0f] ?? 0)
  }
  return (~crc) >>> 0
}

function validateAssets(assets: ConvertedFontAsset[]): void {
  if (assets.length > MAXIMUM_FONT_ASSETS) {
    throw new Error(`A font package supports at most ${MAXIMUM_FONT_ASSETS} assets.`)
  }
  if (HEADER_SIZE + assets.length * MANIFEST_ENTRY_SIZE > ASSET_DATA_OFFSET) {
    throw new Error('The font package manifest exceeds its reserved area.')
  }
  const keys = new Set<string>()
  for (const asset of assets) {
    if (!FONT_FAMILY_PATTERN.test(asset.family)) {
      throw new Error(`Invalid font family: ${asset.family}`)
    }
    if (!Number.isInteger(asset.sizePx) || asset.sizePx < 1 || asset.sizePx > MAXIMUM_FONT_SIZE_PX) {
      throw new Error(`Invalid font size: ${asset.sizePx}`)
    }
    if (asset.bytes.byteLength === 0) {
      throw new Error(`Font ${asset.family} ${asset.sizePx}px is empty.`)
    }
    const key = `${asset.family}:${asset.sizePx}`
    if (keys.has(key)) {
      throw new Error(`Duplicate font asset: ${asset.family} ${asset.sizePx}px.`)
    }
    keys.add(key)
  }
}

function align4(value: number): number {
  return (value + 3) & ~3
}
