import {
  AUTOMATIC_BAUD_RATES,
  type DeviceConnection,
  type DeviceError,
  type DeviceResult,
  type DeviceState
} from '../../shared/device'
import { DeviceServiceError, failure, toDeviceError } from './device-errors'
import { isBluetoothPort, serialIdentity, type PortRecord } from './port-registry'
import { closePort } from './serial-port-lifecycle'
import type { ConnectionManager } from './device-connection'

export interface Match {
  record: PortRecord
  baudRate: number
}

/**
 * The auto-connect scan: every USB serial port at every automatic baud rate,
 * until exactly one SimCore board answers the INFO probe. Ports it opens are
 * closed again — the winning match is reopened by the caller, so the scan
 * cannot leave a half-attached port behind when the caller's attach fails.
 */
export async function scanForDevice(
  connection: ConnectionManager,
  token: number
): Promise<Match> {
  const records = await connection.refreshPortRegistry()
  connection.ensureCurrent(token)
  const candidates = records.filter(({ likelyUsb, path }) => likelyUsb && !isBluetoothPort(path))
  if (candidates.length === 0) {
    throw new DeviceServiceError('no_device', 'No USB serial ports were found.')
  }

  const totalAttempts = candidates.length * AUTOMATIC_BAUD_RATES.length
  const matches: Match[] = []
  const blockedErrors: DeviceError[] = []
  let attempt = 0

  for (const record of candidates) {
    for (const baudRate of AUTOMATIC_BAUD_RATES) {
      connection.ensureCurrent(token)
      attempt += 1
      connection.setState({
        status: 'scanning',
        scan: {
          displayName: record.summary.displayName,
          baudRate,
          attempt,
          totalAttempts
        }
      })

      try {
        const opened = await connection.openAndProbe(record, baudRate, token)
        await closePort(opened.port)
        opened.traffic.flush()
        matches.push({ record, baudRate })
        break
      } catch (error) {
        connection.ensureCurrent(token)
        const deviceError = toDeviceError(error)
        if (deviceError.code === 'cancelled') {
          throw error
        }
        if (deviceError.code === 'port_busy' || deviceError.code === 'permission_denied') {
          blockedErrors.push(deviceError)
          break
        }
      }
    }
  }

  connection.ensureCurrent(token)
  if (matches.length === 0) {
    const blocked = blockedErrors[0]
    if (blocked) {
      throw new DeviceServiceError(blocked.code, blocked.message)
    }
    throw new DeviceServiceError(
      'no_device',
      'No compatible SimCore device responded to the INFO probe.'
    )
  }
  if (matches.length > 1) {
    throw new DeviceServiceError(
      'multiple_devices',
      'Multiple SimCore devices were found. Select a port manually.'
    )
  }

  const match = matches[0]
  if (!match) {
    throw new DeviceServiceError('no_device', 'No SimCore device was found.')
  }
  return match
}

/**
 * Coming back after a restart, paced so the board is left alone while it boots.
 *
 * Opening a serial port asserts DTR, which on these boards is a reset line — so
 * an eager reconnect does not merely fail, it resets a board that was halfway
 * through starting, and a tight retry loop can hold one in that state. Hence a
 * settle window before the port is touched at all, a poll that only *looks* for
 * the port, and a real pause between attempts that actually open it.
 */
const RECONNECT_SETTLE_MS = 2_500
const RECONNECT_TIMEOUT_MS = 30_000
const RECONNECT_POLL_MS = 750
const RECONNECT_RETRY_MS = 2_000
const RECONNECT_MAXIMUM_ATTEMPTS = 5

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

/**
 * Waits for a restarted board to come back on the same port and reconnects.
 *
 * USB-CDC re-enumeration takes as long as it takes, and a board that never
 * reappears is not a failed save — the flash is already written — so the
 * caller is told to reconnect by hand instead.
 */
export async function reconnectToBoard(
  manager: ConnectionManager,
  connection: DeviceConnection
): Promise<DeviceResult<DeviceState>> {
  // Nothing touches the port until the board has had time to boot on its own.
  manager.setState({ status: 'connecting' })
  await delay(RECONNECT_SETTLE_MS)

  // By path, not by identifier: the board's port identifier does not survive
  // the device disappearing, so the one we started with is gone the moment it
  // reboots.
  const wanted = serialIdentity(connection.path)
  const deadline = Date.now() + RECONNECT_TIMEOUT_MS
  let attempts = 0
  while (Date.now() < deadline && attempts < RECONNECT_MAXIMUM_ATTEMPTS) {
    let record: PortRecord | undefined
    try {
      record = (await manager.refreshPortRegistry()).find(
        (candidate) => serialIdentity(candidate.path) === wanted
      )
    } catch {
      record = undefined
    }
    if (!record) {
      // Looking costs the board nothing, so this can be frequent.
      await delay(RECONNECT_POLL_MS)
      continue
    }
    attempts += 1
    const connected = await manager.openConnection(record.summary.id, connection.baudRate, true)
    // The port is enumerated before the firmware answers `@SC:`, so a refused
    // probe means "not yet", not "not a SimCore board".
    if (connected.ok) return connected
    await delay(RECONNECT_RETRY_MS)
  }
  const error: DeviceError = {
    code: 'port_missing',
    message: 'The board restarted but did not come back on its port. Reconnect it by hand.'
  }
  manager.setState({ status: 'error', error })
  return failure(error)
}
