import type { FirmwareChangeRelease } from '@shared/firmware-changes'

declare global {
  const __PITRIG_FIRMWARE_CHANGES__: FirmwareChangeRelease[]
}
