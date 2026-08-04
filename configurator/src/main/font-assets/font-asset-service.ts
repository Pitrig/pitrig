import { dialog, type BrowserWindow, type OpenDialogOptions } from 'electron'
import { randomUUID } from 'node:crypto'
import { basename, extname } from 'node:path'

import {
  FONT_FAMILY_PATTERN,
  MAXIMUM_FONT_ASSETS,
  MAXIMUM_FONT_SIZE_PX,
  type FontAssetError,
  type FontAssetResult,
  type FontSourceSelection,
  type FontUploadProgress,
  type FontUploadRequest
} from '../../shared/font-assets'
import { DeviceService } from '../device/device-service'
import { convertFont } from './font-converter'
import { buildFontPackage, type ConvertedFontAsset } from './font-package'

interface SourceRecord extends FontSourceSelection {
  path: string
}

export class FontAssetService {
  private readonly sources = new Map<string, SourceRecord>()
  private activeOperation: AbortController | undefined

  constructor(
    private readonly deviceService: DeviceService,
    private readonly onProgress: (progress: FontUploadProgress) => void
  ) {}

  async selectSource(owner?: BrowserWindow): Promise<FontAssetResult<FontSourceSelection | null>> {
    const options: OpenDialogOptions = {
      title: 'Select font source',
      buttonLabel: 'Select font',
      properties: ['openFile'],
      filters: [{ name: 'OpenType fonts', extensions: ['ttf', 'otf'] }]
    }
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled) return success(null)
    const path = result.filePaths[0]
    if (!path || !['.ttf', '.otf'].includes(extname(path).toLowerCase())) {
      return failure('invalid_request', 'Select a TTF or OTF font file.')
    }
    const source: SourceRecord = { id: randomUUID(), name: basename(path), path }
    this.sources.set(source.id, source)
    return success({ id: source.id, name: source.name })
  }

  async upload(request: FontUploadRequest): Promise<FontAssetResult<void>> {
    if (this.activeOperation) {
      return failure('busy', 'A font conversion or upload is already running.')
    }
    const validationError = this.validateRequest(request)
    if (validationError) return { ok: false, error: validationError }

    const deviceSession = this.deviceService.getState().session
    const fontInfo = deviceSession?.fontAssets
    if (!fontInfo) {
      return failure(
        'unsupported_firmware',
        'The connected firmware does not support font asset upload.'
      )
    }
    if (!fontInfo.storageAvailable) {
      return failure('device_error', 'Font asset storage is unavailable on this device.')
    }
    if (fontInfo.rebootRequired) {
      return failure('device_error', 'Restart the device before uploading another font package.')
    }
    const operation = new AbortController()
    this.activeOperation = operation
    let stage: 'converting' | 'building' | 'uploading' = 'converting'
    try {
      const converted: ConvertedFontAsset[] = []
      for (let index = 0; index < request.assets.length; ++index) {
        operation.signal.throwIfAborted()
        const asset = request.assets[index]
        if (!asset) continue
        const source = this.sources.get(asset.sourceId)
        if (!source) {
          return failure('source_missing', `Font source for ${asset.family} is no longer available.`)
        }
        this.onProgress({
          stage: 'converting',
          completed: index,
          total: request.assets.length,
          message: `Converting ${source.name} at ${asset.sizePx}px`
        })
        const bytes = await convertFont(source.path, asset.sizePx, operation.signal)
        converted.push({
          family: asset.family,
          sizePx: asset.sizePx,
          bytes
        })
        this.onProgress({
          stage: 'converting',
          completed: index + 1,
          total: request.assets.length,
          message: `Converted ${source.name} at ${asset.sizePx}px: ${bytes.byteLength} bytes`
        })
      }

      stage = 'building'
      this.onProgress({
        stage: 'building',
        completed: converted.length,
        total: converted.length,
        message: `Building one font package from ${converted.length} converted font assets`
      })
      const packageBytes = buildFontPackage(converted)
      this.onProgress({
        stage: 'building',
        completed: packageBytes.byteLength,
        total: packageBytes.byteLength,
        message: `Built font package: ${packageBytes.byteLength} bytes`
      })

      stage = 'uploading'
      if (this.deviceService.getState().session !== deviceSession) {
        throw new Error('The connected device changed during font conversion.')
      }
      await this.deviceService.uploadFonts(packageBytes, this.onProgress, operation.signal)
      this.onProgress({
        stage: 'completed',
        completed: packageBytes.byteLength,
        total: packageBytes.byteLength,
        message: 'Font package committed. Restart the device to activate it.'
      })
      return success(undefined)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown font asset error.'
      if (operation.signal.aborted) {
        this.onProgress({ stage: 'cancelled', completed: 0, total: 0, message: 'Font upload cancelled.' })
        return failure('cancelled', 'Font upload was cancelled.')
      }
      this.onProgress({ stage: 'error', completed: 0, total: 0, message })
      if (message.includes('2 MiB')) return failure('package_too_large', message)
      return failure(stage === 'converting' ? 'conversion_failed' : 'device_error', message)
    } finally {
      if (this.activeOperation === operation) this.activeOperation = undefined
    }
  }

  cancel(): FontAssetResult<void> {
    if (!this.activeOperation) return success(undefined)
    this.activeOperation.abort()
    return success(undefined)
  }

  private validateRequest(request: FontUploadRequest): FontAssetError | undefined {
    if (!Array.isArray(request.assets) || request.assets.length > MAXIMUM_FONT_ASSETS) {
      return { code: 'invalid_request', message: `At most ${MAXIMUM_FONT_ASSETS} fonts can be uploaded.` }
    }
    const keys = new Set<string>()
    for (const asset of request.assets) {
      if (
        !asset || typeof asset.sourceId !== 'string' || !this.sources.has(asset.sourceId) ||
        typeof asset.family !== 'string' || !FONT_FAMILY_PATTERN.test(asset.family) ||
        !Number.isInteger(asset.sizePx) || asset.sizePx < 1 || asset.sizePx > MAXIMUM_FONT_SIZE_PX
      ) {
        return { code: 'invalid_request', message: 'The font upload request is invalid.' }
      }
      const key = `${asset.family}:${asset.sizePx}`
      if (keys.has(key)) {
        return { code: 'invalid_request', message: `Duplicate font asset: ${asset.family} ${asset.sizePx}px.` }
      }
      keys.add(key)
    }
    return undefined
  }
}

function success<T>(value: T): FontAssetResult<T> {
  return { ok: true, value }
}

function failure<T>(code: FontAssetError['code'], message: string): FontAssetResult<T> {
  return { ok: false, error: { code, message } }
}
