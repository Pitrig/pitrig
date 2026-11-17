import { nativeImage, type BrowserWindow } from 'electron'
import { basename } from 'node:path'

import type { AssetError, AssetResult, AssetUploadProgress } from '../../shared/asset-upload'
import {
  IMAGE_ID_PATTERN,
  MAXIMUM_IMAGES,
  type ImageAssetInput,
  type ImageSourceSelection,
  type ImageUploadRequest
} from '../../shared/image-assets'
import type { ImageLibraryEntry } from '../../shared/image-library'
import {
  AssetServiceBase,
  failure,
  success,
  type AssetKind
} from '../assets/asset-service-base'
import { DeviceService } from '../device/device-service'
import type { ImageLibraryService } from '../image-library/image-library-service'
import { hasTransparency } from './image-pixels'
import {
  buildImagePackage,
  convertImage,
  packageImage,
  type ConvertedImage,
  type PackageImage
} from './image-package'
import { t } from '@shared/ui-text'

const THUMBNAIL_EDGE_PX = 192

const kImages: AssetKind = {
  sessionKey: 'imageAssets',
  dialogTitle: t('images.imageAssetService.selectImageSource'),
  dialogButton: t('firmware.firmwareUpdateService.selectImage'),
  filters: [{ name: t('images.dialog.filter'), extensions: ['png', 'jpg', 'jpeg', 'bmp'] }],
  extensions: ['.png', '.jpg', '.jpeg', '.bmp'],
  wrongExtension: t('images.imageAssetService.selectAPngJpegOr'),
  busy: t('images.imageAssetService.anImageUploadIsAlready'),
  unsupported: t('images.imageAssetService.theConnectedFirmwareDoesNot'),
  storageUnavailable: t('images.imageAssetService.imageStorageIsUnavailableOn'),
  rebootRequired: t('images.imageAssetService.restartTheDeviceBeforeUploading')
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

export class ImageAssetService extends AssetServiceBase {
  constructor(
    deviceService: DeviceService,
    private readonly library: ImageLibraryService
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
      return failure('source_unreadable', t('images.imageAssetService.pathCouldNotBeRead', { path: basename(path) }))
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

  async addToLibrary(assets: readonly ImageAssetInput[]): Promise<AssetResult<ImageLibraryEntry[]>> {
    const invalid = validateNames(assets, Number.POSITIVE_INFINITY)
    if (invalid) return { ok: false, error: invalid }
    try {
      const converted = this.convert(assets)
      if (!converted.ok) return converted
      return success(await this.library.add(converted.value))
    } catch (error) {
      return failure(
        'invalid_request',
        error instanceof Error ? error.message : t('images.imageLibrary.notAdded')
      )
    }
  }

  async upload(
    request: ImageUploadRequest,
    report: (progress: AssetUploadProgress) => void = () => undefined
  ): Promise<AssetResult<void>> {
    const invalid = validateNames(request.assets, MAXIMUM_IMAGES)
    if (invalid) return { ok: false, error: invalid }
    report({
      stage: 'reading',
      completed: 0,
      total: 0,
      message: t('images.imageAssetService.readingImageSources')
    })
    try {
      const converted = this.convert(request.assets)
      if (!converted.ok) return failed(report, converted.error.code, converted.error.message)
      const packaged = await Promise.all(converted.value.map((image) => packageImage(image)))
      return await this.install(packaged, report)
    } catch (error) {
      return failed(
        report,
        'invalid_request',
        error instanceof Error ? error.message : t('images.imageLibrary.notAdded')
      )
    }
  }

  async install(
    images: readonly PackageImage[],
    report: (progress: AssetUploadProgress) => void
  ): Promise<AssetResult<void>> {
    const blocked = this.preflight()
    if (blocked) return blocked
    const session = this.deviceService.getState().session
    const operation = new AbortController()
    this.activeOperation = operation
    try {
      report({
        stage: 'building',
        completed: 0,
        total: 0,
        message: t('images.imageAssetService.buildingTheImagePackage')
      })
      const packageBytes = buildImagePackage(images)
      if (this.deviceService.getState().session !== session) {
        throw new Error(t('images.imageAssetService.theConnectedDeviceChangedDuring'))
      }
      await this.deviceService.uploadImages(
        packageBytes,
        report,
        operation.signal,
        images.map(({ name, width, height, format, frameCount }) => ({
          name,
          width,
          height,
          format,
          frameCount
        }))
      )
      await this.library.recordInstalled(images, packageBytes.byteLength).catch(() => undefined)
      report({
        stage: 'completed',
        completed: packageBytes.byteLength,
        total: packageBytes.byteLength,
        message: t('images.imageAssetService.imagesInstalledRestartTheDevice')
      })
      return success(undefined)
    } catch (error) {
      const cancelled = operation.signal.aborted
      const message =
        error instanceof Error ? error.message : 'The image upload failed for an unknown reason.'
      report({ stage: cancelled ? 'cancelled' : 'error', completed: 0, total: 0, message })
      return failure(cancelled ? 'cancelled' : 'device_error', message)
    } finally {
      this.release(operation)
    }
  }

  private convert(assets: readonly ImageAssetInput[]): AssetResult<ConvertedImage[]> {
    const converted: ConvertedImage[] = []
    for (const asset of assets) {
      const paths: string[] = []
      for (const sourceId of asset.sourceIds) {
        const source = this.sources.get(sourceId)
        if (!source) {
          return failure('source_missing', t('images.imageAssetService.selectTheImageFileAgain'))
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
    return success(converted)
  }

}

function failed<T>(
  report: (progress: AssetUploadProgress) => void,
  code: AssetError['code'],
  message: string
): AssetResult<T> {
  report({ stage: 'error', completed: 0, total: 0, message })
  return failure(code, message)
}

function validateNames(assets: readonly ImageAssetInput[], maximum: number): AssetError | undefined {
  if (!Array.isArray(assets) || assets.length === 0) {
    return { code: 'invalid_request', message: t('images.imageAssetService.selectAtLeastOneImage') }
  }
  if (assets.length > maximum) {
    return {
      code: 'invalid_request',
      message: t('images.imageAssetService.theDeviceStoresAtMost', { mAXIMUM_IMAGES: MAXIMUM_IMAGES })
    }
  }
  const names = new Set<string>()
  for (const asset of assets) {
    if (!IMAGE_ID_PATTERN.test(asset.name)) {
      return {
        code: 'invalid_request',
        message: t('images.imageAssetService.nameIsNotAValid', { name: asset.name })
      }
    }
    if (names.has(asset.name)) {
      return { code: 'invalid_request', message: t('images.imageAssetService.imageNameIsListedTwice', { name: asset.name }) }
    }
    names.add(asset.name)
  }
  return undefined
}
