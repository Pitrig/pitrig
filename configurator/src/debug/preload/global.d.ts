import type { SimCoreDebugApi } from '../shared/debug-ipc'

declare global {
  interface Window {
    simcore: SimCoreDebugApi
  }
}

export {}
