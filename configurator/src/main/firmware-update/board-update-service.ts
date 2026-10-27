import type { AssetUploadProgress } from '../../shared/asset-upload'
import { MAXIMUM_CONFIGURATION_NAME } from '../../shared/config-library'
import { documentsDiffering } from '../../shared/configuration-documents'
import {
  CONFIGURATION_DOCUMENT_IDS,
  CONFIGURATION_SCHEMA_VERSION,
  type ConfigurationDocumentId
} from '../../shared/configuration-schema'
import type { DeviceConfiguration, DeviceSession } from '../../shared/device'
import type {
  BoardUpdateError,
  BoardUpdateProgress,
  BoardUpdateRequest,
  BoardUpdateResult,
  BoardUpdateStep
} from '../../shared/firmware-update'
import { ConfigLibraryService } from '../configs/config-library-service'
import { DeviceService } from '../device/device-service'
import { SaveToBoardService } from '../save-to-board/save-to-board-service'
import { FirmwareUpdateService } from './firmware-update-service'
import { t } from '@shared/ui-text'

interface Backup {
  id: string
  name: string
  configuration: DeviceConfiguration
  documents: ConfigurationDocumentId[]
}

interface Restored {
  documents: ConfigurationDocumentId[]
  applied: boolean
  failed?: string
}

type Step<T> = { ok: true; value: T } | { ok: false; error: BoardUpdateError }

export class BoardUpdateService {
  private running = false

  constructor(
    private readonly deviceService: DeviceService,
    private readonly firmware: FirmwareUpdateService,
    private readonly saveToBoard: SaveToBoardService,
    private readonly library: ConfigLibraryService,
    private readonly onProgress: (progress: BoardUpdateProgress) => void
  ) {}

  async update(request: BoardUpdateRequest): Promise<BoardUpdateResult> {
    if (this.running) return failure('busy', t('firmware.boardUpdate.alreadyRunning'))
    const session = this.deviceService.getState().session
    if (!session) return failure('device_error', t('device.deviceOperation.noPitrigDeviceIsConnected'))
    if (!session.firmware) {
      return failure('unsupported_firmware', t('firmware.firmwareUpdateService.theConnectedFirmwareCannotUpdate'))
    }
    if (!session.firmware.storageAvailable) {
      return failure('device_error', t('firmware.firmwareUpdateService.thisDeviceHasNoSecond'))
    }
    const pending = session.firmware.rebootRequired
    if (!pending && request.sourceId === undefined) {
      return failure('source_missing', t('firmware.firmwareUpdateService.theSelectedFirmwareImageIs'))
    }
    this.running = true
    try {
      return await this.deviceService.runPipeline(() =>
        this.run(pending ? undefined : request.sourceId)
      )
    } finally {
      this.running = false
    }
  }

  private async run(sourceId: string | undefined): Promise<BoardUpdateResult> {
    this.report('backup', t('firmware.boardUpdate.readingTheBoard'))
    const read = await this.deviceService.readConfiguration()
    const before = read.ok ? read.value.session : undefined
    if (!read.ok) return failure('device_error', read.error.message)
    if (!before?.firmware) {
      return failure('unsupported_firmware', t('firmware.firmwareUpdateService.theConnectedFirmwareCannotUpdate'))
    }
    const backup = await this.backUp(before)
    if (!backup.ok) return backup

    if (sourceId !== undefined) {
      const installed = await this.firmware.upload({ sourceId }, this.forwardInstall)
      if (!installed.ok) {
        if (backup.value) await this.library.remove(backup.value.id)
        return failure(installed.error.code, installed.error.message)
      }
    }

    this.report('restart', t('firmware.boardUpdate.restarting'))
    const restarted = await this.deviceService.rebootAndReconnect()
    const after = this.deviceService.getState().session
    if (!restarted.ok || !after) {
      return failure(
        'reconnect_failed',
        backup.value
          ? t('firmware.boardUpdate.didNotComeBack', { backup: backup.value.name })
          : t('device.deviceScan.theBoardRestartedButDid'),
        backup.value?.name
      )
    }
    if (after.firmware?.running === before.firmware.running) {
      return failure(
        'rolled_back',
        t('firmware.boardUpdate.rolledBack', { version: after.info.firmwareVersion }),
        backup.value?.name
      )
    }

    const version = after.info.firmwareVersion
    if (!backup.value) {
      return {
        ok: true,
        value: { version, restored: [], configuration: after.configuration, applied: true, verified: true }
      }
    }
    const restored = await this.restore(backup.value, after)
    const verified = await this.verify(backup.value)
    const current = this.deviceService.getState().session
    return {
      ok: true,
      value: {
        version,
        backup: backup.value.name,
        restored: restored.documents,
        configuration: current?.configuration ?? after.configuration,
        applied: restored.applied,
        verified: restored.failed === undefined && verified,
        ...(restored.failed ? { restoreFailed: restored.failed } : {})
      }
    }
  }

