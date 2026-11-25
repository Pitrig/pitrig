import { t } from '@shared/ui-text'
import type { ConfigurationDocumentId } from '../../shared/configuration-schema'
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
  type DeviceConfigurationSaveResult,
  type DeviceSession
} from '../../shared/device'
import { DeviceService } from '../device/device-service'
import { parseDeviceConfigurationJson } from '../device/configuration-json'
import { FontAssetService } from '../font-assets/font-asset-service'
import type { ImageAssetService } from '../image-assets/image-asset-service'
import type { ImageLibraryService } from '../image-library/image-library-service'
import { refusedByOlderFirmware } from './firmware-check'
import { packageAssets, planAssets, type AssetPlan } from './asset-plan'
import { deliverFonts, type FontSources } from './font-delivery'
import { deliverImages } from './image-delivery'
import { boardView, describeSaving, type BoardView, type SaveScope } from './save-scope'
import {
  messageOf,
  saveFailure,
  withMessage,
  type RestartOutcome,
  type SaveStep
} from './save-results'

export interface SaveOptions {
  keepBoardAssets?: boolean
}

export interface ImageSources {
  imageAssets: ImageAssetService
  library: ImageLibraryService
}

interface Prepared {
  session: DeviceSession
  plan: SaveStep<AssetPlan>
}

interface DeliveredAssets {
  fontsUploaded: boolean
  imagesUploaded: boolean
  imagesKept?: string[]
}

const NO_ASSETS: SaveStep<AssetPlan> = { ok: true, value: { families: [], images: undefined } }

export class SaveToBoardService {
  constructor(
    private readonly deviceService: DeviceService,
    private readonly fontAssets: FontAssetService,
    private readonly fonts: FontSources,
    private readonly images: ImageSources,
    private readonly onProgress: (progress: SaveProgress) => void
  ) {}

  async save(submitted: SaveToBoardRequest, options: SaveOptions = {}): Promise<SaveToBoardResult> {
    const clicked = this.deviceService.getState().session
    if (!clicked) return noBoard()
    let configuration: DeviceConfiguration
    try {
      configuration = applyBoardTransportDefaults(parseDeviceConfigurationJson(submitted.json))
    } catch (error) {
      return saveFailure(
        'invalid_configuration',
        messageOf(error, t('save.saveToBoardService.theConfigurationIsNotValid'))
      )
    }
    const scope: SaveScope = {
      request: { ...submitted, json: JSON.stringify(configuration) },
      configuration,
      keepBoardAssets: options.keepBoardAssets ?? false
    }
    const view = boardView(scope, clicked)
    if (!view.ok) return view.result
    this.report('preparing', 0, 1, t('save.saveToBoardService.checkingTheFontsThisDashboard'))
    const plan = await this.plan(scope, view.value, true)
    if (!plan.ok) return plan.result
    return this.deviceService.operation(
      'save',
      () => this.saveOnTurn(scope, { session: clicked, plan }),
      (error) => saveFailure('busy', error.message)
    )
  }

  private async saveOnTurn(scope: SaveScope, prepared: Prepared): Promise<SaveToBoardResult> {
    const session = this.deviceService.getState().session
    if (!session) return noBoard()
    const view = boardView(scope, session)
    if (!view.ok) return view.result
    const refused = await refusedByOlderFirmware({
      deviceService: this.deviceService,
      session,
      json: scope.request.json,
      changed: view.value.changed,
      report: (message) => this.report('checking', 0, 1, message)
    })
    if (refused) return refused
    const planned =
      session === prepared.session ? prepared.plan : await this.plan(scope, view.value, false)
    if (!planned.ok) return planned.result

    const step = (message: string): void => this.report('building', 0, 1, message)
    const fontPackage = view.value.assetsInScope
      ? await packageAssets({
          plan: planned.value,
          session,
          fontAssets: this.fontAssets,
          library: this.images.library,
          report: step
        })
      : { ok: true as const, value: undefined }
    if (!fontPackage.ok) return fontPackage.result
    const fonts = await deliverFonts({
      fontPackage: fontPackage.value,
      session,
      fontAssets: this.fontAssets,
      restart: () => this.restart(),
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
    const imagesKept = keptImages(planned.value.images)
    return this.writeDocuments(scope, {
      fontsUploaded: fonts.value,
      imagesUploaded: images.value,
      ...(imagesKept ? { imagesKept } : {})
    })
  }

  private async plan(
    scope: SaveScope,
    view: BoardView,
    download: boolean
  ): Promise<SaveStep<AssetPlan>> {
    if (!view.assetsInScope) return NO_ASSETS
    return planAssets({
      configuration: scope.configuration,
      session: view.session,
      changed: view.changed,
      keepBoardAssets: scope.keepBoardAssets,
      fonts: this.fonts,
      library: this.images.library,
      download
    })
  }

  private async writeDocuments(
    scope: SaveScope,
    assets: DeliveredAssets
  ): Promise<SaveToBoardResult> {
    const session = this.deviceService.getState().session
    if (!session) return noBoard()
    const view = boardView(scope, session)
    if (!view.ok) return view.result
    const { changed, safeMode } = view.value
    let written: DeviceConfigurationSaveResult | undefined
    if (changed.length > 0) {
      this.report('saving', 0, 1, describeSaving(changed))
      const result = await this.deviceService.saveConfiguration(scope.request.json, changed)
      if (!result.ok) return saveFailure('device_error', result.error.message)
      written = result.value
    }
    const outcome = {
      configuration: written?.configuration ?? session.configuration,
      documents: written?.documents ?? [],
      ...assets
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
        ? await this.applyAfterSave(scope.request.json, written.documents)
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
      value: { ...outcome, restarted: false, ...(applied ? { applyFailed: applied } : {}) }
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
  ): Promise<string | undefined> {
    this.report('applying', 0, 1, t('save.stage.applying'))
    const applied = await this.deviceService.applyConfiguration(json, documents)
    return applied.ok ? undefined : applied.error.message
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

function noBoard(): SaveToBoardResult {
  return saveFailure('device_error', t('save.saveToBoardService.noPitrigBoardIsConnected'))
}

function assetsAwaitingRestart(session: DeviceSession | undefined): boolean {
  return Boolean(session?.fontAssets?.rebootRequired || session?.imageAssets?.rebootRequired)
}

function keptImages(plan: ImageDeliveryPlan | undefined): string[] | undefined {
  return plan && !plan.install && plan.notOnPc.length > 0 ? plan.notOnPc : undefined
}
