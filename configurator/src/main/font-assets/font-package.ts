import { crc32 } from '../device/asset-crc'
import {
  FONT_FAMILY_PATTERN,
  MAXIMUM_FONT_FAMILIES,
  MAXIMUM_FONT_PACKAGE_SIZE
} from '../../shared/font-assets'
import { t } from '@shared/ui-text'
import { PackageTooLargeError } from '../assets/asset-service-base'

const HEADER_SIZE = 32
const MANIFEST_ENTRY_SIZE = 48
const ASSET_DATA_OFFSET = 4096
const FORMAT_VERSION = 3
const MINIMUM_FACE_SIZE = 128
const SFNT_SIGNATURES = [0x00010000, 0x4f54544f, 0x74727565, 0x74746366] as const

export interface FontFamilyAsset {
  family: string
  bytes: Uint8Array
}

export interface BuiltFontPackage {
  bytes: Uint8Array
  payloadCrc: number
  families: string[]
}

export function buildFontPackage(assets: FontFamilyAsset[]): BuiltFontPackage {
  const ordered = [...assets].sort((left, right) =>
    left.family < right.family ? -1 : left.family > right.family ? 1 : 0
  )
  validateAssets(ordered)

  const placements: Array<{ asset: FontFamilyAsset; offset: number }> = []
  let packageSize = ASSET_DATA_OFFSET
  for (const asset of ordered) {
    packageSize = align4(packageSize)
    placements.push({ asset, offset: packageSize })
    packageSize += asset.bytes.byteLength
  }
  if (packageSize > MAXIMUM_FONT_PACKAGE_SIZE) {
    throw new PackageTooLargeError(t('fonts.fontPackage.theFontPackageExceedsThe'))
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
    view.setUint32(entryOffset + 32, 0, true)
    view.setUint32(entryOffset + 36, placement.offset, true)
    view.setUint32(entryOffset + 40, placement.asset.bytes.byteLength, true)
    view.setUint32(entryOffset + 44, crc32(placement.asset.bytes), true)
    output.set(placement.asset.bytes, placement.offset)
  }

  const manifest = output.subarray(HEADER_SIZE, HEADER_SIZE + ordered.length * MANIFEST_ENTRY_SIZE)
  const payloadCrc = crc32(output.subarray(ASSET_DATA_OFFSET))
  view.setUint32(20, crc32(manifest), true)
  view.setUint32(24, payloadCrc, true)
  view.setUint32(28, crc32(output.subarray(0, 28)), true)
  return { bytes: output, payloadCrc, families: ordered.map((asset) => asset.family) }
}


function validateAssets(assets: FontFamilyAsset[]): void {
  if (assets.length > MAXIMUM_FONT_FAMILIES) {
    throw new Error(t('fonts.fontPackage.aFontPackageSupportsAt', { mAXIMUM_FONT_FAMILIES: MAXIMUM_FONT_FAMILIES }))
  }
  if (HEADER_SIZE + assets.length * MANIFEST_ENTRY_SIZE > ASSET_DATA_OFFSET) {
    throw new Error(t('fonts.fontPackage.theFontPackageManifestExceeds'))
  }
  const families = new Set<string>()
  for (const asset of assets) {
    if (!FONT_FAMILY_PATTERN.test(asset.family)) {
      throw new Error(t('fonts.fontPackage.invalidFontFamilyFamily', { family: asset.family }))
    }
    if (asset.bytes.byteLength < MINIMUM_FACE_SIZE || !isFontFace(asset.bytes)) {
      throw new Error(t('fonts.fontPackage.familyIsNotATtf', { family: asset.family }))
    }
    if (families.has(asset.family)) {
      throw new Error(t('fonts.fontPackage.duplicateFontFamilyFamily', { family: asset.family }))
    }
    families.add(asset.family)
  }
}

function isFontFace(bytes: Uint8Array): boolean {
  const signature = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, false)
  return SFNT_SIGNATURES.some((candidate) => candidate === signature)
}

function align4(value: number): number {
  return (value + 3) & ~3
}

export function readPackageFamilies(packageBytes: Uint8Array): string[] {
  const view = new DataView(packageBytes.buffer, packageBytes.byteOffset, packageBytes.byteLength)
  const count = view.getUint16(12, true)
  const decoder = new TextDecoder('ascii')
  return Array.from({ length: count }, (_, index) => {
    const offset = HEADER_SIZE + index * MANIFEST_ENTRY_SIZE
    const familyBytes = packageBytes.subarray(offset, offset + 32)
    const terminator = familyBytes.indexOf(0)
    return decoder.decode(familyBytes.subarray(0, terminator < 0 ? 32 : terminator))
  })
}
