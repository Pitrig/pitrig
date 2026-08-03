export const APP_GET_INFO_CHANNEL = 'app:get-info' as const

export interface AppInfo {
  name: string
  version: string
  platform: string
}

export interface SimCoreApi {
  getAppInfo: () => Promise<AppInfo>
}
