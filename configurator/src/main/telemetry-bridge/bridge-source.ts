import { SerialPort } from 'serialport'

import type { PortRecord } from '../device/port-registry'
import { closePort, openPort } from '../device/serial-port-lifecycle'

export interface BridgeSource {
  path: string
  baudRate?: number
  onData: (listener: (chunk: Buffer) => void) => void
  onClose: (listener: (error?: Error) => void) => void
  close: () => Promise<void>
}

export async function openPortSource(
  record: PortRecord,
  baudRate: number
): Promise<BridgeSource> {
  const port = new SerialPort({ path: record.path, baudRate, autoOpen: false, lock: true })
  await openPort(port)
  return {
    path: record.path,
    baudRate,
    onData: (listener) => {
      port.on('data', listener)
    },
    onClose: (listener) => {
      port.once('close', () => listener())
      port.on('error', (error) => listener(error))
    },
    close: () => closePort(port)
  }
}
