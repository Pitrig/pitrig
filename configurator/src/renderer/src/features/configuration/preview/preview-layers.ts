import { pagesOf, stackOrder, widgetsOf, type WidgetParent } from '@shared/configuration-access'
import type { ScreenConfiguration, WidgetConfiguration } from '@shared/configuration-schema'

import { completePlacement } from '../dashboard-editor'
import { clipsChildren, intersection, visibleSlotPage, type PreviewLayer, type Placement } from './canvas-geometry'
import { SCREEN_BACKGROUND } from './preview-theme'
import { normalizeColor } from './preview-values'

function paintsBehindChildren(widget: WidgetConfiguration): string | undefined {
  if (widget.type === 'slot' || (widget.background_inset_px ?? 0) !== 0) return undefined
  const background = normalizeColor(widget.background_color)
  return background === undefined || background === 'transparent' ? undefined : background
}

export function flattenScreen(
  screen: ScreenConfiguration | undefined,
  slotPage: Record<string, number>,
  background: string = SCREEN_BACKGROUND
): PreviewLayer[] {
  const emit = (
    parent: WidgetParent,
    offsetX: number,
    offsetY: number,
    clip: Placement | undefined,
    parentId: string | undefined,
    behind: string
  ): PreviewLayer[] =>
    stackOrder(widgetsOf(parent)).flatMap(({ widget, index }) => {
      const layer: PreviewLayer = {
        configuration: widget,
        zIndex: widget.z_index ?? 0,
        configurationOrder: index,
        parentId,
        offsetX,
        offsetY,
        clip,
        behind
      }
      const box = completePlacement(widget.placement)
      const onDisplay =
        box && clipsChildren(widget)
          ? { ...box, x: box.x + offsetX, y: box.y + offsetY }
          : undefined
      const within = onDisplay
        ? clip
          ? intersection(clip, onDisplay)
          : onDisplay
        : clip
      const inside = (owner: WidgetParent): PreviewLayer[] =>
        emit(owner, offsetX + (box?.x ?? 0), offsetY + (box?.y ?? 0), within, widget.id,
             paintsBehindChildren(widget) ?? behind)
      if (widget.type === 'shape') return [layer, ...inside(widget)]
      if (widget.type !== 'slot') return [layer]
      const page = pagesOf(widget)[visibleSlotPage(widget, slotPage)]
      return page ? [layer, ...inside(page)] : [layer]
    })
  return screen ? emit(screen, 0, 0, undefined, undefined, background) : []
}
