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
import { PackageTooLargeError } from '../assets/asset-service-base'
import { DeviceService } from '../device/device-service'
import { FontLibraryService } from '../font-library/font-library-service'
import { buildFontPackage, type BuiltFontPackage, type FontFamilyAsset } from './font-package'
import { t } from '@shared/ui-text'

const kFonts: AssetKind = {
  sessionKey: 'fontAssets',
  dialogTitle: t('fonts.fontAssetService.selectFontSource'),
  dialogButton: t('fonts.fontAssetService.selectFont'),
  filters: [{ name: t('fonts.dialog.filter'), extensions: ['ttf', 'otf'] }],
  extensions: ['.ttf', '.otf'],
  wrongExtension: t('fonts.fontLibraryService.selectATtfOrOtf'),
  busy: t('fonts.fontAssetService.aFontUploadIsAlready'),
  unsupported: t('fonts.fontAssetService.theConnectedFirmwareDoesNot'),
  storageUnavailable: t('fonts.fontAssetService.fontAssetStorageIsUnavailable'),
  rebootRequired: t('fonts.fontAssetService.restartTheDeviceBeforeUploading')
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
        return failure('source_missing', t('fonts.fontAssetService.theFontLibraryHoldsNo', { family: family }))
      }
      faces.push({ family, bytes })
    }
    try {
      return success(buildFontPackage(faces))
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('fonts.fontAssetService.packageBuildFailed')
      const code = error instanceof PackageTooLargeError ? 'package_too_large' : 'invalid_request'
      return failure(code, message)
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
        message: t('fonts.fontAssetService.buildingOneFontPackageFrom', { length: request.families.length })
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
        message: t('fonts.fontAssetService.builtFontPackageBytelengthBytes', { byteLength: packageBytes.byteLength })
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
        message: t('fonts.fontAssetService.fontPackageCommittedRestartThe')
      })
      return success(undefined)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown font asset error.'
      if (operation.signal.aborted) {
        report({ stage: 'cancelled', completed: 0, total: 0, message: t('fonts.fontAssetService.fontUploadCancelled') })
        return failure('cancelled', t('fonts.fontAssetService.fontUploadWasCancelled'))
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
      message: t('fonts.fontAssetService.atMostMaximumFontFamilies', { mAXIMUM_FONT_FAMILIES: MAXIMUM_FONT_FAMILIES })
    }
  }
  const seen = new Set<string>()
  for (const family of families) {
    if (!FONT_FAMILY_PATTERN.test(family)) {
      return { code: 'invalid_request', message: t('fonts.fontAssetService.invalidFontFamilyIdentifierFamily', { family: family }) }
    }
    if (seen.has(family)) {
      return { code: 'invalid_request', message: t('fonts.fontAssetService.duplicateFontFamilyFamily', { family: family }) }
    }
    seen.add(family)
  }
  return undefined
}
