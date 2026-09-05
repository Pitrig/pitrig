import type { PitrigApi } from '../shared/ipc'

declare global {
  interface Window {
    pitrig: PitrigApi
  }
}

export {}
