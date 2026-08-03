export const DEVELOPMENT_SERIAL_TRAFFIC_CHANNEL = 'development:serial-traffic' as const

export interface SerialTrafficLog {
  direction: 'rx' | 'tx'
  path: string
  baudRate: number
  data: string
}
