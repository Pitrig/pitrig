import type { ConfigurationDocumentId } from '../../shared/configuration-schema'
import type { DeviceSession } from '../../shared/device'
import type { SaveToBoardResult } from '../../shared/save-to-board'
import { isOlder } from '../../shared/version-compare'
import type { DeviceService } from '../device/device-service'
import { RELEASED_FIRMWARE_VERSION } from '../updates/release-firmware'
import { saveFailure } from './save-results'
import { t } from '@shared/ui-text'

export async function refusedByOlderFirmware(input: {
  deviceService: DeviceService
  session: DeviceSession
  json: string
  changed: readonly ConfigurationDocumentId[]
  report: (message: string) => void
}): Promise<SaveToBoardResult | undefined> {
  const running = input.session.info.firmwareVersion
  if (input.changed.length === 0 || !isOlder(running, RELEASED_FIRMWARE_VERSION)) return undefined
  input.report(t('save.firmwareCheck.checking', { version: running }))
  const checked = await input.deviceService.validateConfiguration(input.json, [...input.changed])
  if (checked.ok) return undefined
  const { code, token, message } = checked.error
  const versions = { running, released: RELEASED_FIRMWARE_VERSION }
  if (code === 'configuration_rejected' && token?.split(':')[0] === 'malformed') {
    return saveFailure('firmware_behind', t('save.firmwareCheck.unreadable', versions))
  }
  if (code === 'configuration_rejected') {
    return saveFailure('firmware_behind', t('save.firmwareCheck.refused', { ...versions, reason: message }))
  }
  if (code === 'no_answer' || code === 'serial_error') {
    return saveFailure('firmware_behind', t('save.firmwareCheck.unfinished', versions))
  }
  if (code === 'board_busy' || code === 'busy') return saveFailure('busy', message)
  return saveFailure('device_error', message)
}
