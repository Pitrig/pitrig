import { type BrowserWindow } from 'electron'
import { readFile } from 'node:fs/promises'

import {
  FONT_FAMILY_PATTERN,
  MAXIMUM_FONT_FAMILIES,
  type FontAssetError,
  type FontAssetResult,
  type FontSourceSelection,
  type FontUploadProgress,
  type FontUploadRequest
} from '../../shared/font-assets'
import {
  AssetServiceBase,
  failure,
  success,
  type AssetKind,
  type SourceRecord
} from '../assets/asset-service-base'
import { PreviewAssetCache } from '../assets/preview-asset-cache'
import { DeviceService } from '../device/device-service'
import { buildFontPackage, type FontFamilyAsset } from './font-package'

const kFonts: AssetKind = {
  sessionKey: 'fontAssets',
  dialogTitle: 'Select font source',
  dialogButton: 'Select font',
  filters: [{ name: 'OpenType fonts', extensions: ['ttf', 'otf'] }],
  extensions: ['.ttf', '.otf'],
  wrongExtension: 'Select a TTF or OTF font file.',
  busy: 'A font upload is already running.',
  unsupported: 'The connected firmware does not support font asset upload.',
  storageUnavailable: 'Font asset storage is unavailable on this device.',
  rebootRequired: 'Restart the device before uploading another font package.'
}

export class FontAssetService extends AssetServiceBase {
  constructor(
    deviceService: DeviceService,
    private readonly onProgress: (progress: FontUploadProgress) => void,
    private readonly previewAssets: PreviewAssetCache
  ) {
    super(deviceService, kFonts)
  }

  async selectSource(owner?: BrowserWindow): Promise<FontAssetResult<FontSourceSelection | null>> {
    const chosen = await this.chooseSource(owner)
    if (!chosen.ok) return chosen
    if (chosen.value === null) return success(null)
    const source: SourceRecord = chosen.value
    this.sources.set(source.id, source)
    return success({ id: source.id, name: source.name })
  }

  async upload(request: FontUploadRequest): Promise<FontAssetResult<void>> {
    const blocked = this.preflight()
    if (blocked) return blocked
    const validationError = this.validateRequest(request)
    if (validationError) return { ok: false, error: validationError }
    const deviceSession = this.deviceService.getState().session

    const operation = new AbortController()
    this.activeOperation = operation
    let stage: 'reading' | 'building' | 'uploading' = 'reading'
    try {
      const faces: FontFamilyAsset[] = []
      for (let index = 0; index < request.assets.length; ++index) {
        operation.signal.throwIfAborted()
        const asset = request.assets[index]
        if (!asset) continue
        const source = this.sources.get(asset.sourceId)
        if (!source) {
          return failure('source_missing', `Font source for ${asset.family} is no longer available.`)
        }
        this.onProgress({
          stage: 'reading',
          completed: index,
          total: request.assets.length,
          message: `Reading ${source.name}`
        })
        const bytes = new Uint8Array(await readFile(source.path))
        faces.push({ family: asset.family, bytes })
        this.onProgress({
          stage: 'reading',
          completed: index + 1,
          total: request.assets.length,
          message: `Read ${source.name}: ${bytes.byteLength} bytes`
        })
      }

      stage = 'building'
      this.onProgress({
        stage: 'building',
        completed: faces.length,
        total: faces.length,
        message: `Building one font package from ${faces.length} font families`
      })
      const packageBytes = buildFontPackage(faces)
      this.onProgress({
        stage: 'building',
        completed: packageBytes.byteLength,
        total: packageBytes.byteLength,
        message: `Built font package: ${packageBytes.byteLength} bytes`
      })

      stage = 'uploading'
      if (this.deviceService.getState().session !== deviceSession) {
        throw new Error('The connected device changed while the package was built.')
      }
      await this.deviceService.uploadFonts(packageBytes, this.onProgress, operation.signal)
      // The board keeps no readable copy of a face, so this is the only chance
      // to keep one for the preview. A cache write that fails costs fidelity,
      // never the upload that already succeeded.
      await this.previewAssets.storeFonts(faces).catch(() => undefined)
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
      return failure(stage === 'reading' ? 'source_unreadable' : 'device_error', message)
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
    if (!Array.isArray(request.assets) || request.assets.length > MAXIMUM_FONT_FAMILIES) {
      return {
        code: 'invalid_request',
        message: `At most ${MAXIMUM_FONT_FAMILIES} font families can be uploaded.`
      }
    }
    const families = new Set<string>()
    for (const asset of request.assets) {
      if (
        !asset || typeof asset.sourceId !== 'string' || !this.sources.has(asset.sourceId) ||
        typeof asset.family !== 'string' || !FONT_FAMILY_PATTERN.test(asset.family)
      ) {
        return { code: 'invalid_request', message: 'The font upload request is invalid.' }
      }
      if (families.has(asset.family)) {
        return { code: 'invalid_request', message: `Duplicate font family: ${asset.family}.` }
      }
      families.add(asset.family)
    }
    return undefined
  }
}