  private async backUp(session: DeviceSession): Promise<Step<Backup | undefined>> {
    const documents = CONFIGURATION_DOCUMENT_IDS.filter(
      (document) => session.info.documents[document].outcome === 'valid'
    )
    if (documents.length === 0) return { ok: true, value: undefined }
    this.report('backup', t('firmware.boardUpdate.keepingACopy'))
    const name = t('firmware.boardUpdate.backupName', {
      date: stamp(new Date()),
      version: session.info.firmwareVersion
    }).slice(0, MAXIMUM_CONFIGURATION_NAME)
    const saved = await this.library.save({ name, json: JSON.stringify(session.configuration) })
    if (!saved.ok) {
      return failure('backup_failed', t('firmware.boardUpdate.backupFailed', { reason: saved.error.message }))
    }
    return {
      ok: true,
      value: { id: saved.value.id, name: saved.value.name, configuration: session.configuration, documents }
    }
  }

  private async restore(backup: Backup, after: DeviceSession): Promise<Restored> {
    if (after.info.schemaVersion !== CONFIGURATION_SCHEMA_VERSION) {
      return {
        documents: [],
        applied: true,
        failed: t('device.draftState.theBoardFirmwareReadsSchema', {
          schema: after.info.schemaVersion,
          expected: CONFIGURATION_SCHEMA_VERSION
        })
      }
    }
    const documents = documentsDiffering(backup.configuration, after.configuration).filter(
      (document) => backup.documents.includes(document)
    )
    if (documents.length === 0) return { documents: [], applied: true }
    this.report(
      'restore',
      t('firmware.boardUpdate.puttingBack', {
        documents: documents.map((document) => t(`documents.labelLower.${document}`)).join(' and ')
      })
    )
    const saved = await this.saveToBoard.save(
      { json: JSON.stringify(backup.configuration), documents },
      { keepBoardFonts: true }
    )
    if (!saved.ok) return { documents: [], applied: true, failed: saved.error.message }
    if (saved.value.reconnectFailed) {
      return {
        documents: saved.value.documents,
        applied: true,
        failed: t('device.saveToBoardStore.savedButTheBoardDid')
      }
    }
    return { documents: saved.value.documents, applied: saved.value.applyFailed === undefined }
  }

  private async verify(backup: Backup): Promise<boolean> {
    this.report('verify', t('firmware.boardUpdate.checking'))
    const read = await this.deviceService.readConfiguration()
    if (!read.ok || !read.value.session) return false
    const { info, configuration } = read.value.session
    return (
      backup.documents.every((document) => info.documents[document].outcome === 'valid') &&
      documentsDiffering(backup.configuration, configuration).every(
        (document) => !backup.documents.includes(document)
      )
    )
  }

  private readonly forwardInstall = (progress: AssetUploadProgress): void => {
    if (progress.stage === 'completed' || progress.stage === 'cancelled' || progress.stage === 'error') {
      return
    }
    this.report('install', progress.message, progress.completed, progress.total)
  }

  private report(step: BoardUpdateStep, message: string, completed = 0, total = 0): void {
    this.onProgress({ step, completed, total, message })
  }
}

function stamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function failure(code: BoardUpdateError['code'], message: string, backup?: string): Step<never> {
  return { ok: false, error: { code, message, ...(backup ? { backup } : {}) } }
}
