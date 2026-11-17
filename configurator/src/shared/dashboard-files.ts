import type { DeviceConfiguration } from './device'

export const DASHBOARD_FILE_INSPECT_CHANNEL = 'dashboard-file:inspect' as const
export const DASHBOARD_FILE_SAVE_CHANNEL = 'dashboard-file:save' as const

export const DASHBOARD_FILE_EXTENSION = 'pitrigdash'
export const DASHBOARD_FILE_MAGIC = 'PTRGDASH'
export const DASHBOARD_FILE_CONTAINER_VERSION = 1
export const DASHBOARD_FILE_FORMAT_VERSION = 2
export const MAXIMUM_DASHBOARD_FILE_SIZE = 32 * 1024 * 1024

export type SharedFontSource = 'builtin' | 'google' | 'embedded' | 'missing'

export interface DashboardShareRequest {
  json: string
  name: string
  description?: string
}

export interface DashboardShareSummary {
  images: { id: string; included: boolean }[]
  fonts: { id: string; source: SharedFontSource }[]
  estimatedBytes: number
}

export interface DashboardShareSaveValue {
  saved: boolean
  fileName?: string
  bytes?: number
  missingImages?: string[]
  missingFonts?: string[]
}

export interface RenamedAsset {
  from: string
  to: string
}

export interface DashboardOpenReport {
  imagesAdded: string[]
  imagesRenamed: RenamedAsset[]
  imagesMissing: string[]
  fontsAdded: string[]
  fontsRenamed: RenamedAsset[]
  fontsMissing: string[]
  failures: string[]
}

export interface OpenedDashboard {
  name: string
  description?: string
  configuration: DeviceConfiguration
  report: DashboardOpenReport
}

export interface DashboardFileError {
  code: 'invalid_request' | 'invalid_file' | 'newer_file' | 'read_failed' | 'write_failed'
  message: string
}

export type DashboardFileResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: DashboardFileError }

export function emptyOpenReport(): DashboardOpenReport {
  return {
    imagesAdded: [],
    imagesRenamed: [],
    imagesMissing: [],
    fontsAdded: [],
    fontsRenamed: [],
    fontsMissing: [],
    failures: []
  }
}
