import { documentFonts } from '../../shared/document-fonts'
import { t } from '@shared/ui-text'
import {
  CONFIGURATION_DOCUMENT_IDS,
  type ConfigurationDocumentId
} from '../../shared/configuration-schema'
import {
  documentsDiffering
} from '../../shared/configuration-documents'
import type { AssetUploadProgress } from '../../shared/asset-upload'
import type {
  SaveProgress,
  SaveToBoardRequest,
  SaveToBoardResult
} from '../../shared/save-to-board'
import type {
  DeviceConfiguration,
  DeviceConfigurationSaveResult,
  DeviceSession
} from '../../shared/device'
import { DeviceService } from '../device/device-service'
import { parseDeviceConfigurationJson } from '../device/configuration-json'
import { FontAssetService } from '../font-assets/font-asset-service'
import { FontLibraryService } from '../font-library/font-library-service'

export class SaveToBoardService {
  constructor(
    private readonly deviceService: DeviceService,
    private readonly fontAssets: FontAssetService,
    private readonly library: FontLibraryService,
    private readonly onProgress: (progress: SaveProgress) => void
  ) {}

  async save(request: SaveToBoardRequest): Promise<SaveToBoardResult> {
    const session = this.deviceService.getState().session
    if (!session) {
      return failure('device_error', t('save.saveToBoardService.noSimcoreBoardIsConnected'))
    }

    let configuration: DeviceConfiguration
    try {
      configuration = parseDeviceConfigurationJson(request.json)
    } catch (error) {
      return failure('invalid_configuration', messageOf(error, t('save.saveToBoardService.theConfigurationIsNotValid')))
    }

    const requested = request.documents
    const changed = documentsDiffering(configuration, session.configuration).filter(
      (document) => requested === undefined || requested.includes(document)
    )

    const safeMode = session.info.health?.safeMode ?? false

    const families =
      !safeMode && changed.includes('dashboard') ? requiredFamilies(configuration) : []

    this.report('preparing', 0, 1, t('save.saveToBoardService.checkingTheFontsThisDashboard'))
    const unresolved = await this.library.unresolved(families)
    if (unresolved.length > 0) {
      return {
        ok: false,
        error: {
          code: 'fonts_unresolved',
          families: unresolved,
          message:
            unresolved.length === 1
              ? `The font library has no face called "${unresolved[0]}".`
              : `The font library has no face for ${unresolved.length} of this dashboard's families.`
        }
      }
    }

    return this.deviceService.runPipeline(async () => {
      let fontsUploaded = false
      if (families.length > 0 && session.fontAssets?.storageAvailable) {
        this.report('building', 0, 1, t('save.stage.building'))
        const built = await this.fontAssets.buildPackage(families)
        if (!built.ok) return failure('font_upload_failed', built.error.message)

        const installed = session.fontAssets
        const sameBytes =
          installed.packageAvailable &&
          installed.payloadCrc !== undefined &&
          installed.payloadCrc === built.value.payloadCrc &&
          sameFamilies(installed.families, built.value.families)

        if (!sameBytes) {
          if (installed.rebootRequired) {
            const restarted = await this.restart()
            if (!restarted.ok) return restarted.error
          }
          const uploaded = await this.fontAssets.upload({ families }, this.forwardUploadProgress)
          if (!uploaded.ok) return failure('font_upload_failed', uploaded.error.message)
          fontsUploaded = true
        }
      }

      let written: DeviceConfigurationSaveResult | undefined
      if (changed.length > 0) {
        this.report('saving', 0, 1, describeSaving(changed))
        const result = await this.deviceService.saveConfiguration(request.json, changed)
        if (!result.ok) return failure('device_error', result.error.message)
        written = result.value
      }
      const saved = written?.configuration ?? session.configuration

      const leavingSafeMode = safeMode && written !== undefined
      const restartNeeded =
        leavingSafeMode ||
        fontsUploaded ||
        assetsAwaitingRestart(this.deviceService.getState().session) ||
        (written?.rebootRequired ?? false)
      if (restartNeeded) {
        const reconnected = await this.restart()
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
          value: {
            configuration: saved,
            fontsUploaded,
            restarted: true,
            ...(reconnected.ok ? {} : { reconnectFailed: true })
          }
        }
      }

      const applied =
        written && written.documents.length > 0
          ? await this.deviceService.applyConfigurationNow(request.json, written.documents)
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
          configuration: saved,
          fontsUploaded,
          restarted: false,
          ...(applied && !applied.ok ? { applyFailed: applied.error.message } : {})
        }
      }
    })
  }

  private readonly forwardUploadProgress = (progress: AssetUploadProgress): void => {
    this.report('uploading', progress.completed, progress.total, progress.message)
  }

  private async restart(): Promise<{ ok: true } | { ok: false; error: SaveToBoardResult }> {
    this.report('rebooting', 0, 1, t('save.stage.rebooting'))
    const result = await this.deviceService.rebootAndReconnect()
    if (result.ok) return { ok: true }
    this.report('reconnecting', 0, 1, result.error.message)
    return { ok: false, error: failure('device_error', result.error.message) }
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

function requiredFamilies(configuration: DeviceConfiguration): string[] {
  return [
    ...new Set(
      documentFonts(configuration)
        .map((font) => font?.family)
        .filter((family): family is string => Boolean(family))
    )
  ].sort()
}

function sameFamilies(installed: readonly string[], wanted: readonly string[]): boolean {
  if (installed.length !== wanted.length) return false
  const sorted = [...installed].sort()
  return [...wanted].sort().every((family, index) => sorted[index] === family)
}

function failure(
  code: 'invalid_configuration' | 'busy' | 'device_error' | 'font_upload_failed',
  message: string
): SaveToBoardResult {
  return { ok: false, error: { code, message } }
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
