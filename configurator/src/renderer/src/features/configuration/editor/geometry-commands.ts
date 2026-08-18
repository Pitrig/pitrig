import type { WidgetPlacement } from '@shared/configuration-schema'

import { findWidget, mutateDraftConfiguration, parentOffset, writePlacement } from './document'
import { clampToDisplay } from './placement'

/** One widget being dragged along with the primary, at the box it started at. */
export interface DragFollower {
  id: string
  placement: Required<WidgetPlacement>
}

/**
 * Moves the primary widget to `placement` and carries its followers by the
 * same shift, in one document edit.
 *
 * Everything here is in display coordinates and written back in each widget's
 * own parent space, which is what makes a drag inside a container behave like
 * a drag on the screen. Followers are clamped to the display; the primary is
 * not, because the caller has already resolved it against the snap targets.
 *
 * This lived inside the canvas component's pointer handler, so the document
 * was mutated from a render function and the rule for where a dragged widget
 * lands was not anywhere an editor command could find it.
 */
export function moveSelection(
  primaryId: string,
  placement: Required<WidgetPlacement>,
  shift: { x: number; y: number },
  followers: readonly DragFollower[],
  display: { width: number; height: number }
): void {
  mutateDraftConfiguration((draft) => {
    const primary = findWidget(draft, primaryId)
    if (primary) {
      writePlacement(primary.widget, placement, parentOffset(draft, primaryId))
    }
    for (const follower of followers) {
      const widget = findWidget(draft, follower.id)?.widget
      if (!widget) continue
      const onDisplay = clampToDisplay(
        follower.placement.x + shift.x,
        follower.placement.y + shift.y,
        follower.placement.width,
        follower.placement.height,
        display
      )
      writePlacement(
        widget,
        { ...follower.placement, ...onDisplay },
        parentOffset(draft, follower.id)
      )
    }
  })
}
