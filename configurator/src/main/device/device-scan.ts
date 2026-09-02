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
import { t } from '@shared/ui-text'

export interface Match {
  record: PortRecord
  baudRate: number
}

export async function scanForDevice(
  connection: ConnectionManager,
  token: number
): Promise<Match> {
  const records = await connection.refreshPortRegistry()
  connection.ensureCurrent(token)
  const candidates = records.filter(({ likelyUsb, path }) => likelyUsb && !isBluetoothPort(path))
  if (candidates.length === 0) {
    throw new DeviceServiceError('no_device', t('device.deviceScan.noUsbSerialPortsWere'))
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
      t('device.deviceScan.noCompatibleSimcoreDeviceResponded')
    )
  }
  if (matches.length > 1) {
    throw new DeviceServiceError(
      'multiple_devices',
      t('device.deviceScan.multipleSimcoreDevicesWereFound')
    )
  }

  const match = matches[0]
  if (!match) {
    throw new DeviceServiceError('no_device', t('device.deviceScan.noSimcoreDeviceWasFound'))
  }
  return match
}

const RECONNECT_SETTLE_MS = 2_500
const RECONNECT_TIMEOUT_MS = 30_000
const RECONNECT_POLL_MS = 750
const RECONNECT_RETRY_MS = 2_000
const RECONNECT_MAXIMUM_ATTEMPTS = 5

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export async function reconnectToBoard(
  manager: ConnectionManager,
  connection: DeviceConnection
): Promise<DeviceResult<DeviceState>> {
  manager.setState({ status: 'connecting' })
  await delay(RECONNECT_SETTLE_MS)

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
      await delay(RECONNECT_POLL_MS)
      continue
    }
    attempts += 1
    const connected = await manager.openConnection(record.summary.id, connection.baudRate, true)
    if (connected.ok) return connected
    await delay(RECONNECT_RETRY_MS)
  }
  const error: DeviceError = {
    code: 'port_missing',
    message: t('device.deviceScan.theBoardRestartedButDid')
  }
  manager.setState({ status: 'error', error })
  return failure(error)
}
