import { useMemo } from 'react'

import { descendantsOf, pagesOf, widgetsOf } from '@shared/configuration-access'
import type { DeviceConfiguration } from '@shared/device'

import { findWidget } from '../dashboard-editor'
import { type PreviewLayer, visibleSlotPage } from './canvas-geometry'

export function useHiddenLayers(
  layers: readonly PreviewLayer[],
  hidden: Record<string, boolean>
): Record<string, boolean> {
  return useMemo(() => {
    const effective: Record<string, boolean> = { ...hidden }
    for (const layer of layers) {
      const id = layer.configuration.id
      if (id === undefined || layer.parentId === undefined) continue
      if (effective[layer.parentId]) effective[id] = true
    }
    return effective
  }, [layers, hidden])
}

export function useOpenedSlot(
  configuration: DeviceConfiguration,
  drillIn: string | undefined,
  slotPage: Record<string, number>
): { isolated: string | undefined; opened: ReadonlySet<string> } {
  return useMemo(() => {
    const opened = drillIn ? findWidget(configuration, drillIn)?.widget : undefined
    if (opened?.type !== 'slot') return { isolated: undefined, opened: new Set<string>() }
    const page = pagesOf(opened)[visibleSlotPage(opened, slotPage)]
    return {
      isolated: drillIn,
      opened: new Set(
        (page ? widgetsOf(page).flatMap(descendantsOf) : [])
          .map((widget) => widget.id)
          .filter((id): id is string => id !== undefined)
      )
    }
  }, [configuration, drillIn, slotPage])
}
