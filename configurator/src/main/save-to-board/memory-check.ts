import { BOARD_PROFILES, type DeviceSession } from '../../shared/device'
import { documentImageIds } from '../../shared/document-assets'
import { FONT_PACKAGE_DATA_OFFSET } from '../../shared/font-library'
import {
  alignImageOffset,
  imageAssetBytes,
  IMAGE_COLOR_FORMATS,
  type InstalledImage
} from '../../shared/image-assets'
import type { ImageDeliveryPlan, ImageLibraryEntry } from '../../shared/image-library'
import type { BuiltFontPackage } from '../font-assets/font-package'
import type { ImageLibraryService } from '../image-library/image-library-service'
import { stepFailure, type SaveStep } from './save-results'
import { t } from '@shared/ui-text'

type DecodedImage = Pick<ImageLibraryEntry, 'width' | 'height' | 'format' | 'frameCount'>

export async function fitsBoardMemory(input: {
  session: DeviceSession
  fontPackage: BuiltFontPackage | undefined
  images: ImageDeliveryPlan | undefined
  library: ImageLibraryService
}): Promise<SaveStep<void>> {
  const available = BOARD_PROFILES[input.session.info.boardId]?.assetMemoryBytes
  if (available === undefined) return { ok: true, value: undefined }
  const fonts = faceBytes(input.fontPackage?.bytes.byteLength ?? boardPackageSize(input.session))
  const images = await plannedImageBytes(input.session, input.images, input.library)
  const needed = fonts + images
  if (needed <= available || needed <= heldNow(input.session)) return { ok: true, value: undefined }
  return stepFailure(
    'assets_too_large',
    t('save.memoryCheck.tooLarge', {
      fonts: Math.ceil(fonts / 1024),
      images: Math.ceil(images / 1024),
      available: Math.floor(available / 1024)
    })
  )
}

function heldNow(session: DeviceSession): number {
  const onBoard = session.imageAssets?.images ?? []
  return documentImageIds(session.configuration).reduce(
    (total, id) => total + decodedBytes(boardImage(onBoard, id)),
    faceBytes(boardPackageSize(session))
  )
}

function boardPackageSize(session: DeviceSession): number {
  const installed = session.fontAssets
  return installed?.packageAvailable ? installed.packageSize : 0
}

function faceBytes(packageSize: number): number {
  return Math.max(0, packageSize - FONT_PACKAGE_DATA_OFFSET)
}

async function plannedImageBytes(
  session: DeviceSession,
  plan: ImageDeliveryPlan | undefined,
  library: ImageLibraryService
): Promise<number> {
  if (!plan) return 0
  const { entries } = await library.snapshot()
  const onBoard = session.imageAssets?.images ?? []
  return plan.needed.reduce((total, id) => {
    const fromLibrary = entries.find((candidate) => candidate.id === id)
    const fromBoard = boardImage(onBoard, id)
    return total + decodedBytes(plan.install ? (fromLibrary ?? fromBoard) : (fromBoard ?? fromLibrary))
  }, 0)
}

function boardImage(images: readonly InstalledImage[], id: string): DecodedImage | undefined {
  const image = images.find((candidate) => candidate.name === id)
  const format = IMAGE_COLOR_FORMATS.find((candidate) => candidate === image?.format)
  if (!image || !format) return undefined
  return { width: image.width, height: image.height, format, frameCount: image.frameCount }
}

function decodedBytes(image: DecodedImage | undefined): number {
  if (!image) return 0
  const frame = imageAssetBytes(image.width, image.height, image.format)
  return alignImageOffset(frame * Math.max(1, image.frameCount))
}
