import type { AssetUploadProgress } from '../../shared/asset-upload'
import { documentsDiffering } from '../../shared/configuration-documents'
import {
  CONFIGURATION_SCHEMA_VERSION,
  type ConfigurationDocumentId
} from '../../shared/configuration-schema'
import type { DeviceSession } from '../../shared/device'
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
import { backUpBoard, type BoardBackup } from './board-backup'
import { FirmwareUpdateService } from './firmware-update-service'
import { t } from '@shared/ui-text'

interface Restored {
  documents: ConfigurationDocumentId[]
  applied: boolean
  failed?: string
}

type Step<T> = { ok: true; value: T } | { ok: false; error: BoardUpdateError }

export class BoardUpdateService {
  constructor(
    private readonly deviceService: DeviceService,
    private readonly firmware: FirmwareUpdateService,
    private readonly saveToBoard: SaveToBoardService,
    private readonly library: ConfigLibraryService,
    private readonly onProgress: (progress: BoardUpdateProgress) => void
  ) {}

  async update(request: BoardUpdateRequest): Promise<BoardUpdateResult> {
    return this.deviceService.operation(
      'update',
      () => this.run(request),
      (error) => failure('busy', error.message)
    )
  }

  private async run(request: BoardUpdateRequest): Promise<BoardUpdateResult> {
    const source = this.sourceFor(request, this.deviceService.getState().session)
    if (!source.ok) return source
    this.report('backup', t('firmware.boardUpdate.readingTheBoard'))
    const read = await this.deviceService.readConfiguration()
    const before = read.ok ? read.value.session : undefined
    if (!read.ok) return failure('device_error', read.error.message)
    if (!before?.firmware) {
      return failure('unsupported_firmware', t('firmware.firmwareUpdateService.theConnectedFirmwareCannotUpdate'))
    }
    const backup = await this.backUp(before)
    if (!backup.ok) return backup

    if (source.value !== undefined) {
      const installed = await this.firmware.upload({ sourceId: source.value }, this.forwardInstall)
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

  private sourceFor(
    request: BoardUpdateRequest,
    session: DeviceSession | undefined
  ): Step<string | undefined> {
    if (!session) return failure('device_error', t('device.deviceOperation.noPitrigDeviceIsConnected'))
    if (!session.firmware) {
      return failure('unsupported_firmware', t('firmware.firmwareUpdateService.theConnectedFirmwareCannotUpdate'))
    }
    if (!session.firmware.storageAvailable) {
      return failure('device_error', t('firmware.firmwareUpdateService.thisDeviceHasNoSecond'))
    }
    if (session.firmware.rebootRequired) return { ok: true, value: undefined }
    if (request.sourceId === undefined) {
      return failure('source_missing', t('firmware.firmwareUpdateService.theSelectedFirmwareImageIs'))
    }
    return { ok: true, value: request.sourceId }
  }

  private async backUp(session: DeviceSession): Promise<Step<BoardBackup | undefined>> {
    const saved = await backUpBoard(this.library, session, () =>
      this.report('backup', t('firmware.boardUpdate.keepingACopy'))
    )
    return saved.ok ? saved : failure('backup_failed', saved.message)
  }

  private async restore(backup: BoardBackup, after: DeviceSession): Promise<Restored> {
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
      { keepBoardAssets: true }
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

  private async verify(backup: BoardBackup): Promise<boolean> {
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

function failure(code: BoardUpdateError['code'], message: string, backup?: string): Step<never> {
  return { ok: false, error: { code, message, ...(backup ? { backup } : {}) } }
}
