import type { DeviceConfiguration } from '@shared/device'

import { ancestorsOf, findWidget } from '../dashboard-editor'

export function outermostOf(
  configuration: DeviceConfiguration | undefined,
  ids: readonly string[],
  within: ReadonlySet<string> = new Set(ids)
): string[] {
  return ids.filter((id) => {
    const location = findWidget(configuration, id)
    return (
      location !== undefined &&
      !ancestorsOf(configuration, location).some(
        (ancestor) => ancestor.id !== undefined && within.has(ancestor.id)
      )
    )
  })
}
