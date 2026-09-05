import { type BrowserWindow } from 'electron'
import { readFile, stat } from 'node:fs/promises'

import {
  MAXIMUM_FIRMWARE_IMAGE_SIZE,
  type FirmwareSourceSelection,
  type FirmwareUpdateResult,
  type FirmwareUploadProgress,
  type FirmwareUploadRequest
} from '../../shared/firmware-update'
import {
  AssetServiceBase,
  failure,
  success,
  type AssetKind,
  type SourceRecord
} from '../assets/asset-service-base'
import { DeviceService } from '../device/device-service'
import { buildFirmwarePackage } from './firmware-package'
import { t } from '@shared/ui-text'
import { PackageTooLargeError } from '../assets/asset-service-base'

const kFirmware: AssetKind = {
  sessionKey: 'firmware',
  dialogTitle: t('firmware.firmwareUpdateService.selectFirmwareImage'),
  dialogButton: t('firmware.firmwareUpdateService.selectImage'),
  filters: [{ name: t('firmware.dialog.filter'), extensions: ['bin'] }],
  extensions: ['.bin'],
  wrongExtension: t('firmware.firmwareUpdateService.selectThePitrigBinProduced'),
  busy: t('firmware.firmwareUpdateService.aFirmwareUploadIsAlready'),
  unsupported: t('firmware.firmwareUpdateService.theConnectedFirmwareCannotUpdate'),
  storageUnavailable: t('firmware.firmwareUpdateService.thisDeviceHasNoSecond'),
  rebootRequired: t('firmware.firmwareUpdateService.restartTheDeviceToRun')
}

export class FirmwareUpdateService extends AssetServiceBase {
  constructor(
    deviceService: DeviceService,
    private readonly onProgress: (progress: FirmwareUploadProgress) => void
  ) {
    super(deviceService, kFirmware)
  }

  async selectSource(
    owner?: BrowserWindow
  ): Promise<FirmwareUpdateResult<FirmwareSourceSelection | null>> {
    const chosen = await this.chooseSource(owner)
    if (!chosen.ok) return chosen
    if (chosen.value === null) return success(null)
    const source: SourceRecord = chosen.value
    let size: number
    try {
      size = (await stat(source.path)).size
    } catch {
      return failure('source_unreadable', t('firmware.firmwareUpdateService.cannotReadName', { name: source.name }))
    }
    if (size === 0 || size > MAXIMUM_FIRMWARE_IMAGE_SIZE) {
      return failure(
        'package_too_large',
        t('firmware.firmwareUpdateService.nameIsSizeBytesWhich', { name: source.name, size: size })
      )
    }
    this.sources.set(source.id, source)
    return success({ id: source.id, name: source.name, size })
  }

  async registerSourcePath(
    path: string
  ): Promise<FirmwareUpdateResult<FirmwareSourceSelection>> {
    const name = path.split('/').pop() ?? path
    let size: number
    try {
      size = (await stat(path)).size
    } catch {
      return failure('source_unreadable', t('firmware.firmwareUpdateService.cannotReadName', { name: name }))
    }
    if (size === 0 || size > MAXIMUM_FIRMWARE_IMAGE_SIZE) {
      return failure(
        'package_too_large',
        t('firmware.firmwareUpdateService.nameIsSizeBytesWhich', { name: name, size: size })
      )
    }
    const id = `path-${Date.now().toString(36)}`
    this.sources.set(id, { id, name, path })
    return success({ id, name, size })
  }

  async upload(request: FirmwareUploadRequest): Promise<FirmwareUpdateResult<void>> {
    const blocked = this.preflight()
    if (blocked) return blocked
    const source = this.sources.get(request.sourceId)
    if (!source) {
      return failure('source_missing', t('firmware.firmwareUpdateService.theSelectedFirmwareImageIs'))
    }
    const deviceSession = this.deviceService.getState().session
    if (!deviceSession) {
      return failure('device_error', t('device.deviceOperation.noPitrigDeviceIsConnected'))
    }

    const operation = new AbortController()
    this.activeOperation = operation
    let stage: 'reading' | 'building' | 'uploading' = 'reading'
    try {
      this.onProgress({
        stage: 'reading',
        completed: 0,
        total: 1,
        message: t('firmware.firmwareUpdateService.readingName', { name: source.name })
      })
      const image = await readFile(source.path)
      operation.signal.throwIfAborted()

      stage = 'building'
      const packageBytes = buildFirmwarePackage(image, deviceSession.info.boardId)
      this.onProgress({
        stage: 'building',
        completed: packageBytes.byteLength,
        total: packageBytes.byteLength,
        message: t('firmware.firmwareUpdateService.wrappedBytelengthBytesForBoardid', { byteLength: image.byteLength, boardId: deviceSession.info.boardId })
      })

      stage = 'uploading'
      if (this.deviceService.getState().session !== deviceSession) {
        throw new Error('The connected device changed while the image was prepared.')
      }
      await this.deviceService.uploadFirmware(packageBytes, this.onProgress, operation.signal)
      this.onProgress({
        stage: 'completed',
        completed: packageBytes.byteLength,
        total: packageBytes.byteLength,
        message: `Firmware installed into ${deviceSession.firmware?.target ?? 'the inactive slot'}. Restart the device to run it.`
      })
      return success(undefined)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('firmware.firmwareUpdateService.unknownError')
      if (operation.signal.aborted) {
        this.onProgress({ stage: 'cancelled', completed: 0, total: 0, message: t('firmware.firmwareUpdateService.firmwareUploadCancelled') })
        return failure('cancelled', t('firmware.firmwareUpdateService.firmwareUploadWasCancelled'))
      }
      this.onProgress({ stage: 'error', completed: 0, total: 0, message })
      if (error instanceof PackageTooLargeError) return failure('package_too_large', message)
      return failure(stage === 'reading' ? 'source_unreadable' : 'device_error', message)
    } finally {
      this.release(operation)
    }
  }
}
