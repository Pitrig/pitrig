import {
  AUTOMATIC_BAUD_RATES,
  type DeviceConnection,
  type DeviceError,
  type DeviceResult,
  type DeviceState
} from '../../shared/device'
import { DeviceServiceError, failure, toDeviceError } from './device-errors'
import { samePort } from './port-leases'
import { dropsDuringRestart, serialIdentity, type PortRecord } from './port-registry'
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
  const candidates = records
    .filter(({ likelyUsb, bluetooth }) => likelyUsb && !bluetooth)
    .sort((left, right) => left.scanPriority - right.scanPriority)
  if (candidates.length === 0) {
    throw new DeviceServiceError('no_device', t('device.deviceScan.noUsbSerialPortsWere'))
  }

  const totalAttempts = candidates.length * AUTOMATIC_BAUD_RATES.length
  const matches: Match[] = []
  const blockedErrors: DeviceError[] = []
  const pluginBoards = connection.leases.pluginBoards()
  let attempt = 0

  for (const record of candidates) {
    const held = pluginBoards.find((board) => samePort(board.path, record.path))
    if (held) {
      matches.push({ record, baudRate: held.baudRate })
      continue
    }
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
        const opened = await connection.openAndIdentify(record, baudRate, token)
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
      t('device.deviceScan.noCompatiblePitrigDeviceResponded')
    )
  }
  if (matches.length > 1) {
    throw new DeviceServiceError(
      'multiple_devices',
      t('device.deviceScan.multiplePitrigDevicesWereFound')
    )
  }

  const match = matches[0]
  if (!match) {
    throw new DeviceServiceError('no_device', t('device.deviceScan.noPitrigDeviceWasFound'))
  }
  return match
}

const RECONNECT_GONE_MS = 2_500
const RECONNECT_TIMEOUT_MS = 30_000
const RECONNECT_POLL_MS = 100
const RECONNECT_RETRY_MS = 250
const RECONNECT_HOLD_MS = 15_000
const RECONNECT_MAXIMUM_ATTEMPTS = 20

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export async function reconnectToBoard(
  manager: ConnectionManager,
  connection: DeviceConnection
): Promise<DeviceResult<DeviceState>> {
  const token = manager.startOperation()
  manager.setState({ status: 'connecting' })
  try {
    return await attemptReconnect(manager, connection, token)
  } catch (error) {
    return failure(toDeviceError(error))
  }
}

async function attemptReconnect(
  manager: ConnectionManager,
  connection: DeviceConnection,
  token: number
): Promise<DeviceResult<DeviceState>> {
  const wanted = serialIdentity(connection.path)
  const find = async (): Promise<PortRecord | undefined> => {
    try {
      const records = await manager.refreshPortRegistry()
      return records.find((candidate) => serialIdentity(candidate.path) === wanted)
    } catch {
      return undefined
    }
  }
  let record = await find()
  manager.ensureCurrent(token)
  if (record && dropsDuringRestart(record.summary)) {
    const gone = Date.now() + RECONNECT_GONE_MS
    while (record && Date.now() < gone) {
      await delay(RECONNECT_POLL_MS)
      manager.ensureCurrent(token)
      record = await find()
      manager.ensureCurrent(token)
    }
  }

  const deadline = Date.now() + RECONNECT_TIMEOUT_MS
  let attempts = 0
  while (Date.now() < deadline && attempts < RECONNECT_MAXIMUM_ATTEMPTS) {
    if (record) {
      attempts += 1
      const connected = await manager.openWithToken(
        record.summary.id,
        connection.baudRate,
        true,
        token,
        Date.now() + RECONNECT_HOLD_MS
      )
      if (connected.ok) return connected
      manager.ensureCurrent(token)
    }
    await delay(record ? RECONNECT_RETRY_MS : RECONNECT_POLL_MS)
    manager.ensureCurrent(token)
    record = await find()
    manager.ensureCurrent(token)
  }
  const error: DeviceError = {
    code: 'port_missing',
    message: t('device.deviceScan.theBoardRestartedButDid')
  }
  manager.leases.dropAll()
  manager.setState({ status: 'error', error })
  return failure(error)
}
