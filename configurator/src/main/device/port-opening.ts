import { SerialPort } from 'serialport'

import type { SerialTrafficLog } from '../../shared/serial-traffic'
import { PortLeases, openWhenFree, probeAfterHandover, probeWhileHeld } from './port-leases'
import type { PortRecord } from './port-registry'
import { closePort } from './serial-port-lifecycle'
import { SerialTrafficReporter } from './serial-traffic-reporter'
import type { TrafficCallback } from './serial-request'

export interface PortOpening {
  readonly leases: PortLeases
  readonly onSerialTraffic: ((log: SerialTrafficLog) => void) | undefined
  ensureCurrent: (token: number) => void
  holdPending: (port: SerialPort | undefined) => void
  pending: () => SerialPort | undefined
}

export interface OpenedPort<T> {
  port: SerialPort
  traffic: SerialTrafficReporter
  value: T
}

export async function openPortFor<T>(
  opening: PortOpening,
  record: PortRecord,
  baudRate: number,
  token: number,
  probe: (port: SerialPort, onTraffic: TrafficCallback) => Promise<T>,
  holdUntil?: number
): Promise<OpenedPort<T>> {
  opening.ensureCurrent(token)
  const fromPlugin = await opening.leases.take(record.path)
  opening.ensureCurrent(token)
  const port = new SerialPort({ path: record.path, baudRate, autoOpen: false, lock: true })
  opening.holdPending(port)
  const traffic = new SerialTrafficReporter(opening.onSerialTraffic, record.path, baudRate)

  try {
    await openWhenFree(port, fromPlugin)
    opening.ensureCurrent(token)
    const value = await probeWhileHeld(
      () =>
        probeAfterHandover(
          () => probe(port, (direction, data) => traffic.write(direction, data)),
          fromPlugin
        ),
      port,
      holdUntil
    )
    opening.ensureCurrent(token)
    opening.holdPending(undefined)
    return { port, traffic, value }
  } catch (error) {
    if (opening.pending() === port) opening.holdPending(undefined)
    await closePort(port)
    traffic.flush()
    throw error
  }
}
