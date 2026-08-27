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

const kFirmware: AssetKind = {
  sessionKey: 'firmware',
  dialogTitle: 'Select firmware image',
  dialogButton: 'Select image',
  filters: [{ name: 'SimCore firmware', extensions: ['bin'] }],
  extensions: ['.bin'],
  wrongExtension: 'Select the simcore.bin produced by a firmware build.',
  busy: 'A firmware upload is already running.',
  unsupported: 'The connected firmware cannot update itself over serial.',
  storageUnavailable: 'This device has no second firmware slot to update into.',
  rebootRequired: 'Restart the device to run the firmware already installed.'
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
      return failure('source_unreadable', `Cannot read ${source.name}.`)
    }
    if (size === 0 || size > MAXIMUM_FIRMWARE_IMAGE_SIZE) {
      return failure(
        'package_too_large',
        `${source.name} is ${size} bytes, which does not fit the 2 MiB firmware slot.`
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
      return failure('source_unreadable', `Cannot read ${name}.`)
    }
    if (size === 0 || size > MAXIMUM_FIRMWARE_IMAGE_SIZE) {
      return failure(
        'package_too_large',
        `${name} is ${size} bytes, which does not fit the 2 MiB firmware slot.`
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
      return failure('source_missing', 'The selected firmware image is no longer available.')
    }
    const deviceSession = this.deviceService.getState().session
    if (!deviceSession) {
      return failure('device_error', 'No SimCore device is connected.')
    }

    const operation = new AbortController()
    this.activeOperation = operation
    let stage: 'reading' | 'building' | 'uploading' = 'reading'
    try {
      this.onProgress({
        stage: 'reading',
        completed: 0,
        total: 1,
        message: `Reading ${source.name}`
      })
      const image = await readFile(source.path)
      operation.signal.throwIfAborted()

      stage = 'building'
      const packageBytes = buildFirmwarePackage(image, deviceSession.info.boardId)
      this.onProgress({
        stage: 'building',
        completed: packageBytes.byteLength,
        total: packageBytes.byteLength,
        message: `Wrapped ${image.byteLength} bytes for ${deviceSession.info.boardId}`
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
      const message = error instanceof Error ? error.message : 'Unknown firmware update error.'
      if (operation.signal.aborted) {
        this.onProgress({ stage: 'cancelled', completed: 0, total: 0, message: 'Firmware upload cancelled.' })
        return failure('cancelled', 'Firmware upload was cancelled.')
      }
      this.onProgress({ stage: 'error', completed: 0, total: 0, message })
      if (message.includes('2 MiB')) return failure('package_too_large', message)
      return failure(stage === 'reading' ? 'source_unreadable' : 'device_error', message)
    } finally {
      this.release(operation)
    }
  }
}
