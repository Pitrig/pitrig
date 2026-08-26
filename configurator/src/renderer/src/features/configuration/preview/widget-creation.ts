import type { WidgetPlacement } from '@shared/configuration-schema'

import { NEW_WIDGET_SIZE, addTapZone, addWidget, draftValueFont, useDashboardEditorStore, type WidgetSelection } from '../dashboard-editor'
import type { CanvasTool } from '../editor/store'
import { useDeviceStore } from '@/features/device/device-store'

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
