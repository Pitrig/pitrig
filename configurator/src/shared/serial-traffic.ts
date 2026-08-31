export interface SerialTrafficLog {
  direction: 'rx' | 'tx'
  path: string
  baudRate: number
  data: string
  encoding?: 'utf8' | 'hex'
}
