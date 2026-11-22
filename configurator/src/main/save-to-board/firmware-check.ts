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
  return saveFailure(
    'firmware_behind',
    t('save.firmwareCheck.refused', {
      running,
      released: RELEASED_FIRMWARE_VERSION,
      reason: checked.error.message
    })
  )
}
