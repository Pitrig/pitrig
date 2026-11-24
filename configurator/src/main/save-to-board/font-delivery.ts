import type { AssetUploadProgress } from '../../shared/asset-upload'
import type { ConfigurationDocumentId } from '../../shared/configuration-schema'
import type { DeviceConfiguration, DeviceSession } from '../../shared/device'
import { documentFamilyIds } from '../../shared/document-assets'
import type { FontAssetService } from '../font-assets/font-asset-service'
import type { BuiltFontPackage } from '../font-assets/font-package'
import type { FontCatalogService } from '../font-library/font-catalog-service'
import type { FontLibraryService } from '../font-library/font-library-service'
import { stepFailure, type RestartOutcome, type SaveStep } from './save-results'
import { t } from '@shared/ui-text'

export interface FontSources {
  library: FontLibraryService
  catalog: FontCatalogService
  onLibraryChanged: () => void
}

export async function plannedFamilies(input: {
  configuration: DeviceConfiguration
  session: DeviceSession
  changed: readonly ConfigurationDocumentId[]
  keepBoardFonts: boolean
  sources: FontSources
}): Promise<SaveStep<string[]>> {
  const required = documentFamilyIds(input.configuration)
  const installed = input.session.fontAssets?.families ?? []
  const lacking = required.some((family) => !installed.includes(family))
  const needed = input.changed.includes('dashboard') || lacking ? required : []
  const families = input.keepBoardFonts && boardHolds(input.session, needed) ? [] : needed
  let unresolved = await input.sources.library.unresolved(families)
  if (unresolved.length > 0) {
    const added = await downloadFromCatalog(unresolved, input.sources)
    if (added) unresolved = await input.sources.library.unresolved(families)
  }
  if (unresolved.length > 0) {
    return {
      ok: false,
      result: {
        ok: false,
        error: {
          code: 'fonts_unresolved',
          families: unresolved,
          message:
            unresolved.length === 1
              ? t('save.fontDelivery.noFaceCalled', { family: unresolved[0] ?? '' })
              : t('save.fontDelivery.noFaceForSome', { count: unresolved.length })
        }
      }
    }
  }
  return { ok: true, value: families }
}

export async function plannedFontPackage(input: {
  families: readonly string[]
  session: DeviceSession
  fontAssets: FontAssetService
  report: (message: string) => void
}): Promise<SaveStep<BuiltFontPackage | undefined>> {
  const installed = input.session.fontAssets
  if (input.families.length === 0 || !installed?.storageAvailable) {
    return { ok: true, value: undefined }
  }
  input.report(t('save.fontDelivery.building'))
  const built = await input.fontAssets.buildPackage(input.families)
  if (!built.ok) return stepFailure('font_upload_failed', built.error.message)
  const sameBytes =
    installed.packageAvailable &&
    installed.payloadCrc !== undefined &&
    installed.payloadCrc === built.value.payloadCrc &&
    sameFamilies(installed.families, built.value.families)
  return { ok: true, value: sameBytes ? undefined : built.value }
}

export async function deliverFonts(input: {
  fontPackage: BuiltFontPackage | undefined
  session: DeviceSession
  fontAssets: FontAssetService
  restart: () => Promise<RestartOutcome>
  onProgress: (progress: AssetUploadProgress) => void
}): Promise<SaveStep<boolean>> {
  if (!input.fontPackage) return { ok: true, value: false }
  if (input.session.fontAssets?.rebootRequired) {
    const restarted = await input.restart()
    if (!restarted.ok) return { ok: false, result: restarted.error }
  }
  const uploaded = await input.fontAssets.upload(
    { families: [...input.fontPackage.families] },
    input.onProgress,
    input.fontPackage
  )
  if (!uploaded.ok) return stepFailure('font_upload_failed', uploaded.error.message)
  return { ok: true, value: true }
}

async function downloadFromCatalog(ids: readonly string[], sources: FontSources): Promise<boolean> {
  let added = false
  for (const id of ids) {
    const match = await sources.catalog.findById(id).catch(() => undefined)
    if (!match) continue
    const face = await sources.catalog.faceFor(match.family, match.variant).catch(() => undefined)
    if (!face) continue
    const stored = await sources.library
      .addDownloaded(match.family, match.variant, face.category, face.bytes)
      .catch(() => undefined)
    if (stored?.ok) added = true
  }
  if (added) sources.onLibraryChanged()
  return added
}

function boardHolds(session: DeviceSession, families: readonly string[]): boolean {
  const installed = session.fontAssets
  return Boolean(
    installed?.packageAvailable &&
      !installed.rebootRequired &&
      families.every((family) => installed.families.includes(family))
  )
}

function sameFamilies(installed: readonly string[], wanted: readonly string[]): boolean {
  if (installed.length !== wanted.length) return false
  const sorted = [...installed].sort()
  return [...wanted].sort().every((family, index) => sorted[index] === family)
}
