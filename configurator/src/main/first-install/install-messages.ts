import type { FirstInstallErrorCode } from '../../shared/first-install'
import { toDeviceError } from '../device/device-errors'
import { MissingReleaseAsset } from '../updates/release-firmware'
import { InstallFailure } from './install-failure'
import { t } from '@shared/ui-text'

const DEVICE_CODES: Readonly<Record<string, FirstInstallErrorCode>> = {
  busy: 'busy',
  port_busy: 'port_busy',
  port_missing: 'port_missing',
  permission_denied: 'permission_denied'
}

export function asInstallFailure(error: unknown): InstallFailure {
  if (error instanceof InstallFailure) return error
  if (error instanceof MissingReleaseAsset) {
    return error.published
      ? new InstallFailure('archive_incomplete', { name: error.asset })
      : new InstallFailure('release_missing', { version: error.version })
  }
  const device = toDeviceError(error)
  return new InstallFailure(DEVICE_CODES[device.code] ?? 'serial_error', { reason: device.message })
}

export function describeFailure(failure: InstallFailure, erased: boolean): string {
  const detail = (key: string): string => String(failure.details[key] ?? '')
  switch (failure.code) {
    case 'busy':
      return detail('reason') || t('device.linkOwner.busy.install')
    case 'invalid_request':
      return t('ipc.registerAssetHandlers.invalidFirmwareUploadRequest')
    case 'port_missing':
      return t('device.deviceErrors.theSerialPortIsNo')
    case 'port_busy':
      return t('device.deviceErrors.theSerialPortIsBusy')
    case 'permission_denied':
      return t('device.deviceErrors.permissionToOpenTheSerial')
    case 'no_answer':
      return t('firmware.firstInstall.bootHint')
    case 'already_pitrig':
      return t('firmware.firstInstall.alreadyPitrig')
    case 'backup_failed':
      return detail('reason')
    case 'chip_mismatch':
      return t('firmware.firstInstall.chipMismatch', {
        found: detail('found'),
        expected: detail('expected')
      })
    case 'revision_unsupported':
      return t('firmware.firstInstall.revisionUnsupported', {
        chip: detail('chip'),
        revision: detail('revision'),
        minimum: detail('minimum'),
        maximum: detail('maximum')
      })
    case 'flash_too_small':
      return t('firmware.firstInstall.flashTooSmall', {
        size: detail('size'),
        needed: detail('needed')
      })
    case 'secured':
      return t('firmware.firstInstall.secured')
    case 'release_missing':
      return t('firmware.firstInstall.releaseMissing', { version: detail('version') })
    case 'archive_incomplete':
      return t('firmware.firstInstall.archiveIncomplete', { name: detail('name') })
    case 'download_failed':
      return t('firmware.firstInstall.downloadFailed', { reason: detail('reason') })
    case 'write_failed':
      return t('firmware.firstInstall.writeFailed', { offset: detail('offset') })
    case 'verify_failed':
      return t('firmware.firstInstall.verifyFailed', { name: detail('name') })
    case 'cancelled':
      return erased ? t('firmware.firstInstall.cancelledErased') : t('firmware.firstInstall.cancelled')
    case 'serial_error':
      return erased
        ? t('firmware.firstInstall.writeFailed', { offset: detail('offset') })
        : t('firmware.firstInstall.stoppedAnswering')
  }
}
