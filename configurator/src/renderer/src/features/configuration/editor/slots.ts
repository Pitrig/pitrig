import {
  MAXIMUM_SLOT_PAGES,
  type SlotPageConfiguration,
  type SlotWidgetConfiguration
} from '@shared/configuration-schema'
import { type DeviceConfiguration } from '@shared/device'
import { findWidget, mutateDraftConfiguration } from './document'
import { useDashboardEditorStore } from './store'

// The pages of one slot. A page is not a widget — it has no id, no box and no
// style — so none of the widget commands reach one, and its own handful of
// edits live here rather than being special cases inside them.

/** The slot a page command applies to: the live record inside the draft. */
function slotOf(
  configuration: DeviceConfiguration,
  slotId: string
): SlotWidgetConfiguration | undefined {
  const widget = findWidget(configuration, slotId)?.widget
  return widget?.type === 'slot' ? widget : undefined
}

/** Adds a page at the end and looks at it, which is what adding one is for. */
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

/**
 * Deletes a page and everything authored on it. The last page is kept: a slot
 * with no pages is a document the device refuses, and deleting the slot itself
 * is what the author means by that.
 */
export function deleteSlotPage(slotId: string, page: number): void {
  mutateDraftConfiguration((configuration) => {
    const slot = slotOf(configuration, slotId)
    const pages = slot?.pages
    if (!pages || pages.length <= 1 || page < 0 || page >= pages.length) return
    pages.splice(page, 1)
    useDashboardEditorStore.getState().setSlotPage(slotId, Math.min(page, pages.length - 1))
  })
}

/** Edits one page in place, the way mutateSelectedWidget edits one widget. */
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
