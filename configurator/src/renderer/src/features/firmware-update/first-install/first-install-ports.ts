import type { PitrigBoardId, SerialPortSummary } from '@shared/device'
import { usbIdentity, usbPortKind, type UsbPortKind } from '@shared/usb-ports'

const CH340_IDENTITY = '1a86:7523'

const INSTALL_PORTS: Record<PitrigBoardId, readonly UsbPortKind[]> = {
  t_display_s3: ['usb_jtag', 'pitrig'],
  guition_esp32_4848s040: ['bridge', 'other'],
  guition_jc1060p470c: ['usb_jtag'],
  esp32s3_devkit: ['usb_jtag', 'bridge', 'other']
}

export function usbPorts(ports: readonly SerialPortSummary[]): SerialPortSummary[] {
  return ports.filter((port) => port.vendorId !== undefined)
}

export function preferredPort(
  ports: readonly SerialPortSummary[],
  board: PitrigBoardId | undefined
): SerialPortSummary | undefined {
  if (ports.length === 1) return ports[0]
  if (!board) return undefined
  const kinds = INSTALL_PORTS[board]
  const fitting = ports.filter((port) => kinds.includes(usbPortKind(port)))
  return fitting.length === 1 ? fitting[0] : undefined
}

export function suggestedBoard(port: SerialPortSummary | undefined): PitrigBoardId | undefined {
  return port && usbIdentity(port) === CH340_IDENTITY ? 'guition_esp32_4848s040' : undefined
}
