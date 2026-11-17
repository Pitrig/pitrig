import { t } from '@shared/ui-text'
import {
  CONFIGURATION_DOCUMENT_IDS,
  type ConfigurationDocumentId
} from '../../shared/configuration-schema'
import { documentsDiffering } from '../../shared/configuration-documents'
import type { AssetUploadProgress } from '../../shared/asset-upload'
import type { ImageDeliveryPlan } from '../../shared/image-library'
import type {
  SaveProgress,
  SaveToBoardRequest,
  SaveToBoardResult
} from '../../shared/save-to-board'
import {
  applyBoardTransportDefaults,
  type DeviceConfiguration,
  type DeviceConfigurationApplyResult,
  type DeviceConfigurationSaveResult,
  type DeviceResult,
  type DeviceSession
} from '../../shared/device'
import { DeviceService } from '../device/device-service'
import { parseDeviceConfigurationJson } from '../device/configuration-json'
import { FontAssetService } from '../font-assets/font-asset-service'
import type { ImageAssetService } from '../image-assets/image-asset-service'
import type { ImageLibraryService } from '../image-library/image-library-service'
import { deliverFonts, plannedFamilies, type FontSources } from './font-delivery'
import { deliverImages, plannedImages } from './image-delivery'
import { messageOf, saveFailure, withMessage, type RestartOutcome } from './save-results'

export interface SaveOptions {
  keepBoardAssets?: boolean
}

export interface ImageSources {
  imageAssets: ImageAssetService
  library: ImageLibraryService
}

interface AssetPlan {
  families: string[]
  images: ImageDeliveryPlan | undefined
}

export class SaveToBoardService {
  constructor(
    private readonly deviceService: DeviceService,
    private readonly fontAssets: FontAssetService,
    private readonly fonts: FontSources,
    private readonly images: ImageSources,
    private readonly onProgress: (progress: SaveProgress) => void
  ) {}

  async save(submitted: SaveToBoardRequest, options: SaveOptions = {}): Promise<SaveToBoardResult> {
    const session = this.deviceService.getState().session
    if (!session) {
      return saveFailure('device_error', t('save.saveToBoardService.noPitrigBoardIsConnected'))
    }

    let configuration: DeviceConfiguration
    try {
      configuration = applyBoardTransportDefaults(parseDeviceConfigurationJson(submitted.json))
    } catch (error) {
      return saveFailure('invalid_configuration', messageOf(error, t('save.saveToBoardService.theConfigurationIsNotValid')))
    }

    if (configuration.board !== session.info.boardId) {
      return saveFailure(
        'invalid_configuration',
        t('device.draftState.theDraftTargetsBoardThe', {
          board: configuration.board,
          boardId: session.info.boardId
        })
      )
    }

    const request = { ...submitted, json: JSON.stringify(configuration) }
    const requested = request.documents
    const changed = documentsDiffering(configuration, session.configuration).filter(
      (document) => requested === undefined || requested.includes(document)
    )
    const safeMode = session.info.health?.safeMode ?? false
    const assetsInScope = !safeMode && (requested === undefined || requested.includes('dashboard'))

    this.report('preparing', 0, 1, t('save.saveToBoardService.checkingTheFontsThisDashboard'))
    const planned = assetsInScope
      ? await this.planAssets(configuration, session, changed, options)
      : { ok: true as const, value: { families: [], images: undefined } }
    if (!planned.ok) return planned.result

    return this.deviceService.runPipeline(async () => {
      const step = (message: string): void => this.report('building', 0, 1, message)
      const fonts = await deliverFonts({
        families: planned.value.families,
        session,
        fontAssets: this.fontAssets,
        restart: () => this.restart(),
        report: step,
        onProgress: this.forwardUploadProgress
      })
      if (!fonts.ok) return fonts.result
      const images = await deliverImages({
        plan: planned.value.images,
        currentSession: () => this.deviceService.getState().session,
        library: this.images.library,
        imageAssets: this.images.imageAssets,
        restart: () => this.restart(),
        report: step,
        onProgress: this.forwardUploadProgress
      })
      if (!images.ok) {
        return fonts.value && !images.result.ok
          ? withMessage(
              images.result,
              t('save.imageDelivery.fontsWithoutImages', { error: images.result.error.message })
            )
          : images.result
      }
      return this.writeDocuments(request, session, changed, safeMode, {
        fontsUploaded: fonts.value,
        imagesUploaded: images.value,
        imagesKept: keptImages(planned.value.images)
      })
    })
  }

  private async planAssets(
    configuration: DeviceConfiguration,
    session: DeviceSession,
    changed: readonly ConfigurationDocumentId[],
    options: SaveOptions
  ): Promise<{ ok: true; value: AssetPlan } | { ok: false; result: SaveToBoardResult }> {
    const families = await plannedFamilies({
      configuration,
      session,
      changed,
      keepBoardFonts: options.keepBoardAssets ?? false,
      sources: this.fonts
    })
    if (!families.ok) return families
    const images = await plannedImages({
      configuration,
      session,
      keepBoardImages: options.keepBoardAssets ?? false,
      library: this.images.library
    })
    if (!images.ok) return images
    return { ok: true, value: { families: families.value, images: images.value } }
  }

