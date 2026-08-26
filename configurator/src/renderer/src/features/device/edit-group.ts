import { useDeviceStore } from './device-store'

export function withEditGroup<T>(work: () => T): T {
  const { beginEdit, endEdit } = useDeviceStore.getState()
  beginEdit()
  try {
    return work()
  } finally {
    endEdit()
  }
}
