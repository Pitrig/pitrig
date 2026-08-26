import {
  FONT_FAMILY_PATTERN,
  MAXIMUM_FONT_FAMILIES,
  type FontAssetError,
  type FontAssetResult,
  type FontUploadProgress,
  type FontUploadRequest
} from '../../shared/font-assets'
import {
  AssetServiceBase,
  failure,
  success,
  type AssetKind
} from '../assets/asset-service-base'
import { DeviceService } from '../device/device-service'
import { FontLibraryService } from '../font-library/font-library-service'
import { buildFontPackage, type BuiltFontPackage, type FontFamilyAsset } from './font-package'

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
    private readonly library: FontLibraryService
  ) {
    super(deviceService, kFonts)
  }

  async buildPackage(families: readonly string[]): Promise<FontAssetResult<BuiltFontPackage>> {
    const invalid = validateFamilies(families)
    if (invalid) return { ok: false, error: invalid }
    const faces: FontFamilyAsset[] = []
    for (const family of families) {
      const bytes = await this.library.readFace(family)
      if (!bytes) {
        return failure('source_missing', `The font library holds no face called "${family}".`)
      }
      faces.push({ family, bytes })
    }
    try {
      return success(buildFontPackage(faces))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The font package could not be built.'
      return failure(message.includes('2 MiB') ? 'package_too_large' : 'invalid_request', message)
    }
  }

  async upload(
    request: FontUploadRequest,
    report: (progress: FontUploadProgress) => void
  ): Promise<FontAssetResult<void>> {
    const blocked = this.preflight()
    if (blocked) return blocked
    const deviceSession = this.deviceService.getState().session

    const operation = new AbortController()
    this.activeOperation = operation
    try {
      report({
        stage: 'building',
        completed: 0,
        total: request.families.length,
        message: `Building one font package from ${request.families.length} font families`
      })
      operation.signal.throwIfAborted()
      const built = await this.buildPackage(request.families)
      if (!built.ok) {
        report({ stage: 'error', completed: 0, total: 0, message: built.error.message })
        return built
      }
      const packageBytes = built.value.bytes
      report({
        stage: 'building',
        completed: packageBytes.byteLength,
        total: packageBytes.byteLength,
        message: `Built font package: ${packageBytes.byteLength} bytes`
      })

      if (this.deviceService.getState().session !== deviceSession) {
        throw new Error('The connected device changed while the package was built.')
      }
      await this.deviceService.uploadFonts(
        packageBytes,
        report,
        operation.signal,
        built.value.payloadCrc
      )
      report({
        stage: 'completed',
        completed: packageBytes.byteLength,
        total: packageBytes.byteLength,
        message: 'Font package committed. Restart the device to activate it.'
      })
      return success(undefined)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown font asset error.'
      if (operation.signal.aborted) {
        report({ stage: 'cancelled', completed: 0, total: 0, message: 'Font upload cancelled.' })
        return failure('cancelled', 'Font upload was cancelled.')
      }
      report({ stage: 'error', completed: 0, total: 0, message })
      return failure('device_error', message)
    } finally {
      this.release(operation)
    }
  }

  cancel(): FontAssetResult<void> {
    this.activeOperation?.abort()
    return success(undefined)
  }
}

function validateFamilies(families: readonly string[]): FontAssetError | undefined {
  if (families.length > MAXIMUM_FONT_FAMILIES) {
    return {
      code: 'invalid_request',
      message: `At most ${MAXIMUM_FONT_FAMILIES} font families can be installed.`
    }
  }
  const seen = new Set<string>()
  for (const family of families) {
    if (!FONT_FAMILY_PATTERN.test(family)) {
      return { code: 'invalid_request', message: `Invalid font family identifier: ${family}` }
    }
    if (seen.has(family)) {
      return { code: 'invalid_request', message: `Duplicate font family: ${family}` }
    }
    seen.add(family)
  }
  return undefined
}
