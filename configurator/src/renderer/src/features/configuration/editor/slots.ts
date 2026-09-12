import {
  MAXIMUM_SLOT_PAGES,
  type SlotPageConfiguration,
  type SlotWidgetConfiguration
} from '@shared/configuration-schema'
import { type DeviceConfiguration } from '@shared/device'
import { findWidget, mutateDraftConfiguration } from './document'
import { useDashboardEditorStore } from './store'

function slotOf(
  configuration: DeviceConfiguration,
  slotId: string
): SlotWidgetConfiguration | undefined {
  const widget = findWidget(configuration, slotId)?.widget
  return widget?.type === 'slot' ? widget : undefined
}

export function addSlotPage(slotId: string): void {
  mutateDraftConfiguration((configuration) => {
    const slot = slotOf(configuration, slotId)
    if (!slot) return false
    const pages = (slot.pages ??= [])
    if (pages.length >= MAXIMUM_SLOT_PAGES) return false
    pages.push({})
    useDashboardEditorStore.getState().setSlotPage(slotId, pages.length - 1)
    return true
  })
}

export function deleteSlotPage(slotId: string, page: number): void {
  mutateDraftConfiguration((configuration) => {
    const slot = slotOf(configuration, slotId)
    const pages = slot?.pages
    if (!pages || pages.length <= 1 || page < 0 || page >= pages.length) return false
    pages.splice(page, 1)
    const remaining = pages[0]
    if (remaining && !pages.some((entry) => entry.in_loop !== false)) delete remaining.in_loop
    useDashboardEditorStore.getState().setSlotPage(slotId, Math.min(page, pages.length - 1))
    return true
  })
}

export function mutateSlotPage(
  slotId: string,
  page: number,
  mutation: (page: SlotPageConfiguration) => void
): void {
  mutateDraftConfiguration((configuration) => {
    const target = slotOf(configuration, slotId)?.pages?.[page]
    if (!target) return false
    mutation(target)
    return true
  })
}
