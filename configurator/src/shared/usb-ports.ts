export const PITRIG_USB_IDENTITY = '303a:4001'
export const USB_SERIAL_JTAG_IDENTITY = '303a:1001'
export const USB_BRIDGE_IDENTITIES: readonly string[] = ['1a86:7523', '1a86:55d4', '10c4:ea60']

export type UsbPortKind = 'pitrig' | 'usb_jtag' | 'bridge' | 'other'

export function usbIdentity(port: { vendorId?: string; productId?: string }): string {
  return `${port.vendorId ?? ''}:${port.productId ?? ''}`.toLowerCase()
}

export function usbPortKind(port: { vendorId?: string; productId?: string }): UsbPortKind {
  const identity = usbIdentity(port)
  if (identity === PITRIG_USB_IDENTITY) return 'pitrig'
  if (identity === USB_SERIAL_JTAG_IDENTITY) return 'usb_jtag'
  return USB_BRIDGE_IDENTITIES.includes(identity) ? 'bridge' : 'other'
}
