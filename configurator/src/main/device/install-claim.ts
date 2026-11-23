import type {
  DeviceResult,
  DeviceSession,
  DeviceState,
  SerialPortSummary
} from '../../shared/device'
import { PITRIG_USB_IDENTITY, usbIdentity } from '../../shared/usb-ports'
import type { ConnectionManager } from './device-connection'
import { DeviceServiceError } from './device-errors'
import { connectWhenReady, type PortFinder } from './device-scan'
import { closePort } from './serial-port-lifecycle'
import { t } from '@shared/ui-text'

export interface InstallClaim {
  path: string
  summary: SerialPortSummary
  session?: DeviceSession
  pitrigPortsBefore: readonly string[]
  connect: (
    find: PortFinder,
    baudRate: number,
    deadline: number,
    signal: AbortSignal
  ) => Promise<DeviceResult<DeviceState>>
}

export async function claimPortForInstall<T>(
  connection: ConnectionManager,
  portId: string,
  work: (claim: InstallClaim) => Promise<T>
): Promise<T> {
  const records = await connection.refreshPortRegistry()
  const record = records.find((candidate) => candidate.summary.id === portId)
  if (!record) {
    throw new DeviceServiceError('port_missing', t('device.deviceErrors.theSerialPortIsNo'))
  }
  const state = connection.getState()
  const session = state.connection?.path === record.path ? state.session : undefined
  if (session) {
    const released = connection.releaseActivePort()
    await closePort(released?.port)
    released?.traffic?.flush()
    connection.setState({ status: 'disconnected' })
  } else if (state.connection) {
    await connection.closeDevicePorts()
  }
  await connection.leases.take(record.path)
  try {
    return await work({
      path: record.path,
      summary: record.summary,
      ...(session ? { session } : {}),
      pitrigPortsBefore: records
        .filter((candidate) => candidate.path !== record.path)
        .filter((candidate) => usbIdentity(candidate.summary) === PITRIG_USB_IDENTITY)
        .map((candidate) => candidate.path),
      connect: (find, baudRate, deadline, signal) =>
        connectWhenReady(connection, find, baudRate, deadline, signal)
    })
  } finally {
    const connected = connection.getState().connection?.path
    if (connected) connection.leases.keepOnly(connected)
    else connection.leases.dropAll()
  }
}
