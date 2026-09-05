import type { PitrigDebugApi } from '../shared/debug-ipc'

declare global {
  interface Window {
    pitrig: PitrigDebugApi
  }
}

export {}
