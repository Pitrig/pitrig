import { nativeImage, type BrowserWindow } from 'electron'
import { basename } from 'node:path'

const THUMBNAIL_EDGE_PX = 192

import type { AssetError, AssetResult, AssetUploadProgress } from '../../shared/asset-upload'
import {
  IMAGE_ID_PATTERN,
  MAXIMUM_IMAGES,
  type ImageSourceSelection,
  type ImageUploadRequest
} from '../../shared/image-assets'
import {
  AssetServiceBase,
  failure,
  success,
  type AssetKind
} from '../assets/asset-service-base'
import { PreviewAssetCache } from '../assets/preview-asset-cache'
import { DeviceService } from '../device/device-service'
import { buildImagePackage, convertImage, type ConvertedImage } from './image-package'

const kImages: AssetKind = {
  sessionKey: 'imageAssets',
  dialogTitle: 'Select image source',
  dialogButton: 'Select image',
  filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp'] }],
  extensions: ['.png', '.jpg', '.jpeg', '.bmp'],
  wrongExtension: 'Select a PNG, JPEG or BMP image.',
  busy: 'An image upload is already running.',
  unsupported: 'The connected firmware does not support image upload.',
  storageUnavailable: 'Image storage is unavailable on this device.',
  rebootRequired: 'Restart the device before uploading another image package.'
}

interface ImageSourceRecord extends ImageSourceSelection {
  path: string
}

function thumbnailOf(
  decoded: Electron.NativeImage,
  width: number,
  height: number
): { dataUrl?: string } {
  try {
    const longest = Math.max(width, height)
    const scaled =
      longest > THUMBNAIL_EDGE_PX
        ? decoded.resize({
            width: Math.max(1, Math.round((width / longest) * THUMBNAIL_EDGE_PX)),
            height: Math.max(1, Math.round((height / longest) * THUMBNAIL_EDGE_PX)),
            quality: 'good'
          })
        : decoded
    return { dataUrl: scaled.toDataURL() }
  } catch {
    return {}
  }
}

function hasTransparency(decoded: Electron.NativeImage): boolean {
  const { width, height } = decoded.getSize()
  const bgra = decoded.toBitmap()
  const pixels = width * height
  if (bgra.byteLength < pixels * 4) return true
  for (let index = 0; index < pixels; ++index) {
    if (bgra[index * 4 + 3] !== 0xff) return true
  }
  return false
}

export class ImageAssetService extends AssetServiceBase {
  constructor(
    deviceService: DeviceService,
    private readonly onProgress: (progress: AssetUploadProgress) => void,
    private readonly previewAssets: PreviewAssetCache
  ) {
    super(deviceService, kImages)
  }

  async selectSource(owner?: BrowserWindow): Promise<AssetResult<ImageSourceSelection | null>> {
    const chosen = await this.chooseSource(owner)
    if (!chosen.ok) return chosen
    if (chosen.value === null) return success(null)
    const { id, name, path } = chosen.value
    return this.registerSource(path, { id, name, thumbnail: true })
  }

  registerSource(
    path: string,
    options: { id: string; name: string; thumbnail?: boolean }
  ): AssetResult<ImageSourceSelection> {
    const decoded = nativeImage.createFromPath(path)
    if (decoded.isEmpty()) {
      return failure('source_unreadable', `"${basename(path)}" could not be read as an image.`)
    }
    const { width, height } = decoded.getSize()
    const hasAlpha = hasTransparency(decoded)
    const { id, name } = options
    const source: ImageSourceRecord = { id, name, path, width, height, hasAlpha }
    this.sources.set(source.id, source)
    return success({
      id,
      name,
      width,
      height,
      hasAlpha,
      ...(options.thumbnail ? thumbnailOf(decoded, width, height) : {})
    })
  }

  async upload(request: ImageUploadRequest): Promise<AssetResult<void>> {
    const blocked = this.preflight()
    if (blocked) return blocked
    const validationError = this.validateRequest(request)
    if (validationError) return { ok: false, error: validationError }
    const session = this.deviceService.getState().session

    const operation = new AbortController()
    this.activeOperation = operation
    try {
      this.onProgress({
        stage: 'reading',
        completed: 0,
        total: 0,
        message: 'Reading image sources'
      })
      const converted: ConvertedImage[] = []
      for (const asset of request.assets) {
        operation.signal.throwIfAborted()
        const paths: string[] = []
        for (const sourceId of asset.sourceIds) {
          const source = this.sources.get(sourceId)
          if (!source) {
            return failure('source_missing', 'Select the image file again and retry.')
          }
          paths.push(source.path)
        }
        converted.push(
          convertImage({
            name: asset.name,
            paths,
            format: asset.format,
            width: asset.width,
            height: asset.height
          })
        )
      }

      this.onProgress({
        stage: 'building',
        completed: 0,
        total: 0,
        message: 'Building the image package'
      })
      const packageBytes = buildImagePackage(converted)

      if (this.deviceService.getState().session !== session) {
        return failure('device_error', 'The connected device changed during the upload.')
      }
      await this.deviceService.uploadImages(
        packageBytes,
        this.onProgress,
        operation.signal,
        converted.map(({ name, width, height, format, frameCount }) => ({
          name,
          width,
          height,
          format,
          frameCount
        }))
      )
      await this.previewAssets.storeImages(converted).catch(() => undefined)
      this.onProgress({
        stage: 'completed',
        completed: packageBytes.byteLength,
        total: packageBytes.byteLength,
        message: 'Images installed; restart the device to use them'
      })
      return success(undefined)
    } catch (error) {
      const cancelled = operation.signal.aborted
      const message =
        error instanceof Error ? error.message : 'The image upload failed for an unknown reason.'
      this.onProgress({
        stage: cancelled ? 'cancelled' : 'error',
        completed: 0,
        total: 0,
        message
      })
      return failure(cancelled ? 'cancelled' : 'device_error', message)
    } finally {
      if (this.activeOperation === operation) this.activeOperation = undefined
    }
  }

  cancel(): AssetResult<void> {
    this.activeOperation?.abort()
    return success(undefined)
  }

  private validateRequest(request: ImageUploadRequest): AssetError | undefined {
    if (!Array.isArray(request.assets) || request.assets.length === 0) {
      return { code: 'invalid_request', message: 'Select at least one image to upload.' }
    }
    if (request.assets.length > MAXIMUM_IMAGES) {
      return {
        code: 'invalid_request',
        message: `The device stores at most ${MAXIMUM_IMAGES} images.`
      }
    }
    const names = new Set<string>()
    for (const asset of request.assets) {
      if (!IMAGE_ID_PATTERN.test(asset.name)) {
        return {
          code: 'invalid_request',
          message: `"${asset.name}" is not a valid image name.`
        }
      }
      if (names.has(asset.name)) {
        return { code: 'invalid_request', message: `Image "${asset.name}" is listed twice.` }
      }
      names.add(asset.name)
    }
    return undefined
  }
}
