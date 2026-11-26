import { setTimeout as sleep } from 'node:timers/promises'

import { SerialPort } from 'serialport'

import {
  BOARD_PROFILES,
  DEFAULT_BAUD_RATE,
  type DeviceSession,
  type PitrigBoardId
} from '../../shared/device'
import { BOARD_INSTALL } from '../../shared/first-install'
import { usbPortKind, type UsbPortKind } from '../../shared/usb-ports'
import { probePitrig } from '../device/device-probe'
import type { InstallClaim } from '../device/install-claim'
import { closePort, openPort } from '../device/serial-port-lifecycle'

const PROBE_MS: Record<UsbPortKind, number> = {
  pitrig: 3_000,
  usb_jtag: 12_000,
  bridge: 5_000,
  other: 5_000
}
const PROBE_RETRY_MS = 500

export async function findExistingFirmware(
  claim: InstallClaim,
  board: PitrigBoardId,
  signal: AbortSignal
): Promise<DeviceSession | undefined> {
  if (claim.session) return claim.session
  const kind = usbPortKind(claim.summary)
  if (kind === 'usb_jtag' && !BOARD_INSTALL[board].separateLinkConnector) return undefined
  const baudRate =
    kind === 'pitrig' || kind === 'usb_jtag'
      ? DEFAULT_BAUD_RATE
      : (BOARD_PROFILES[board].telemetryUartBaudRate ?? DEFAULT_BAUD_RATE)
  const port = new SerialPort({ path: claim.path, baudRate, autoOpen: false, lock: true })
  await openPort(port)
  try {
    const deadline = Date.now() + PROBE_MS[kind]
    while (Date.now() < deadline && !signal.aborted) {
      try {
        return await probePitrig(port, () => undefined)
      } catch {
        await sleep(PROBE_RETRY_MS)
      }
    }
    return undefined
  } finally {
    await closePort(port)
  }
}
