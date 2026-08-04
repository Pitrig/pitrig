import { create } from 'zustand'

import type { DeviceSession, DeviceStatus } from '../../../../shared/device'

interface DeviceStore {
  status: DeviceStatus
  session?: DeviceSession
  applyDeviceState: (status: DeviceStatus, session?: DeviceSession) => void
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  status: 'disconnected',
  applyDeviceState: (status, session) => set({ status, session })
}))
