import { BOARD_PROFILES, DEFAULT_BAUD_RATE, type PitrigBoardId } from '../../shared/device'
import { BOARD_INSTALL, linkMovesToAnotherConnector } from '../../shared/first-install'
import { PITRIG_USB_IDENTITY, usbIdentity, usbPortKind } from '../../shared/usb-ports'
import type { PortFinder } from '../device/device-scan'
import type { InstallClaim } from '../device/install-claim'
import { serialIdentity } from '../device/port-registry'

const SAME_CONNECTOR_MS = 40_000
const OTHER_CONNECTOR_MS = 5 * 60_000

export function cableMoves(claim: InstallClaim, board: PitrigBoardId): boolean {
  return linkMovesToAnotherConnector(board, usbPortKind(claim.summary))
}

export async function connectInstalledBoard(
  claim: InstallClaim,
  board: PitrigBoardId,
  mac: string,
  signal: AbortSignal
): Promise<boolean> {
  if (BOARD_INSTALL[board].link === 'uart') {
    const wanted = serialIdentity(claim.path)
    const baudRate = BOARD_PROFILES[board].telemetryUartBaudRate ?? DEFAULT_BAUD_RATE
    const connected = await claim.connect(
      (records) => records.find((record) => serialIdentity(record.path) === wanted),
      baudRate,
      Date.now() + SAME_CONNECTOR_MS,
      signal
    )
    return connected.ok
  }
  const waitMs = cableMoves(claim, board) ? OTHER_CONNECTOR_MS : SAME_CONNECTOR_MS
  const connected = await claim.connect(
    nativePort(mac, claim.pitrigPortsBefore),
    DEFAULT_BAUD_RATE,
    Date.now() + waitMs,
    signal
  )
  return connected.ok
}

function nativePort(mac: string, before: readonly string[]): PortFinder {
  return (records) => {
    const pitrig = records.filter((record) => usbIdentity(record.summary) === PITRIG_USB_IDENTITY)
    return (
      pitrig.find((record) => serialDigits(record.summary.serialNumber) === mac) ??
      pitrig.find((record) => !before.includes(record.path))
    )
  }
}

function serialDigits(serial: string | undefined): string {
  return (serial ?? '').replace(/[^0-9a-f]/gi, '').toUpperCase()
}
