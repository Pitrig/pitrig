import type { ConfigurationDocumentId } from '../../shared/configuration-schema'
import type { DeviceConfiguration, DeviceSession } from '../../shared/device'
import type { ImageDeliveryPlan } from '../../shared/image-library'
import type { FontAssetService } from '../font-assets/font-asset-service'
import type { BuiltFontPackage } from '../font-assets/font-package'
import type { ImageLibraryService } from '../image-library/image-library-service'
import { plannedFamilies, plannedFontPackage, type FontSources } from './font-delivery'
import { plannedImages } from './image-delivery'
import { fitsBoardMemory } from './memory-check'
import type { SaveStep } from './save-results'

export interface AssetPlan {
  families: string[]
  images: ImageDeliveryPlan | undefined
}

export async function planAssets(input: {
  configuration: DeviceConfiguration
  session: DeviceSession
  changed: readonly ConfigurationDocumentId[]
  keepBoardAssets: boolean
  fonts: FontSources
  library: ImageLibraryService
}): Promise<SaveStep<AssetPlan>> {
  const families = await plannedFamilies({
    configuration: input.configuration,
    session: input.session,
    changed: input.changed,
    keepBoardFonts: input.keepBoardAssets,
    sources: input.fonts
  })
  if (!families.ok) return families
  const images = await plannedImages({
    configuration: input.configuration,
    session: input.session,
    keepBoardImages: input.keepBoardAssets,
    library: input.library
  })
  if (!images.ok) return images
  return { ok: true, value: { families: families.value, images: images.value } }
}

export async function packageAssets(input: {
  plan: AssetPlan
  session: DeviceSession
  fontAssets: FontAssetService
  library: ImageLibraryService
  report: (message: string) => void
}): Promise<SaveStep<BuiltFontPackage | undefined>> {
  const fontPackage = await plannedFontPackage({
    families: input.plan.families,
    session: input.session,
    fontAssets: input.fontAssets,
    report: input.report
  })
  if (!fontPackage.ok) return fontPackage
  const memory = await fitsBoardMemory({
    session: input.session,
    fontPackage: fontPackage.value,
    images: input.plan.images,
    library: input.library
  })
  if (!memory.ok) return memory
  return fontPackage
}
