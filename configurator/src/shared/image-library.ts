import {
  MAXIMUM_IMAGES,
  MAXIMUM_IMAGE_PACKAGE_SIZE,
  storedImagePackageSize,
  type ImageAssetInput,
  type ImageAssetState,
  type ImageColorFormat,
  type InstalledImage
} from './image-assets'

export const IMAGE_LIBRARY_LIST_CHANNEL = 'image-library:list' as const
export const IMAGE_LIBRARY_ADD_CHANNEL = 'image-library:add' as const
export const IMAGE_LIBRARY_REMOVE_CHANNEL = 'image-library:remove' as const
export const IMAGE_LIBRARY_CHANGED_CHANNEL = 'image-library:changed' as const

export const IMAGE_LIBRARY_FORMAT = 'pitrig-image-library' as const
export const IMAGE_LIBRARY_FORMAT_VERSION = 1
export const MAXIMUM_INSTALLED_RECORDS = 16

export interface ImageLibraryEntry {
  id: string
  width: number
  height: number
  frameCount: number
  format: ImageColorFormat
  storedBytes: number
  sha256: string
  updatedAt: number
}

export interface InstalledImageRecord {
  id: string
  width: number
  height: number
  format: ImageColorFormat
  frameCount: number
  sha256: string
}

export interface InstalledPackageRecord {
  size: number
  images: InstalledImageRecord[]
  installedAt: number
}

export interface ImageLibrarySnapshot {
  entries: ImageLibraryEntry[]
  installed: InstalledPackageRecord[]
  unreadable: number
}

export interface ImageLibraryAddRequest {
  assets: ImageAssetInput[]
}

export interface ImageLibraryIdRequest {
  id: string
}

export const EMPTY_IMAGE_LIBRARY: ImageLibrarySnapshot = { entries: [], installed: [], unreadable: 0 }

export type ImageDeliveryBlocker =
  | 'no_storage'
  | 'unavailable'
  | 'board_only'
  | 'too_many'
  | 'too_large'

export interface ImageDeliveryPlan {
  needed: string[]
  missingOnBoard: string[]
  notOnPc: string[]
  unavailable: string[]
  differing: string[]
  packageSize: number
  install: boolean
  blocker?: ImageDeliveryBlocker
}

export function planImageDelivery(input: {
  needed: readonly string[]
  library: readonly ImageLibraryEntry[]
  board: ImageAssetState | undefined
  installed: readonly InstalledPackageRecord[]
}): ImageDeliveryPlan {
  const needed = [...new Set(input.needed)].sort()
  const byId = new Map(input.library.map((entry) => [entry.id, entry]))
  const onBoard = new Map((input.board?.images ?? []).map((image) => [image.name, image]))
  const notOnPc = needed.filter((id) => !byId.has(id))
  const missingOnBoard = needed.filter((id) => !onBoard.has(id))
  const unavailable = notOnPc.filter((id) => !onBoard.has(id))
  const hashes = boardImageHashes(input.board, input.installed)
  const differing = needed.filter((id) => {
    const entry = byId.get(id)
    const installed = onBoard.get(id)
    if (!entry || !installed) return false
    if (!sameGeometry(entry, installed)) return true
    const known = hashes?.get(id)
    return known !== undefined && known !== entry.sha256
  })
  const packageSize = storedImagePackageSize(
    needed.map((id) => byId.get(id)?.storedBytes ?? 0)
  )
  const plan = { needed, missingOnBoard, notOnPc, unavailable, differing, packageSize }
  const board = input.board
  if (needed.length === 0) return { ...plan, install: false }
  if (!board?.storageAvailable) return { ...plan, install: false, blocker: 'no_storage' }
  if (unavailable.length > 0) return { ...plan, install: false, blocker: 'unavailable' }
  if (notOnPc.length > 0) {
    const stale = missingOnBoard.length > 0 || differing.length > 0
    return stale ? { ...plan, install: false, blocker: 'board_only' } : { ...plan, install: false }
  }
  if (needed.length > MAXIMUM_IMAGES) return { ...plan, install: false, blocker: 'too_many' }
  if (packageSize > MAXIMUM_IMAGE_PACKAGE_SIZE) {
    return { ...plan, install: false, blocker: 'too_large' }
  }
  if (board.rebootRequired || missingOnBoard.length > 0 || differing.length > 0) {
    return { ...plan, install: true }
  }
  if (hashes) {
    return { ...plan, install: !needed.every((id) => hashes.get(id) === byId.get(id)?.sha256) }
  }
  return { ...plan, install: board.packageSize !== packageSize }
}

export function boardImageHashes(
  board: ImageAssetState | undefined,
  installed: readonly InstalledPackageRecord[]
): Map<string, string> | undefined {
  if (!board?.packageAvailable || board.rebootRequired) return undefined
  const reported = boardSignature(board.images)
  const matches = installed.filter(
    (record) => record.size === board.packageSize && recordSignature(record) === reported
  )
  const first = matches[0]
  if (!first) return undefined
  const hashes = new Map(first.images.map((image) => [image.id, image.sha256]))
  const consistent = matches.every((record) =>
    record.images.every((image) => hashes.get(image.id) === image.sha256)
  )
  return consistent ? hashes : undefined
}

export function sameGeometry(
  entry: Pick<ImageLibraryEntry, 'width' | 'height' | 'format' | 'frameCount'>,
  installed: InstalledImage
): boolean {
  return (
    entry.width === installed.width &&
    entry.height === installed.height &&
    entry.format === installed.format &&
    entry.frameCount === installed.frameCount
  )
}

function boardSignature(images: readonly InstalledImage[]): string {
  return images
    .map((image) => `${image.name}:${image.width}x${image.height}:${image.format}:${image.frameCount}`)
    .sort()
    .join(';')
}

function recordSignature(record: InstalledPackageRecord): string {
  return record.images
    .map((image) => `${image.id}:${image.width}x${image.height}:${image.format}:${image.frameCount}`)
    .sort()
    .join(';')
}
