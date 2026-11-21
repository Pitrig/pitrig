import { randomUUID } from 'node:crypto'

import { SerialPort } from 'serialport'

import type { SerialPortSummary } from '../../shared/device'

export interface PortRecord {
  path: string
  likelyUsb: boolean
  bluetooth: boolean
  scanPriority: number
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
        const manufacturer = deviceManufacturer(port)
        const displayName = manufacturer ? `${manufacturer} — ${port.path}` : port.path
        const summary: SerialPortSummary = {
          id,
          path: port.path,
          displayName,
          ...(manufacturer ? { manufacturer } : {}),
          ...(port.vendorId ? { vendorId: port.vendorId } : {}),
          ...(port.productId ? { productId: port.productId } : {}),
          ...(port.serialNumber ? { serialNumber: port.serialNumber } : {})
        }
        const usb = usbIdentity(port)
        const record: PortRecord = {
          path: port.path,
          likelyUsb: isLikelyUsbSerial(port, usb),
          bluetooth: isBluetoothPort(port),
          scanPriority: scanPriorityOf(usb),
          summary
        }
        this.records.set(id, record)
        return record
      })
  }
}

export function serialIdentity(path: string): string {
  return path
    .replace(/^\/dev\/cu\./, '/dev/serial.')
    .replace(/^\/dev\/tty\./, '/dev/serial.')
}

function prefersCalloutPath(candidate: string, current: string): boolean {
  return candidate.startsWith('/dev/cu.') && current.startsWith('/dev/tty.')
}

const PITRIG_USB_IDENTITY = '303a:4001'
const USB_SERIAL_JTAG_IDENTITY = '303a:1001'
const USB_BRIDGE_IDENTITIES: readonly string[] = ['1a86:7523', '1a86:55d4', '10c4:ea60']

function usbIdentity(port: { vendorId?: string; productId?: string }): string {
  return `${port.vendorId ?? ''}:${port.productId ?? ''}`.toLowerCase()
}

function scanPriorityOf(usb: string): number {
  if (usb === PITRIG_USB_IDENTITY) return 0
  return USB_BRIDGE_IDENTITIES.includes(usb) ? 1 : 2
}

function isBluetoothPort(port: { path: string; pnpId?: string }): boolean {
  return (
    port.path.toLowerCase().includes('bluetooth') ||
    (port.pnpId ?? '').toUpperCase().startsWith('BTHENUM')
  )
}

function isLikelyUsbSerial(port: { path: string; vendorId?: string }, usb: string): boolean {
  if (usb === USB_SERIAL_JTAG_IDENTITY) return false
  if (process.platform === 'win32') return Boolean(port.vendorId)
  const name = port.path.toLowerCase()
  return (
    Boolean(port.vendorId) || /usb|ttyacm|ttyusb|wch|slab/.test(name) || /^com\d+$/i.test(port.path)
  )
}

const WINDOWS_USB_MANUFACTURERS: Readonly<Record<string, string>> = {
  [PITRIG_USB_IDENTITY]: 'Pitrig',
  [USB_SERIAL_JTAG_IDENTITY]: 'Espressif'
}

function deviceManufacturer(port: {
  manufacturer?: string
  vendorId?: string
  productId?: string
}): string | undefined {
  if (process.platform !== 'win32') return port.manufacturer
  return WINDOWS_USB_MANUFACTURERS[usbIdentity(port)] ?? port.manufacturer
}
