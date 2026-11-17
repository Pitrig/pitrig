import type { AssetUploadProgress } from '../../shared/asset-upload'
import type { DeviceConfiguration, DeviceSession } from '../../shared/device'
import { documentImageIds } from '../../shared/document-assets'
import { MAXIMUM_IMAGES, MAXIMUM_IMAGE_PACKAGE_SIZE } from '../../shared/image-assets'
import { planImageDelivery, type ImageDeliveryPlan } from '../../shared/image-library'
import type { ImageAssetService } from '../image-assets/image-asset-service'
import type { ImageLibraryService } from '../image-library/image-library-service'
import { messageOf, stepFailure, type RestartOutcome, type SaveStep } from './save-results'
import { t } from '@shared/ui-text'

export async function plannedImages(input: {
  configuration: DeviceConfiguration
  session: DeviceSession
  keepBoardImages: boolean
  library: ImageLibraryService
}): Promise<SaveStep<ImageDeliveryPlan | undefined>> {
  const needed = documentImageIds(input.configuration)
  if (needed.length === 0) return { ok: true, value: undefined }
  const snapshot = await input.library.snapshot()
  const board = input.session.imageAssets
  const plan = planImageDelivery({
    needed,
    library: snapshot.entries,
    board,
    installed: snapshot.installed
  })
  if (plan.blocker === 'no_storage') {
    return stepFailure('images_unavailable', t('save.imageDelivery.noStorage'))
  }
  if (plan.blocker === 'unavailable') {
    return stepFailure(
      'images_unavailable',
      t('save.imageDelivery.unavailable', { images: plan.unavailable.join(', ') })
    )
  }
  if (plan.blocker === 'board_only') {
    return stepFailure(
      'images_unavailable',
      t('save.imageDelivery.boardOnly', {
        images: plan.notOnPc.join(', '),
        pending: [...plan.missingOnBoard, ...plan.differing].join(', ')
      })
    )
  }
  if (plan.blocker === 'too_many') {
    return stepFailure(
      'images_unavailable',
      t('save.imageDelivery.tooMany', { count: plan.needed.length, maximum: MAXIMUM_IMAGES })
    )
  }
  if (plan.blocker === 'too_large') {
    return stepFailure(
      'images_unavailable',
      t('save.imageDelivery.tooLarge', {
        size: Math.ceil(plan.packageSize / 1024),
        limit: Math.floor(MAXIMUM_IMAGE_PACKAGE_SIZE / 1024)
      })
    )
  }
  const keep =
    input.keepBoardImages && plan.missingOnBoard.length === 0 && !board?.rebootRequired
  return { ok: true, value: keep ? { ...plan, install: false } : plan }
}

export async function deliverImages(input: {
  plan: ImageDeliveryPlan | undefined
  currentSession: () => DeviceSession | undefined
  library: ImageLibraryService
  imageAssets: ImageAssetService
  restart: () => Promise<RestartOutcome>
  report: (message: string) => void
  onProgress: (progress: AssetUploadProgress) => void
}): Promise<SaveStep<boolean>> {
  if (!input.plan?.install) return { ok: true, value: false }
  if (input.currentSession()?.imageAssets?.rebootRequired) {
    const restarted = await input.restart()
    if (!restarted.ok) return { ok: false, result: restarted.error }
  }
  input.report(t('save.imageDelivery.building'))
  let images
  try {
    images = await input.library.packageImages(input.plan.needed)
  } catch (error) {
    return stepFailure('image_upload_failed', messageOf(error, t('save.imageDelivery.failed')))
  }
  const installed = await input.imageAssets.install(images, input.onProgress)
  if (!installed.ok) return stepFailure('image_upload_failed', installed.error.message)
  return { ok: true, value: true }
}
