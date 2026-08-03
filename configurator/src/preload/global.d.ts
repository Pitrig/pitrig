import type { SimCoreApi } from '../shared/ipc'

declare global {
  interface Window {
    simcore: SimCoreApi
  }
}

export {}
