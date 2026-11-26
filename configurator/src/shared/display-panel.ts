export const DEVICE_DISPLAY_PANEL_SET_CHANNEL = 'device:display-panel:set' as const

export const DISPLAY_PANELS = ['original', 'since2026'] as const
export type DisplayPanel = (typeof DISPLAY_PANELS)[number]

export type DeviceDisplayPanel = number | 'check'

export type SessionDisplayPanel = DeviceDisplayPanel | 'unsupported'

export interface DeviceDisplayPanelRequest {
  panel: DeviceDisplayPanel
}
