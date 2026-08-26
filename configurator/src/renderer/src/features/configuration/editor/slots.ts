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
    if (!slot) return
    const pages = (slot.pages ??= [])
    if (pages.length >= MAXIMUM_SLOT_PAGES) return
    pages.push({})
    useDashboardEditorStore.getState().setSlotPage(slotId, pages.length - 1)
  })
}

export function deleteSlotPage(slotId: string, page: number): void {
  mutateDraftConfiguration((configuration) => {
    const slot = slotOf(configuration, slotId)
    const pages = slot?.pages
    if (!pages || pages.length <= 1 || page < 0 || page >= pages.length) return
    pages.splice(page, 1)
    useDashboardEditorStore.getState().setSlotPage(slotId, Math.min(page, pages.length - 1))
  })
}

export function mutateSlotPage(
  slotId: string,
  page: number,
  mutation: (page: SlotPageConfiguration) => void
): void {
  mutateDraftConfiguration((configuration) => {
    const target = slotOf(configuration, slotId)?.pages?.[page]
    if (target) mutation(target)
  })
}
