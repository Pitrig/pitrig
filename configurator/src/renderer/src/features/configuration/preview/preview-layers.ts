import { pagesOf, stackOrder, widgetsOf, type WidgetParent } from '@shared/configuration-access'
import type { ScreenConfiguration } from '@shared/configuration-schema'

import { completePlacement } from '../dashboard-editor'
import { clipsChildren, intersection, visibleSlotPage, type PreviewLayer, type Placement } from './canvas-geometry'

/**
 * One screen's widgets flattened into draw order, in display coordinates.
 *
 * The canvas works entirely in display coordinates. Geometry inside a container
 * is relative to that container's box, so it is translated here on the way out
 * and translated back before anything is written to the document.
 *
 * The same walk collects what each widget is cut down to: a container that
 * clips hands its own box to everything below it, and a nested one hands down
 * the intersection. A container carries its parent's clip rather than its own,
 * because the device draws a widget's frame and caption on its parent — which
 * is why a shape's border and title survive its own clip.
 *
 * Same rule the firmware applies: z_index ascending, authored array order
 * breaking ties, one parent at a time. A container is one entry among its own
 * siblings and orders its children within itself, so emitting each container
 * immediately followed by its children reproduces LVGL's draw order at any
 * depth — a parent, then what is inside it, then the parent's later siblings.
 */
export function flattenScreen(
  screen: ScreenConfiguration | undefined,
  slotPage: Record<string, number>
): PreviewLayer[] {
  const emit = (
    parent: WidgetParent,
    offsetX: number,
    offsetY: number,
    clip: Placement | undefined
  ): PreviewLayer[] =>
    stackOrder(widgetsOf(parent)).flatMap(({ widget, index }) => {
      const layer: PreviewLayer = {
        configuration: widget,
        zIndex: widget.z_index ?? 0,
        configurationOrder: index,
        offsetX,
        offsetY,
        clip
      }
      const box = completePlacement(widget.placement)
      // A container with no readable box cuts nothing down: it contributes no
      // offset either, so pretending it clips would hide its children at the
      // screen's corner.
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
        emit(owner, offsetX + (box?.x ?? 0), offsetY + (box?.y ?? 0), within)
      if (widget.type === 'shape') return [layer, ...inside(widget)]
      if (widget.type !== 'slot') return [layer]
      // The board shows one page of a slot; the canvas has to author all of
      // them, so it draws the one the tabs are looking at and leaves the rest
      // out rather than stacking a slot's pages on top of each other.
      const page = pagesOf(widget)[visibleSlotPage(widget, slotPage)]
      return page ? [layer, ...inside(page)] : [layer]
    })
  return screen ? emit(screen, 0, 0, undefined) : []
}
