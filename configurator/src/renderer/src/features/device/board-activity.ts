import type { DeviceActivity } from '@shared/device'
import { t } from '@shared/ui-text'
import { useDeviceStore } from './device-store'

export function activityReason(activity: DeviceActivity | undefined): string | undefined {
  return activity === undefined ? undefined : t(`device.linkOwner.busy.${activity}`)
}

export function useBoardActivityReason(): string | undefined {
  return activityReason(useDeviceStore((state) => state.activity))
}
