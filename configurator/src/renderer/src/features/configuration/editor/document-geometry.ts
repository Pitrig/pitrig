import { screensOf, type WidgetParent } from '@shared/configuration-access'
import type { WidgetConfiguration, WidgetPlacement } from '@shared/configuration-schema'
import { type DeviceConfiguration } from '@shared/device'
import { ancestorsOf, findWidget } from './document'

// Where a widget's box lands on the display. Geometry inside a container is
// authored relative to that container, so everything the canvas does passes
// through these to add the chain on the way out and subtract it on the way in.

/**
 * Where a widget's parent sits on the display. Geometry inside a container is
 * relative to that container's box, so the canvas — which works entirely in
 * display coordinates — adds this on the way out and subtracts it on the way
 * in. Containers nest, so this is the sum of the whole chain rather than one
 * box. A slot page contributes nothing of its own: it is the slot's box, and
 * the slot is already in the chain.
 */
export function parentOffset(
  configuration: DeviceConfiguration | undefined,
  id: string
): { x: number; y: number } {
  const location = findWidget(configuration, id)
  if (!configuration || !location) return { x: 0, y: 0 }
  return ancestorsOf(configuration, location).reduce(
    (offset, ancestor) => {
      const box = completePlacement(ancestor.placement)
      return box ? { x: offset.x + box.x, y: offset.y + box.y } : offset
    },
    { x: 0, y: 0 }
  )
}

/** A widget's box in display coordinates, whatever parent it was authored in. */
export function absolutePlacement(
  configuration: DeviceConfiguration | undefined,
  id: string
): Required<WidgetPlacement> | undefined {
  const box = completePlacement(findWidget(configuration, id)?.widget.placement)
  if (!box) return undefined
  const offset = parentOffset(configuration, id)
  return { ...box, x: box.x + offset.x, y: box.y + offset.y }
}

/**
 * Every widget's box in display coordinates, from one walk of the document.
 *
 * `absolutePlacement` answers for one widget and costs two tree searches to do
 * it, so a canvas that asks per selected widget, per widget with an action and
 * again for every layer it draws pays O(n) walks per render. Same inputs, same
 * answers, one walk — this is a cheaper route to the identical result, not a
 * different rule.
 *
 * The two subtleties it shares with the per-widget walk: a container whose own
 * box is incomplete contributes nothing to its children's offset, and a slot
 * page contributes nothing at all because the slot above it already did.
 */
export function absolutePlacements(
  configuration: DeviceConfiguration | undefined
): Map<string, Required<WidgetPlacement>> {
  const placements = new Map<string, Required<WidgetPlacement>>()
  const visit = (parent: WidgetParent, offset: { x: number; y: number }): void => {
    for (const widget of parent.widgets ?? []) {
      if (!widget) continue
      const box = completePlacement(widget.placement)
      // First match wins, as the search does: a duplicated id resolves to the
      // widget the rest of the editor would have found.
      if (box && widget.id !== undefined && !placements.has(widget.id)) {
        placements.set(widget.id, { ...box, x: box.x + offset.x, y: box.y + offset.y })
      }
      if (widget.type !== 'shape' && widget.type !== 'slot') continue
      const inside = box ? { x: offset.x + box.x, y: offset.y + box.y } : offset
      if (widget.type === 'shape') {
        visit(widget, inside)
        continue
      }
      for (const page of widget.pages ?? []) {
        if (page) visit(page, inside)
      }
    }
  }
  for (const screen of screensOf(configuration)) {
    if (screen) visit(screen, { x: 0, y: 0 })
  }
  return placements
}

/**
 * The container holding whatever is selected, or undefined at screen level.
 * A child is drawn above its parent, so clicking a full container always lands
 * on a child; this is what lets the editor walk back up to the parent.
 */

export function completePlacement(
  placement: WidgetPlacement | undefined
): Required<WidgetPlacement> | undefined {
  if (
    !placement ||
    !Number.isFinite(placement.x) ||
    !Number.isFinite(placement.y) ||
    !Number.isFinite(placement.width) ||
    !Number.isFinite(placement.height) ||
    (placement.width ?? 0) <= 0 ||
    (placement.height ?? 0) <= 0
  ) {
    return undefined
  }
  return placement as Required<WidgetPlacement>
}

/** Writes a display-space box back into the widget's own coordinate space. */
export function writePlacement(
  widget: WidgetConfiguration,
  placement: Required<WidgetPlacement>,
  offset: { x: number; y: number }
): void {
  widget.placement = { ...placement, x: placement.x - offset.x, y: placement.y - offset.y }
}
