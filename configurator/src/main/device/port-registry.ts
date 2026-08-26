import { randomUUID } from 'node:crypto'

import { SerialPort } from 'serialport'

import type { SerialPortSummary } from '../../shared/device'

export interface PortRecord {
  path: string
  likelyUsb: boolean
  summary: SerialPortSummary
}

export class PortRegistry {
  private readonly records = new Map<string, PortRecord>()

  get(id: string): PortRecord | undefined {
    return this.records.get(id)
  }

  async refresh(): Promise<PortRecord[]> {
    const discovered = await SerialPort.list()
    const unique = new Map<string, (typeof discovered)[number]>()

    for (const port of discovered) {
      const identity = serialIdentity(port.path)
      const current = unique.get(identity)
      if (!current || prefersCalloutPath(port.path, current.path)) {
        unique.set(identity, port)
      }
    }

    const existingIds = new Map<string, string>()
    for (const record of this.records.values()) {
      existingIds.set(serialIdentity(record.path), record.summary.id)
    }

    this.records.clear()
    return [...unique.values()]
      .sort((left, right) => left.path.localeCompare(right.path))
      .map((port): PortRecord => {
        const identity = serialIdentity(port.path)
        const id = existingIds.get(identity) ?? randomUUID()
        const displayName = port.manufacturer
          ? `${port.manufacturer} — ${port.path}`
          : port.path
        const summary: SerialPortSummary = {
          id,
          path: port.path,
          displayName,
          ...(port.manufacturer ? { manufacturer: port.manufacturer } : {}),
          ...(port.vendorId ? { vendorId: port.vendorId } : {}),
          ...(port.productId ? { productId: port.productId } : {}),
          ...(port.serialNumber ? { serialNumber: port.serialNumber } : {})
        }
        const record: PortRecord = {
          path: port.path,
          likelyUsb: isLikelyUsbSerial(port.path, port.vendorId),
          summary
        }
        this.records.set(id, record)
        return record
      })
  }
}

export function isBluetoothPort(path: string): boolean {
  return path.toLowerCase().includes('bluetooth')
}

export function serialIdentity(path: string): string {
  return path
    .replace(/^\/dev\/cu\./, '/dev/serial.')
    .replace(/^\/dev\/tty\./, '/dev/serial.')
}

function prefersCalloutPath(candidate: string, current: string): boolean {
  return candidate.startsWith('/dev/cu.') && current.startsWith('/dev/tty.')
}

function isLikelyUsbSerial(path: string, vendorId?: string): boolean {
  const name = path.toLowerCase()
  return Boolean(vendorId) || /usb|ttyacm|ttyusb|wch|slab/.test(name) || /^com\d+$/i.test(path)
}