  private async writeDocuments(
    request: SaveToBoardRequest,
    session: DeviceSession,
    changed: ConfigurationDocumentId[],
    safeMode: boolean,
    assets: { fontsUploaded: boolean; imagesUploaded: boolean; imagesKept?: string[] }
  ): Promise<SaveToBoardResult> {
    let written: DeviceConfigurationSaveResult | undefined
    if (changed.length > 0) {
      this.report('saving', 0, 1, describeSaving(changed))
      const result = await this.deviceService.saveConfiguration(request.json, changed)
      if (!result.ok) return saveFailure('device_error', result.error.message)
      written = result.value
    }
    const saved = written?.configuration ?? session.configuration
    const outcome = {
      configuration: saved,
      documents: written?.documents ?? [],
      fontsUploaded: assets.fontsUploaded,
      imagesUploaded: assets.imagesUploaded,
      ...(assets.imagesKept ? { imagesKept: assets.imagesKept } : {})
    }

    const current = this.deviceService.getState().session
    const leavingSafeMode = safeMode && written !== undefined
    const restartNeeded =
      leavingSafeMode ||
      assets.fontsUploaded ||
      assets.imagesUploaded ||
      assetsAwaitingRestart(current) ||
      (current?.restartOwed ?? false) ||
      (written?.rebootRequired ?? false)
    if (restartNeeded) {
      const restarted = await this.restart()
      if (!restarted.ok && !restarted.rebooted) return restarted.error
      this.report(
        'completed',
        1,
        1,
        leavingSafeMode
          ? t('save.saveToBoardService.savedTheBoardIsRestarting')
          : t('save.saveToBoardService.savedTheBoardIsRunning')
      )
      return {
        ok: true,
        value: { ...outcome, restarted: true, ...(restarted.ok ? {} : { reconnectFailed: true }) }
      }
    }

    const applied =
      written && written.documents.length > 0
        ? await this.applyAfterSave(request.json, written.documents)
        : undefined
    this.report(
      'completed',
      1,
      1,
      written
        ? t('save.saveToBoardService.savedTheBoardIsRunning')
        : t('save.saveToBoardService.nothingToSaveTheBoard')
    )
    return {
      ok: true,
      value: {
        ...outcome,
        restarted: false,
        ...(applied && !applied.ok ? { applyFailed: applied.error.message } : {})
      }
    }
  }

  private readonly forwardUploadProgress = (progress: AssetUploadProgress): void => {
    if (
      progress.stage !== 'erasing' &&
      progress.stage !== 'uploading' &&
      progress.stage !== 'committing'
    ) {
      return
    }
    this.report('uploading', progress.completed, progress.total, progress.message)
  }

  private async applyAfterSave(
    json: string,
    documents: ConfigurationDocumentId[]
  ): Promise<DeviceResult<DeviceConfigurationApplyResult>> {
    this.report('applying', 0, 1, t('save.stage.applying'))
    return this.deviceService.applyConfigurationNow(json, documents)
  }

  private async restart(): Promise<RestartOutcome> {
    this.report('rebooting', 0, 1, t('save.stage.rebooting'))
    const connection = this.deviceService.getState().connection
    const rebooted = await this.deviceService.reboot()
    if (!rebooted.ok) {
      return { ok: false, rebooted: false, error: saveFailure('device_error', rebooted.error.message) }
    }
    if (!connection) {
      const message = t('device.deviceScan.theBoardRestartedButDid')
      this.report('reconnecting', 0, 1, message)
      return { ok: false, rebooted: true, error: saveFailure('device_error', message) }
    }
    const reconnected = await this.deviceService.reconnect(connection)
    if (reconnected.ok) return { ok: true }
    this.report('reconnecting', 0, 1, reconnected.error.message)
    return { ok: false, rebooted: true, error: saveFailure('device_error', reconnected.error.message) }
  }

  private report(
    stage: SaveProgress['stage'],
    completed: number,
    total: number,
    message: string
  ): void {
    this.onProgress({ stage, completed, total, message })
  }
}

function describeSaving(documents: ConfigurationDocumentId[]): string {
  if (documents.length === CONFIGURATION_DOCUMENT_IDS.length) {
    return t('save.stage.saving')
  }
  const names = documents.map((document) =>
    t(`documents.labelLower.${document}`)
  )
  return t('save.saveToBoardService.savingTheAndConfiguration', { and: names.join(' and ') })
}

function assetsAwaitingRestart(session: DeviceSession | undefined): boolean {
  return Boolean(session?.fontAssets?.rebootRequired || session?.imageAssets?.rebootRequired)
}

function keptImages(plan: ImageDeliveryPlan | undefined): string[] | undefined {
  return plan && !plan.install && plan.notOnPc.length > 0 ? plan.notOnPc : undefined
}
