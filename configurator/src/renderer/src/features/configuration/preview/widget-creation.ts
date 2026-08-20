import type { WidgetPlacement } from '@shared/configuration-schema'

import { NEW_WIDGET_SIZE, addTapZone, addWidget, draftValueFont, useDashboardEditorStore, type WidgetSelection } from '../dashboard-editor'
import type { CanvasTool } from '../editor/store'
import { useDeviceStore } from '@/features/device/device-store'

/**
 * Creating a widget, from wherever the author asked for one: a tool drawing a
 * box on the canvas, a button in the toolbar, an entry in the context menu.
 *
 * What the three share is everything except the box — the family the dashboard
 * already draws with, an image that is actually installed, and the tap zone
 * being a shape rather than a type of its own. Written once so a widget created
 * by drawing is the same widget as one created by clicking.
 */
export function createWidget(
  tool: Exclude<CanvasTool, 'select'>,
  display: { width: number; height: number },
  options: { placement?: Required<WidgetPlacement>; into?: string | 'screen' } = {}
): WidgetSelection | undefined {
  const { draft, session } = useDeviceStore.getState()
  if (tool === 'tap_zone') {
    const id = addTapZone(display, options)
    return id ? { type: 'widget', id } : undefined
  }
  const family = useDashboardEditorStore.getState().defaultFontFamily
  return addWidget(tool, display, {
    font: draftValueFont(draft, family),
    image: session?.imageAssets?.images[0]?.name,
    ...options
  })
}

/**
 * The box a tool creates when the pointer was clicked rather than dragged: the
 * kind's own size, centred where the click landed and kept on the display.
 */
export function defaultToolBox(
  tool: Exclude<CanvasTool, 'select'>,
  at: { x: number; y: number },
  display: { width: number; height: number }
): Required<WidgetPlacement> {
  const size = tool === 'tap_zone' ? { width: 96, height: 96 } : NEW_WIDGET_SIZE[tool]
  const width = Math.min(size.width, display.width)
  const height = Math.min(size.height, display.height)
  return {
    x: Math.round(Math.min(Math.max(at.x - width / 2, 0), display.width - width)),
    y: Math.round(Math.min(Math.max(at.y - height / 2, 0), display.height - height)),
    width,
    height
  }
}
